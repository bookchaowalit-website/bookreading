"""Outbound fetch guard for user-supplied URLs (SSRF protection).

``/scrape`` and ``/chapter`` fetch a URL chosen by the caller and return the
page text, so without a guard they are a full-read SSRF: any internal service,
``localhost`` admin port or cloud metadata endpoint could be read through them.

Every outbound fetch for those endpoints goes through :func:`safe_get`:

* only ``http``/``https`` on the default ports, no ``user:pass@`` userinfo;
* the host must be one of the supported novel sites (or a subdomain), plus any
  extra hosts an operator lists in ``SCRAPE_EXTRA_ALLOWED_HOSTS``;
* the host is resolved and **every** address must be globally routable
  (private, loopback, link-local/metadata, CGNAT, multicast, reserved and
  unspecified ranges are refused, including IPv4-mapped IPv6);
* redirects are never followed automatically: each ``Location`` hop is
  re-validated with the same rules, up to :data:`MAX_REDIRECTS`;
* the body is streamed and cut off at :data:`MAX_RESPONSE_BYTES`, with
  bounded connect/read timeouts.

Known residual risk: the check resolves DNS separately from httpx, so a
rebinding DNS server could still answer differently for the real connection.
The host allow-list is the primary control; pinning the connection to the
validated address is tracked in docs/UPGRADE-PLAN.md.
"""

from __future__ import annotations

import asyncio
import ipaddress
import os
import socket
from urllib.parse import urljoin, urlsplit

import httpx

from site_routing import host_matches, url_host

# Hosts the novel scrapers understand (see site_routing.detect_novel_source).
SUPPORTED_NOVEL_DOMAINS: tuple[str, ...] = (
    # Korean
    "munpia.com",
    "ridibooks.com",
    "series.naver.com",
    "page.kakao.com",
    "novelpia.com",
    # Chinese
    "piaotia.com",
    "ptwxz.com",
    "qidian.com",
    "qidian.qq.com",
    "69shu.com",
    "zongheng.com",
    "17k.com",
)

MAX_REDIRECTS = 5
MAX_RESPONSE_BYTES = 5 * 1024 * 1024
FETCH_TIMEOUT = httpx.Timeout(connect=10.0, read=20.0, write=10.0, pool=10.0)
# Wall-clock budget for one fetch including redirects (slow-drip protection).
TOTAL_FETCH_SECONDS = 45.0

_ALLOWED_PORTS = {"http": 80, "https": 443}
# Carrier-grade NAT is not flagged by ``is_private`` on every Python version.
_EXTRA_BLOCKED = (ipaddress.ip_network("100.64.0.0/10"),)


class UnsafeURLError(ValueError):
    """The URL is not allowed to be fetched. The message is safe to return."""


def extra_allowed_hosts() -> tuple[str, ...]:
    raw = os.getenv("SCRAPE_EXTRA_ALLOWED_HOSTS", "")
    return tuple(h.strip().lower().rstrip(".") for h in raw.split(",") if h.strip())


def novel_allowed_domains() -> tuple[str, ...]:
    return SUPPORTED_NOVEL_DOMAINS + extra_allowed_hosts()


def is_public_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    if any(ip in net for net in _EXTRA_BLOCKED if ip.version == net.version):
        return False
    return ip.is_global and not ip.is_multicast


async def resolve_host(host: str, port: int) -> list[str]:
    """All addresses ``host`` resolves to. Tests monkeypatch this."""
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return [info[4][0] for info in infos]


def check_url_shape(url: str, allowed_domains: tuple[str, ...]) -> tuple[str, int]:
    """Validate scheme, port, userinfo and host allow-list. Returns (host, port)."""
    try:
        parts = urlsplit(url.strip())
        port = parts.port
    except ValueError as exc:
        raise UnsafeURLError("Invalid URL") from exc
    scheme = parts.scheme.lower()
    if scheme not in _ALLOWED_PORTS:
        raise UnsafeURLError("Only http and https URLs are supported")
    if parts.username is not None or parts.password is not None:
        raise UnsafeURLError("URLs with credentials are not supported")
    default_port = _ALLOWED_PORTS[scheme]
    if port not in (None, default_port):
        raise UnsafeURLError("Non-standard ports are not supported")
    host = url_host(url)
    if not host:
        raise UnsafeURLError("Invalid URL")
    try:
        ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        pass
    else:
        raise UnsafeURLError("IP-address URLs are not supported")
    if not any(host_matches(host, d) for d in allowed_domains):
        raise UnsafeURLError("This site is not supported")
    return host, default_port


async def validate_url(url: str, allowed_domains: tuple[str, ...]) -> None:
    """Raise :class:`UnsafeURLError` unless ``url`` is safe to fetch."""
    host, port = check_url_shape(url, allowed_domains)
    try:
        addresses = await resolve_host(host, port)
    except (OSError, UnicodeError) as exc:
        raise UnsafeURLError("Could not resolve host") from exc
    if not addresses or not all(is_public_ip(a) for a in addresses):
        raise UnsafeURLError("Host resolves to a non-public address")


async def _read_capped(response: httpx.Response, max_bytes: int) -> bytes:
    declared = response.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > max_bytes:
        raise UnsafeURLError("Response is too large")
    body = bytearray()
    async for chunk in response.aiter_bytes():
        body.extend(chunk)
        if len(body) > max_bytes:
            raise UnsafeURLError("Response is too large")
    return bytes(body)


async def _safe_get(
    client: httpx.AsyncClient,
    url: str,
    allowed_domains: tuple[str, ...],
    headers: dict[str, str] | None,
    max_bytes: int,
) -> httpx.Response:
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        await validate_url(current, allowed_domains)
        async with client.stream(
            "GET",
            current,
            headers=headers,
            follow_redirects=False,
            timeout=FETCH_TIMEOUT,
        ) as response:
            if response.is_redirect:
                location = response.headers.get("location", "")
                if not location:
                    raise UnsafeURLError("Redirect without a location")
                current = urljoin(current, location)
                continue
            response.raise_for_status()
            body = await _read_capped(response, max_bytes)
            return httpx.Response(
                response.status_code,
                headers=response.headers,
                content=body,
                request=response.request,
            )
    raise UnsafeURLError("Too many redirects")


async def safe_get(
    client: httpx.AsyncClient,
    url: str,
    *,
    allowed_domains: tuple[str, ...] | None = None,
    headers: dict[str, str] | None = None,
    max_bytes: int = MAX_RESPONSE_BYTES,
) -> httpx.Response:
    """GET ``url`` with the SSRF rules above and return a fully-read response.

    Raises :class:`UnsafeURLError` for a refused URL/redirect/oversized body and
    ``httpx.HTTPStatusError`` for a 4xx/5xx final response.
    """
    domains = allowed_domains if allowed_domains is not None else novel_allowed_domains()
    try:
        return await asyncio.wait_for(
            _safe_get(client, url, domains, headers, max_bytes),
            timeout=TOTAL_FETCH_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise UnsafeURLError("Fetch timed out") from exc
