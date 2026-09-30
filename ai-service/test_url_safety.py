"""SSRF guard for /scrape and /chapter (no network: DNS and HTTP are mocked)."""

import httpx
import pytest
from fastapi.testclient import TestClient

import main
import url_safety
from url_safety import UnsafeURLError, is_public_ip, safe_get, validate_url

PUBLIC_IP = "93.184.216.34"
NOVEL = ("piaotia.com", "qidian.com")


class DnsTable(dict):
    lookups: list[str]


@pytest.fixture
def dns(monkeypatch):
    """Map host -> list of addresses; unknown hosts fail to resolve."""
    table = DnsTable()
    table.lookups = lookups = []

    async def fake_resolve(host, port):
        lookups.append(host)
        if host not in table:
            raise OSError("NXDOMAIN")
        return table[host]

    monkeypatch.setattr(url_safety, "resolve_host", fake_resolve)
    return table


def mock_client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",
        "10.0.0.5",
        "172.16.3.4",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",
        "::1",
        "fe80::1",
        "fc00::1",
        "::ffff:127.0.0.1",
        "224.0.0.1",
        "not-an-ip",
    ],
)
def test_non_public_addresses_are_refused(ip):
    assert not is_public_ip(ip)


def test_public_address_is_allowed():
    assert is_public_ip(PUBLIC_IP)
    assert is_public_ip("2606:4700::1111")


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "gopher://www.piaotia.com/",
        "http://127.0.0.1/",
        "http://[::1]/",
        "http://169.254.169.254/latest/meta-data/",
        "https://user:pw@www.piaotia.com/",
        "https://www.piaotia.com:8080/",
        "https://evil.example/?u=piaotia.com",
        "https://piaotia.com.evil.example/",
        "http://localhost:8000/health",
        "not a url",
    ],
)
async def test_shape_and_allow_list_rejections(dns, url):
    with pytest.raises(UnsafeURLError):
        await validate_url(url, NOVEL)
    assert dns.lookups == []  # rejected before any DNS lookup


async def test_allowed_host_resolving_to_private_ip_is_refused(dns):
    dns["www.piaotia.com"] = [PUBLIC_IP, "10.0.0.7"]
    with pytest.raises(UnsafeURLError, match="non-public"):
        await validate_url("https://www.piaotia.com/html/1/", NOVEL)


async def test_unresolvable_host_is_refused(dns):
    with pytest.raises(UnsafeURLError, match="resolve"):
        await validate_url("https://www.piaotia.com/", NOVEL)


async def test_extra_hosts_from_env(dns, monkeypatch):
    dns["novels.example"] = [PUBLIC_IP]
    with pytest.raises(UnsafeURLError):
        await validate_url("https://novels.example/1", url_safety.novel_allowed_domains())
    monkeypatch.setenv("SCRAPE_EXTRA_ALLOWED_HOSTS", " Novels.Example , ")
    await validate_url("https://novels.example/1", url_safety.novel_allowed_domains())


async def test_safe_get_returns_body(dns):
    dns["www.piaotia.com"] = [PUBLIC_IP]

    def handler(request):
        return httpx.Response(200, text="<h1>ok</h1>")

    async with mock_client(handler) as client:
        response = await safe_get(client, "https://www.piaotia.com/a", allowed_domains=NOVEL)
    assert response.text == "<h1>ok</h1>"


async def test_redirect_to_internal_host_is_refused(dns):
    dns["www.piaotia.com"] = [PUBLIC_IP]
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest/"})

    async with mock_client(handler) as client:
        with pytest.raises(UnsafeURLError):
            await safe_get(client, "https://www.piaotia.com/a", allowed_domains=NOVEL)
    assert seen == ["https://www.piaotia.com/a"]  # metadata URL never requested


