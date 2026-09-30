"""Pick a scraper/fetcher from the parsed URL host.

Substring checks over the whole URL let a path or query that merely mentions
a site (``toonily.com/webtoon/...``, ``?ref=piaotia.com``) select the wrong
parser. Everything here looks only at the hostname.
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlsplit


def url_host(url: str) -> str:
    """Lower-cased hostname without a trailing dot, or "" when unparseable."""
    try:
        host = urlsplit(url.strip()).hostname or ""
    except ValueError:
        return ""
    return host.lower().rstrip(".")


def host_matches(host: str, domain: str) -> bool:
    """True for ``domain`` itself or any subdomain of it."""
    return host == domain or host.endswith("." + domain)


@dataclass(frozen=True)
class MangaSite:
    key: str
    name: str
    domains: tuple[str, ...] = ()
    # Brand keywords for families that rotate domains (asuracomic.net,
    # asurascans.com, ...). Matched against the hostname only.
    host_keywords: tuple[str, ...] = ()

    def matches(self, host: str) -> bool:
        return any(host_matches(host, d) for d in self.domains) or any(
            k in host for k in self.host_keywords
        )


MANGA_SITES: tuple[MangaSite, ...] = (
    MangaSite("webtoons", "Webtoons", domains=("webtoons.com",)),
    MangaSite("mangadex", "MangaDex", domains=("mangadex.org",)),
    MangaSite("bato", "Bato.to", domains=("bato.to",), host_keywords=("batoto",)),
    MangaSite(
        "mangakakalot",
        "MangaKakalot",
        host_keywords=("mangakakalot", "manganato", "manganelo"),
    ),
    MangaSite(
        "toonily", "Toonily", domains=("toonily.com",), host_keywords=("toonily",)
    ),
    MangaSite("asura", "Asura Scans", host_keywords=("asura",)),
    MangaSite("flame", "Flame Comics", host_keywords=("flame",)),
    MangaSite("reaper", "Reaper Scans", host_keywords=("reaperscans",)),
    MangaSite("manhwa", "Manhwa/Manhua Site", host_keywords=("manhwa", "manhua")),
)

GENERIC_MANGA_SITE = MangaSite("generic", "Manga Site")

# Explicit allow-list for outbound manga fetches (see url_safety). Brand
# keywords above only pick a parser; they never make a host fetchable.
# Operators add mirrors with MANGA_EXTRA_ALLOWED_HOSTS.
SUPPORTED_MANGA_DOMAINS: tuple[str, ...] = (
    "webtoons.com",
    "mangadex.org",
    "bato.to",
    "mangakakalot.com",
    "manganato.com",
    "chapmanganato.to",
    "manganelo.com",
    "toonily.com",
    "asuracomic.net",
    "asurascans.com",
    "flamecomics.xyz",
    "flamecomics.com",
    "reaperscans.com",
)


def detect_manga_site(url: str) -> MangaSite:
    host = url_host(url)
    if host:
        for site in MANGA_SITES:
            if site.matches(host):
                return site
    return GENERIC_MANGA_SITE


_KOREAN_DOMAINS = (
    "munpia.com",
    "ridibooks.com",
    "series.naver.com",
    "page.kakao.com",
    "novelpia.com",
)
_KOREAN_HOST_KEYWORDS = ("munpia", "ridibooks", "novelpia", "naver", "kakao")
_CHINESE_SOURCES = (
    ("piaotia", ("piaotia.com",)),
    ("qidian", ("qidian.com", "qidian.qq.com")),
    ("69shu", ("69shu.com",)),
    ("zongheng", ("zongheng.com",)),
    ("17k", ("17k.com",)),
)


def detect_novel_source(url: str) -> str:
    """One of "korean", a Chinese source key, or "generic"."""
    host = url_host(url)
    if not host:
        return "generic"
    if any(host_matches(host, d) for d in _KOREAN_DOMAINS):
        return "korean"
    for key, domains in _CHINESE_SOURCES:
        if any(host_matches(host, d) for d in domains):
            return key
    if host.endswith(".kr") or any(k in host for k in _KOREAN_HOST_KEYWORDS):
        return "korean"
    return "generic"


def is_webtoons_host(url: str) -> bool:
    return host_matches(url_host(url), "webtoons.com")
