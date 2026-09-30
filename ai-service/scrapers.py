"""
Web novel scraper module for Chinese novel websites.
Supports: piaotia, qidian, 69shu, zongheng, 17k, and generic sites.
"""

import asyncio
import httpx
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from typing import List
from pydantic import BaseModel


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


class ChapterContentRequest(BaseModel):
    url: str


class ChapterContentResponse(BaseModel):
    title: str
    original_title: str
    content: str
    url: str


# Rate limiting
RATE_LIMIT_DELAY = 1.0
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
    
    response = await client.get(url)
    response.raise_for_status()
    last_request_time[domain] = time.time()
    return response.text


def parse_piaotia_book_info(soup: BeautifulSoup, url: str) -> dict:
    """Parse book information from piaotia."""
    book_info = {
        "title": "",
        "author": "",
        "description": "",
        "cover_url": "",
    }
    
    # Try to find book title
    title_elem = soup.find("h1") or soup.find("h2")
    if title_elem:
        book_info["title"] = title_elem.get_text(strip=True)
    
    # Try to find author
    author_elem = soup.find("span", string=lambda text: text and "作者" in text)
    if author_elem:
        book_info["author"] = author_elem.find_next_sibling("a").get_text(strip=True) if author_elem.find_next_sibling("a") else ""
    
    # Try to find cover image
    img_elem = soup.find("img", id="fmimg")
    if img_elem:
        book_info["cover_url"] = img_elem.get("src", "")
    
    # Try to find description
    desc_elem = soup.find("div", id="intro")
    if desc_elem:
        book_info["description"] = desc_elem.get_text(strip=True)
    
    return book_info


def parse_piaotia_chapter_list(soup: BeautifulSoup, url: str) -> List[dict]:
    """Parse chapter list from piaotia."""
    chapters = []
    chapter_list = soup.find("div", id="list")
    
    if chapter_list:
        for i, dd in enumerate(chapter_list.find_all("dd")):
            link = dd.find("a")
            if link:
                chapters.append({
                    "chapter_number": i + 1,
                    "title": link.get_text(strip=True),
                    "url": urljoin(url, link.get("href", "")),
                })
    
    return chapters


def parse_piaotia_chapter_content(soup: BeautifulSoup) -> str:
    """Parse chapter content from piaotia."""
    content_div = soup.find("div", id="content")
    if content_div:
        # Clean up the content
        for br in content_div.find_all("br"):
            br.replace_with("\n")
        
        text = content_div.get_text("\n", strip=True)
        # Remove common ads/promotions
        lines = [line for line in text.split("\n") 
                if not any(keyword in line.lower() 
                          for keyword in ["piaotia", "飄天文學", "更新快"])]
        return "\n".join(lines).strip()
    return ""


async def scrape_piaotia_novel(url: str) -> ScrapeResponse:
    """Scrape a novel from piaotia."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Fetch book page
        html = await fetch_page(client, url)
        soup = BeautifulSoup(html, "html.parser")
        
        # Parse book info
        book_info = parse_piaotia_book_info(soup, url)
        
        # Parse chapter list
        chapter_list = parse_piaotia_chapter_list(soup, url)
        
        # Fetch each chapter
        scraped_chapters = []
        for chapter_info in chapter_list:
            try:
                chapter_html = await fetch_page(client, chapter_info["url"])
                chapter_soup = BeautifulSoup(chapter_html, "html.parser")
                content = parse_piaotia_chapter_content(chapter_soup)
                
                scraped_chapters.append(ScrapedChapter(
                    chapter_number=chapter_info["chapter_number"],
                    title=chapter_info["title"],
                    original_title=chapter_info["title"],
                    url=chapter_info["url"],
                    content=content,
                ))
            except Exception as e:
                print(f"Error scraping chapter {chapter_info['chapter_number']}: {e}")
                continue
        
        return ScrapeResponse(
            book_title=book_info["title"],
            author=book_info["author"],
            description=book_info["description"],
            cover_url=book_info["cover_url"],
            chapters=scraped_chapters,
            total_chapters=len(scraped_chapters),
        )


async def scrape_qidian_novel(url: str) -> ScrapeResponse:
    """Scrape a novel from Qidian."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        html = await fetch_page(client, url)
        soup = BeautifulSoup(html, "html.parser")
        
        # Parse book info
        title_elem = soup.find("h1", {"data-eid": "qd_C1"})
        title = title_elem.get_text(strip=True) if title_elem else ""
        
        # Parse chapters
        chapters = []
        chapter_list = soup.find("ul", class_="cf")
        if chapter_list:
            for i, li in enumerate(chapter_list.find_all("li")):
                link = li.find("a")
                if link:
                    chapters.append(ScrapedChapter(
                        chapter_number=i + 1,
                        title=link.get_text(strip=True),
                        original_title=link.get_text(strip=True),
                        url=urljoin(url, link.get("href", "")),
                        content="",  # Will be fetched separately
                    ))
        
        return ScrapeResponse(
            book_title=title,
            author="",
            description="",
            cover_url="",
            chapters=chapters,
            total_chapters=len(chapters),
        )


