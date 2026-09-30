"""SSRF guard for /manga/fetch and /manga/translate-url (DNS and HTTP mocked)."""

from io import BytesIO
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

import main
import url_safety

PUBLIC_IP = "93.184.216.34"


@pytest.fixture
def dns(monkeypatch):
    table: dict[str, list[str]] = {}

    async def fake_resolve(host, port):
        if host not in table:
            raise OSError("NXDOMAIN")
        return table[host]

    monkeypatch.setattr(url_safety, "resolve_host", fake_resolve)
    return table


@pytest.fixture
def transport(monkeypatch):
    """Route every httpx.AsyncClient in main through a recording MockTransport."""
    state = SimpleNamespace(requests=[], handler=lambda r: httpx.Response(404))
    real_client = httpx.AsyncClient

    def patched_client(*args, **kwargs):
        def record(request):
            state.requests.append(request)
            return state.handler(request)

        kwargs["transport"] = httpx.MockTransport(record)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(main.httpx, "AsyncClient", patched_client)
    return state


@pytest.fixture
def api(dns):
    return TestClient(main.app)


@pytest.mark.parametrize(
    "url",
    [
        "http://169.254.169.254/latest/meta-data/",
        "http://localhost:8000/health",
        "http://127.0.0.1/",
        "file:///etc/passwd",
        "https://evil.example/chapter?site=mangadex.org",
        "https://manhwa-anything.example/c/1",
    ],
)
def test_fetch_rejects_internal_and_unlisted_urls(api, transport, url):
    response = api.post("/manga/fetch", json={"url": url})
    assert response.status_code == 400, response.text
    assert transport.requests == []


def test_fetch_rejects_allowed_host_resolving_inside(api, dns, transport):
    dns["bato.to"] = ["10.1.2.3"]
    response = api.post("/manga/fetch", json={"url": "https://bato.to/chapter/1"})
    assert response.status_code == 400
    assert "non-public" in response.json()["detail"]
    assert transport.requests == []


def test_fetch_supported_site_goes_through_pinned_safe_get(api, dns, transport):
    dns["bato.to"] = [PUBLIC_IP]
    html = (
        "<h3>Series</h3>"
        '<img data-src="https://img.bato.to/1.jpg"><img data-src="https://img.bato.to/2.jpg">'
    )
    transport.handler = lambda r: httpx.Response(200, text=html)
    response = api.post("/manga/fetch", json={"url": "https://bato.to/chapter/1"})
    assert response.status_code == 200, response.text
    assert response.json()["total_pages"] == 2
    [request] = transport.requests
    assert request.url.host == PUBLIC_IP
    assert request.headers["host"] == "bato.to"


def test_fetch_redirect_off_the_allow_list_is_refused(api, dns, transport):
    dns["bato.to"] = [PUBLIC_IP]
    transport.handler = lambda r: httpx.Response(
        302, headers={"location": "http://169.254.169.254/latest/"}
    )
    response = api.post("/manga/fetch", json={"url": "https://bato.to/chapter/1"})
    assert response.status_code == 400
    assert len(transport.requests) == 1


def test_mangadex_api_and_image_hosts(dns, transport, api):
    dns["mangadex.org"] = [PUBLIC_IP]
    dns["api.mangadex.org"] = [PUBLIC_IP]

    def handler(request):
        if request.url.path.startswith("/at-home/server/"):
            return httpx.Response(
                200,
                json={
                    "baseUrl": "https://node1.mangadex.network",
                    "chapter": {"hash": "h", "data": ["a.png"]},
                },
            )
        return httpx.Response(500)  # title lookup fails; images still return

    transport.handler = handler
    response = api.post(
        "/manga/fetch", json={"url": "https://mangadex.org/chapter/abc-123"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["pages"][0]["image_url"] == (
        "https://node1.mangadex.network/data/h/a.png"
    )
    assert {r.headers["host"] for r in transport.requests} == {"api.mangadex.org"}


def test_image_domains_include_cdns_and_env(monkeypatch):
    domains = url_safety.manga_image_domains()
    assert "pstatic.net" in domains and "mangadex.network" in domains
    assert "cdn.example" not in domains
    monkeypatch.setenv("MANGA_IMAGE_EXTRA_ALLOWED_HOSTS", "cdn.example")
    assert "cdn.example" in url_safety.manga_image_domains()
    # Image CDNs are never valid chapter-page hosts.
    assert "pstatic.net" not in url_safety.manga_page_domains()


def _png() -> bytes:
    buf = BytesIO()
    Image.new("RGB", (4, 4)).save(buf, format="PNG")
    return buf.getvalue()


async def test_translate_url_downloads_only_allow_listed_images(dns, transport, monkeypatch):
    dns["webtoon-phinf.pstatic.net"] = [PUBLIC_IP]
    dns["cdn.internal.example"] = [PUBLIC_IP]  # public, but not allow-listed
    dns["img.webtoons.com"] = ["192.168.1.10"]  # allow-listed, resolves inside
    pages = [
        main.MangaPageInfo(page_number=1, image_url="https://webtoon-phinf.pstatic.net/1.png"),
        main.MangaPageInfo(page_number=2, image_url="http://169.254.169.254/latest/"),
        main.MangaPageInfo(page_number=3, image_url="https://cdn.internal.example/3.png"),
        main.MangaPageInfo(page_number=4, image_url="https://img.webtoons.com/4.png"),
    ]

    async def fake_fetch(_request):
        return main.MangaFetchResponse(
            title="T",
            total_pages=len(pages),
            pages=pages,
            source_url="https://www.webtoons.com/en/x",
            site_name="Webtoons",
        )

    translated = []

    class FakeTranslator:
        async def translate_image(self, image, **_kwargs):
            translated.append(image.size)
            return SimpleNamespace(regions=[], translated_image=b"t", original_image=b"o")

    monkeypatch.setattr(main, "fetch_manga_from_url", fake_fetch)
    monkeypatch.setattr(main, "get_manga_translator", lambda **_kw: FakeTranslator())
    transport.handler = lambda r: httpx.Response(200, content=_png())

    result = await main.translate_manga_from_url(
        main.MangaTranslateURLRequest(
            url="https://www.webtoons.com/en/x", provider="openai", openai_api_key="k"
        )
    )
    by_page = {p["page_number"]: p for p in result["pages"]}
    assert "translated_base64" in by_page[1]
    for n in (2, 3, 4):
        assert by_page[n]["error"].startswith("Image URL refused"), by_page[n]
    assert translated == [(4, 4)]
    assert [r.headers["host"] for r in transport.requests] == ["webtoon-phinf.pstatic.net"]
    assert transport.requests[0].url.host == PUBLIC_IP


def test_translate_url_rejects_internal_page_url(api, transport):
    response = api.post(
        "/manga/translate-url",
        json={"url": "http://169.254.169.254/", "openai_api_key": "k"},
    )
    assert response.status_code == 400
    assert transport.requests == []


def test_advertised_sites_are_all_allow_listed(api):
    sites = api.get("/manga/supported-sites").json()["sites"]
    allowed = url_safety.manga_page_domains()
    for site in sites:
        for domain in site["domains"]:
            assert domain in allowed, domain
