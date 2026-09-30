"""Regression tests: sources are chosen from the parsed URL host.

The handlers used substring checks over the whole URL, so a path or query
that merely mentioned a site picked the wrong parser (for example every
``toonily.com/webtoon/...`` chapter was sent to the Webtoons fetcher, and a
path containing ``ko`` switched to the Korean scraper). No network is used:
the site fetchers are monkeypatched.
"""

import pytest

import main
import url_safety
from site_routing import detect_manga_site, detect_novel_source, host_matches, url_host


@pytest.fixture
def manga_calls(monkeypatch):
    calls = []

    def fake(name):
        async def _fetch(url):
            calls.append(name)
            return {"pages": ["https://example.invalid/1.jpg"], "title": "T"}

        return _fetch

    for name in (
        "fetch_webtoons",
        "fetch_mangadex",
        "fetch_bato",
        "fetch_mangakakalot",
        "fetch_toonily",
        "fetch_asura",
        "fetch_generic_manga",
    ):
        monkeypatch.setattr(main, name, fake(name))
    return calls


@pytest.mark.parametrize(
    ("url", "fetcher", "site_name"),
    [
        (
            "https://toonily.com/webtoon/solo-series/chapter-1/",
            "fetch_toonily",
            "Toonily",
        ),
        (
            "https://www.webtoons.com/en/fantasy/x/episode-1/viewer?title_no=1",
            "fetch_webtoons",
            "Webtoons",
        ),
        (
            "https://m.webtoons.com/en/fantasy/x/episode-1/",
            "fetch_webtoons",
            "Webtoons",
        ),
        ("https://mangadex.org/chapter/abc", "fetch_mangadex", "MangaDex"),
        ("https://bato.to/chapter/1", "fetch_bato", "Bato.to"),
        (
            "https://chapmanganato.to/manga-x/chapter-1",
            "fetch_mangakakalot",
            "MangaKakalot",
        ),
        ("https://asuracomic.net/series/x/chapter/1", "fetch_asura", "Asura Scans"),
        (
            "https://reader.example/series/x?from=webtoons.com",
            "fetch_generic_manga",
            "Manga Site",
        ),
        (
            "https://mangadex.org.evil.example/chapter/abc",
            "fetch_generic_manga",
            "Manga Site",
        ),
        ("https://reader.example/manhwa/x/1", "fetch_generic_manga", "Manga Site"),
    ],
)
async def test_manga_fetch_routes_by_host(manga_calls, url, fetcher, site_name):
    result = await main.fetch_manga_from_url(main.MangaFetchRequest(url=url))
    assert manga_calls == [fetcher]
    assert result.site_name == site_name


@pytest.fixture
def novel_calls(monkeypatch):
    calls = []

    def fake(name):
        async def _scrape(url):
            calls.append(name)
            return main.ScrapeResponse(
                title="T",
                original_title="T",
                author="",
                description="",
                cover_image_url="",
                chapters=[],
            )

        return _scrape

    for name in (
        "scrape_korean_novel",
        "scrape_piaotia_novel",
        "scrape_qidian_novel",
        "scrape_69shu_novel",
        "scrape_zongheng_novel",
        "scrape_17k_novel",
        "scrape_generic_novel",
    ):
        monkeypatch.setattr(main, name, fake(name))

    # Routing is under test here, not the SSRF guard (see test_url_safety.py):
    # no real DNS, and the made-up hosts are allow-listed for this test only.
    async def public_dns(host, port):
        return ["93.184.216.34"]

    monkeypatch.setattr(url_safety, "resolve_host", public_dns)
    monkeypatch.setenv(
        "SCRAPE_EXTRA_ALLOWED_HOSTS", "example-novels.test,novel.example.kr"
    )
    return calls


@pytest.mark.parametrize(
    ("url", "scraper"),
    [
        ("https://novel.munpia.com/123456", "scrape_korean_novel"),
        (
            "https://series.naver.com/novel/detail.series?productNo=1",
            "scrape_korean_novel",
        ),
        ("https://www.piaotia.com/bookinfo/1/1.html", "scrape_piaotia_novel"),
        ("https://book.qidian.com/info/1", "scrape_qidian_novel"),
        ("https://www.17k.com/book/1.html", "scrape_17k_novel"),
        ("https://www.example-novels.test/kotlin-chronicles/", "scrape_generic_novel"),
        (
            "https://www.example-novels.test/read?ref=piaotia.com",
            "scrape_generic_novel",
        ),
        ("https://www.example-novels.test/book/117k.com", "scrape_generic_novel"),
        ("https://novel.example.kr/book/1", "scrape_korean_novel"),
    ],
)
async def test_scrape_routes_by_host(novel_calls, url, scraper):
    await main.scrape_novel(main.ScrapeRequest(url=url))
    assert novel_calls == [scraper]


def test_url_host_normalises_and_rejects_garbage():
    assert url_host("HTTPS://WWW.Toonily.COM./x") == "www.toonily.com"
    assert url_host("not a url") == ""
    assert url_host("http://[::1") == ""


def test_host_matches_requires_label_boundary():
    assert host_matches("m.webtoons.com", "webtoons.com")
    assert not host_matches("notwebtoons.com", "webtoons.com")
    assert detect_manga_site("https://toonily.com/webtoon/x/").key == "toonily"
    assert detect_novel_source("https://qidian.qq.com/x") == "qidian"


def test_korean_site_detection_ignores_path_and_query():
    from korean_scraper import detect_korean_site

    assert detect_korean_site("https://series.naver.com/novel/1?ref=munpia") == "naver"
    assert detect_korean_site("https://novel.munpia.com/1") == "munpia"
    assert (
        detect_korean_site("https://novel.example.kr/ridibooks.com") == "generic_korean"
    )
