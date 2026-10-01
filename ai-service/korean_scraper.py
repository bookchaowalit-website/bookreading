"""
Korean web novel scraper.
Supports: Munpia, Ridibooks, Naver Series, KakaoPage.
"""

import asyncio
import httpx
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from typing import List
from pydantic import BaseModel
from site_routing import host_matches, url_host
from url_safety import safe_get


class ScrapedChapter(BaseModel):
    chapter_number: int
    title: str
    original_title: str
    url: str
    content: str


class ScrapeResponse(BaseModel):
    book_title: str
    author: str
    description: str
    cover_url: str
    chapters: List[ScrapedChapter]
    total_chapters: int


# Rate limiting
RATE_LIMIT_DELAY = 1.5  # Korean sites are stricter
last_request_time = {}


async def fetch_page(client: httpx.AsyncClient, url: str) -> str:
    """Fetch a web page with rate limiting."""
    import time
    
    domain = url.split("/")[2]
    now = time.time()
    if domain in last_request_time:
        elapsed = now - last_request_time[domain]
        if elapsed < RATE_LIMIT_DELAY:
            await asyncio.sleep(RATE_LIMIT_DELAY - elapsed)
    
    response = await safe_get(client, url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    })
    last_request_time[domain] = time.time()
    return response.text


def detect_korean_site(url: str) -> str:
    """Detect Korean novel site from the URL host (not the path or query)."""
    host = url_host(url)
    if "munpia" in host:
        return "munpia"
    elif host_matches(host, "ridibooks.com"):
        return "ridibooks"
    elif host_matches(host, "series.naver.com"):
        return "naver"
    elif host_matches(host, "page.kakao.com"):
        return "kakao"
    elif "novelpia" in host:
        return "novelpia"
    else:
        return "generic_korean"


async def scrape_munpia(url: str) -> ScrapeResponse:
    """Scrape from Munpia (문피아) - largest Korean web novel platform."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        html = await fetch_page(client, url)
        soup = BeautifulSoup(html, "html.parser")
        
        # Parse book info
        title_elem = soup.find("h1") or soup.find("h2")
        title = title_elem.get_text(strip=True) if title_elem else ""
        
        author_elem = soup.find("span", string=lambda t: t and "저자" in t)
        author = ""
        if author_elem:
            parent = author_elem.find_parent()
            author = parent.find_next_sibling().get_text(strip=True) if parent else ""
        
        desc_elem = soup.find("div", class_="intro") or soup.find("div", id="intro")
        description = desc_elem.get_text(strip=True) if desc_elem else ""
        
        cover_elem = soup.find("img", class_="cover") or soup.find("img", id="cover")
        cover_url = cover_elem.get("src", "") if cover_elem else ""
        
        # Parse chapters
        chapters = []
        chapter_list = soup.find("div", class_="chapter-list") or soup.find("div", id="chapter-list")
        if chapter_list:
            for i, item in enumerate(chapter_list.find_all(["li", "div"], class_=lambda c: c and ("chapter" in c or "episode" in c))):
                link = item.find("a")
                if link:
                    chapters.append(ScrapedChapter(
                        chapter_number=i + 1,
                        title=link.get_text(strip=True),
                        original_title=link.get_text(strip=True),
                        url=urljoin(url, link.get("href", "")),
                        content="",
                    ))
        
        return ScrapeResponse(
            book_title=title,
            author=author,
            description=description,
            cover_url=cover_url,
            chapters=chapters,
            total_chapters=len(chapters),
        )


async def scrape_ridibooks(url: str) -> ScrapeResponse:
    """Scrape from Ridibooks (리디북스)."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        html = await fetch_page(client, url)
        soup = BeautifulSoup(html, "html.parser")
        
        title_elem = soup.find("h1") or soup.find("h2")
        title = title_elem.get_text(strip=True) if title_elem else ""
        
        author_elem = soup.find("span", class_="author")
        author = author_elem.get_text(strip=True) if author_elem else ""
        
        desc_elem = soup.find("div", class_="description")
        description = desc_elem.get_text(strip=True) if desc_elem else ""
        
        cover_elem = soup.find("meta", property="og:image")
        cover_url = cover_elem.get("content", "") if cover_elem else ""
        
        chapters = []
        chapter_list = soup.find("ul", class_="toc-list") or soup.find("div", class_="contents-list")
        if chapter_list:
            for i, item in enumerate(chapter_list.find_all("li")):
                link = item.find("a")
                if link:
                    chapters.append(ScrapedChapter(
                        chapter_number=i + 1,
                        title=link.get_text(strip=True),
                        original_title=link.get_text(strip=True),
                        url=urljoin(url, link.get("href", "")),
                        content="",
                    ))
        
        return ScrapeResponse(
            book_title=title,
            author=author,
            description=description,
            cover_url=cover_url,
            chapters=chapters,
            total_chapters=len(chapters),
        )