async def test_redirect_hop_is_revalidated_by_dns(dns):
    dns["www.piaotia.com"] = [PUBLIC_IP]
    dns["m.piaotia.com"] = ["192.168.0.10"]

    def handler(request):
        if request.url.host == "www.piaotia.com":
            return httpx.Response(301, headers={"location": "https://m.piaotia.com/a"})
        raise AssertionError("private hop must not be fetched")

    async with mock_client(handler) as client:
        with pytest.raises(UnsafeURLError, match="non-public"):
            await safe_get(client, "https://www.piaotia.com/a", allowed_domains=NOVEL)


async def test_allowed_relative_redirect_is_followed(dns):
    dns["www.piaotia.com"] = [PUBLIC_IP]

    def handler(request):
        if request.url.path == "/old":
            return httpx.Response(302, headers={"location": "/new"})
        return httpx.Response(200, text="moved")

    async with mock_client(handler) as client:
        response = await safe_get(client, "https://www.piaotia.com/old", allowed_domains=NOVEL)
    assert response.text == "moved"


async def test_redirect_loop_is_capped(dns):
    dns["www.piaotia.com"] = [PUBLIC_IP]
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(302, headers={"location": "/again"})

    async with mock_client(handler) as client:
        with pytest.raises(UnsafeURLError, match="redirects"):
            await safe_get(client, "https://www.piaotia.com/", allowed_domains=NOVEL)
    assert len(calls) == url_safety.MAX_REDIRECTS + 1


async def test_oversized_body_is_refused(dns):
    dns["www.piaotia.com"] = [PUBLIC_IP]

    def handler(request):
        return httpx.Response(200, content=b"x" * 2048)

    async with mock_client(handler) as client:
        with pytest.raises(UnsafeURLError, match="too large"):
            await safe_get(client, "https://www.piaotia.com/", allowed_domains=NOVEL, max_bytes=1024)


async def test_error_status_raises_http_status_error(dns):
    dns["www.piaotia.com"] = [PUBLIC_IP]

    async with mock_client(lambda r: httpx.Response(429)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            await safe_get(client, "https://www.piaotia.com/", allowed_domains=NOVEL)


@pytest.fixture
def api(dns):
    return TestClient(main.app)


@pytest.mark.parametrize("path", ["/scrape", "/chapter"])
@pytest.mark.parametrize(
    "url",
    [
        "http://169.254.169.254/latest/meta-data/",
        "http://localhost:8000/health",
        "http://internal-db:5432/",
        "https://example.com/novel/1",
        "file:///etc/passwd",
    ],
)
def test_endpoints_reject_unsupported_or_internal_urls(api, path, url):
    response = api.post(path, json={"url": url})
    assert response.status_code == 400


def test_scrape_rejects_allowed_host_pointing_inside(api, dns, monkeypatch):
    dns["www.qidian.com"] = ["127.0.0.1"]

    async def must_not_run(url):
        raise AssertionError("scraper must not run")

    monkeypatch.setattr(main, "scrape_qidian_novel", must_not_run)
    response = api.post("/scrape", json={"url": "https://www.qidian.com/book/1"})
    assert response.status_code == 400
    assert "non-public" in response.json()["detail"]


def test_scrape_generic_host_on_extra_allow_list_goes_through_safe_get(api, dns, monkeypatch):
    monkeypatch.setenv("SCRAPE_EXTRA_ALLOWED_HOSTS", "novels.example")
    dns["novels.example"] = [PUBLIC_IP]
    page = "<html><h1>第3章 Title</h1><div id='content'>" + "字" * 200 + "</div></html>"
    real_client = httpx.AsyncClient

    def patched_client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(lambda r: httpx.Response(200, text=page))
        return real_client(*args, **kwargs)

    monkeypatch.setattr(main.httpx, "AsyncClient", patched_client)
    response = api.post("/scrape", json={"url": "https://novels.example/c/3"})
    assert response.status_code == 200, response.text
    assert response.json()["chapters"][0]["chapter_number"] == 3