async def scrape_69shu_novel(url: str) -> ScrapeResponse:
    """Scrape a novel from 69shu."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        html = await fetch_page(client, url)
        soup = BeautifulSoup(html, "html.parser")
        
        title_elem = soup.find("h1")
        title = title_elem.get_text(strip=True) if title_elem else ""
        
        chapters = []
        chapter_list = soup.find("div", id="chapterlist")
        if chapter_list:
            for i, li in enumerate(chapter_list.find_all("li")):
                link = li.find("a")
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
            author="",
            description="",
            cover_url="",
            chapters=chapters,
            total_chapters=len(chapters),
        )


async def scrape_zongheng_novel(url: str) -> ScrapeResponse:
    """Scrape a novel from Zongheng."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        html = await fetch_page(client, url)
        soup = BeautifulSoup(html, "html.parser")
        
        title_elem = soup.find("h1")
        title = title_elem.get_text(strip=True) if title_elem else ""
        
        chapters = []
        chapter_list = soup.find("div", class_="chapter-list")
        if chapter_list:
            for i, div in enumerate(chapter_list.find_all("div", class_="chapter-item")):
                link = div.find("a")
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
            author="",
            description="",
            cover_url="",
            chapters=chapters,
            total_chapters=len(chapters),
        )


async def scrape_17k_novel(url: str) -> ScrapeResponse:
    """Scrape a novel from 17K."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        html = await fetch_page(client, url)
        soup = BeautifulSoup(html, "html.parser")
        
        title_elem = soup.find("h1")
        title = title_elem.get_text(strip=True) if title_elem else ""
        
        chapters = []
        chapter_list = soup.find("div", class_="Volume")
        if chapter_list:
            for i, dl in enumerate(chapter_list.find_all("dl")):
                link = dl.find("a")
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
            author="",
            description="",
            cover_url="",
            chapters=chapters,
            total_chapters=len(chapters),
        )


async def scrape_generic_novel(url: str) -> ScrapeResponse:
    """Generic scraper for unknown novel sites."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        html = await fetch_page(client, url)
        soup = BeautifulSoup(html, "html.parser")
        
        # Try to find title
        title_elem = soup.find("h1") or soup.find("title")
        title = title_elem.get_text(strip=True) if title_elem else ""
        
        # Try to find chapters (common patterns)
        chapters = []
        for pattern in ["#list", "#chapterlist", ".chapter-list", ".list-chapter"]:
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


def detect_site_type(url: str) -> str:
    """Detect the type of novel site from URL."""
    if "piaotia" in url or "ptwxz" in url:
        return "piaotia"
    elif "qidian" in url:
        return "qidian"
    elif "69shu" in url:
        return "69shu"
    elif "zongheng" in url:
        return "zongheng"
    elif "17k" in url:
        return "17k"
    else:
        return "generic"


async def scrape_novel(url: str) -> ScrapeResponse:
    """Main scraping function - detects site and scrapes accordingly."""
    site_type = detect_site_type(url)
    
    scrapers = {
        "piaotia": scrape_piaotia_novel,
        "qidian": scrape_qidian_novel,
        "69shu": scrape_69shu_novel,
        "zongheng": scrape_zongheng_novel,
        "17k": scrape_17k_novel,
        "generic": scrape_generic_novel,
    }
    
    scraper = scrapers.get(site_type, scrape_generic_novel)
    return await scraper(url)