async def scrape_naver_series(url: str) -> ScrapeResponse:
    """Scrape from Naver Series."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        html = await fetch_page(client, url)
        soup = BeautifulSoup(html, "html.parser")
        
        title_elem = soup.find("h2", class_="title") or soup.find("h1")
        title = title_elem.get_text(strip=True) if title_elem else ""
        
        author_elem = soup.find("span", class_="author")
        author = author_elem.get_text(strip=True) if author_elem else ""
        
        desc_elem = soup.find("div", class_="summary") or soup.find("p", class_="intro")
        description = desc_elem.get_text(strip=True) if desc_elem else ""
        
        cover_elem = soup.find("meta", property="og:image")
        cover_url = cover_elem.get("content", "") if cover_elem else ""
        
        chapters = []
        chapter_list = soup.find("div", class_="episode_list") or soup.find("ul", class_="lst")
        if chapter_list:
            for i, item in enumerate(chapter_list.find_all("li")):
                link = item.find("a")
                if link:
                    chapters.append(ScrapedChapter(
                        chapter_number=i + 1,
                        title=link.get_text(strip=True),
                        original_title=link.get_text(strip=True),
                        url=urljoin(url, link.get("href", "")),
                        content="",
                    ))
        
        return ScrapeResponse(
            book_title=title,
            author=author,
            description=description,
            cover_url=cover_url,
            chapters=chapters,
            total_chapters=len(chapters),
        )


async def scrape_kakao_page(url: str) -> ScrapeResponse:
    """Scrape from KakaoPage (카카오페이지)."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        html = await fetch_page(client, url)
        soup = BeautifulSoup(html, "html.parser")
        
        title_elem = soup.find("h1") or soup.find("h2")
        title = title_elem.get_text(strip=True) if title_elem else ""
        
        author_elem = soup.find("span", class_="txt_author")
        author = author_elem.get_text(strip=True) if author_elem else ""
        
        desc_elem = soup.find("div", class_="desc") or soup.find("p", class_="summary")
        description = desc_elem.get_text(strip=True) if desc_elem else ""
        
        cover_elem = soup.find("meta", property="og:image")
        cover_url = cover_elem.get("content", "") if cover_elem else ""
        
        chapters = []
        chapter_list = soup.find("div", class_="episode-list") or soup.find("ul", class_="lst_episode")
        if chapter_list:
            for i, item in enumerate(chapter_list.find_all("li")):
                link = item.find("a")
                if link:
                    chapters.append(ScrapedChapter(
                        chapter_number=i + 1,
                        title=link.get_text(strip=True),
                        original_title=link.get_text(strip=True),
                        url=urljoin(url, link.get("href", "")),
                        content="",
                    ))
        
        return ScrapeResponse(
            book_title=title,
            author=author,
            description=description,
            cover_url=cover_url,
            chapters=chapters,
            total_chapters=len(chapters),
        )


async def scrape_novelpia(url: str) -> ScrapeResponse:
    """Scrape from NovelPia."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        html = await fetch_page(client, url)
        soup = BeautifulSoup(html, "html.parser")
        
        title_elem = soup.find("h1") or soup.find("h2")
        title = title_elem.get_text(strip=True) if title_elem else ""
        
        author_elem = soup.find("span", class_="author")
        author = author_elem.get_text(strip=True) if author_elem else ""
        
        desc_elem = soup.find("div", class_="synopsis") or soup.find("div", class_="story")
        description = desc_elem.get_text(strip=True) if desc_elem else ""
        
        cover_elem = soup.find("img", class_="cover")
        cover_url = cover_elem.get("src", "") if cover_elem else ""
        
        chapters = []
        chapter_list = soup.find("div", class_="list-chapter") or soup.find("ul", class_="chapter-list")
        if chapter_list:
            for i, item in enumerate(chapter_list.find_all("li")):
                link = item.find("a")
                if link:
                    chapters.append(ScrapedChapter(
                        chapter_number=i + 1,
                        title=link.get_text(strip=True),
                        original_title=link.get_text(strip=True),
                        url=urljoin(url, link.get("href", "")),
                        content="",
                    ))
        
        return ScrapeResponse(
            book_title=title,
            author=author,
            description=description,
            cover_url=cover_url,
            chapters=chapters,
            total_chapters=len(chapters),
        )


async def scrape_generic_korean(url: str) -> ScrapeResponse:
    """Generic scraper for Korean novel sites."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        html = await fetch_page(client, url)
        soup = BeautifulSoup(html, "html.parser")
        
        title_elem = soup.find("h1") or soup.find("title")
        title = title_elem.get_text(strip=True) if title_elem else ""
        
        chapters = []
        for pattern in [".chapter-list", ".episode-list", ".toc-list", "#chapter-list"]:
            chapter_list = soup.select_one(pattern)
            if chapter_list:
                links = chapter_list.find_all("a")
                for i, link in enumerate(links):
                    chapters.append(ScrapedChapter(
                        chapter_number=i + 1,
                        title=link.get_text(strip=True),
                        original_title=link.get_text(strip=True),
                        url=urljoin(url, link.get("href", "")),
                        content="",
                    ))
                break
        
        return ScrapeResponse(
            book_title=title,
            author="",
            description="",
            cover_url="",
            chapters=chapters,
            total_chapters=len(chapters),
        )


async def scrape_korean_novel(url: str) -> ScrapeResponse:
    """Main scraping function - detects Korean site and scrapes accordingly."""
    site_type = detect_korean_site(url)
    
    scrapers = {
        "munpia": scrape_munpia,
        "ridibooks": scrape_ridibooks,
        "naver": scrape_naver_series,
        "kakao": scrape_kakao_page,
        "novelpia": scrape_novelpia,
        "generic_korean": scrape_generic_korean,
    }
    
    scraper = scrapers.get(site_type, scrape_generic_korean)
    return await scraper(url)


# Supported sites reference
SUPPORTED_KOREAN_SITES = {
    "munpia": {
        "name": "문피아 (Munpia)",
        "url_pattern": "https://www.munpia.com/...",
        "description": "Largest Korean web novel platform",
    },
    "ridibooks": {
        "name": "리디북스 (Ridibooks)",
        "url_pattern": "https://ridibooks.com/...",
        "description": "Popular Korean ebook/novel platform",
    },
    "naver": {
        "name": "네이버 시리즈 (Naver Series)",
        "url_pattern": "https://series.naver.com/...",
        "description": "Naver's web novel/manga platform",
    },
    "kakao": {
        "name": "카카오페이지 (KakaoPage)",
        "url_pattern": "https://page.kakao.com/...",
        "description": "Kakao's webtoon/novel platform",
    },
    "novelpia": {
        "name": "NovelPia",
        "url_pattern": "https://novelpia.com/...",
        "description": "Korean web novel platform",
    },
}
