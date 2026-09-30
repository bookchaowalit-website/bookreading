from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import asyncio
import httpx
import os
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import re
from collections import Counter
from deep_translator import GoogleTranslator
from translatepy import Translator as TranslatePyTranslator

# Import agentic translator
from agentic_translator import (
    AgenticTranslator,
    LLMProvider,
    TerminologyManager,
    ContextManager,
    TerminologyTerm,
    NovelContext,
    ChapterContext,
    create_translator,
)

# Import multi-agent translator
from multi_agent_translator import (
    TranslationPipeline,
    CharacterInfo,
    create_pipeline,
    review_queue,
)

# Import database manager
from db_manager import (
    get_db_manager,
)

# Import improved translation pipeline
from translation_cache import translation_cache
from manga_translator import (
    MangaTranslationPipeline,
    MangaTranslationContext,
    SourceLanguage,
    create_manga_translator,
    EASYOCR_AVAILABLE,
)

# Image processing
from PIL import Image
from io import BytesIO
import base64

# Rate limiting settings
RATE_LIMIT_DELAY = 1.0  # seconds between requests to same domain
last_request_time = {}

app = FastAPI(title="BookReading AI Service", version="1.0.0")

# CORS Configuration - read from environment variable
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
allowed_origins = [origin.strip() for origin in allowed_origins]

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from name_protect import protect_text, restore_text
from terminology import KNOWN_TERMINOLOGY


# Request/Response Models
class ScrapeRequest(BaseModel):
    url: str
    source_lang: str = "zh"


class ScrapedChapter(BaseModel):
    chapter_number: int
    title: str
    original_title: str
    url: str
    content: str


class ScrapeResponse(BaseModel):
    title: str
    original_title: str
    author: str
    description: str
    cover_image_url: str
    chapters: List[ScrapedChapter]


class Term(BaseModel):
    original: str
    translation: str


class TranslationContext(BaseModel):
    chapter_id: str
    source_text: str
    translated_text: str


class TranslateRequest(BaseModel):
    text: str
    source_lang: str
    target_lang: str = "th"
    terminology: List[Term] = []
    translation_context: List[TranslationContext] = []


class TranslateResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    
    translated_text: str
    model_used: str = "google-translate"
    tokens_used: int = 0


class ExtractTerminologyRequest(BaseModel):
    text: str
    source_lang: str
    target_lang: str


class ExtractedTerm(BaseModel):
    original: str
    term: str
    translation: str
    type: str
    description: str
    confidence: float


class ExtractTerminologyResponse(BaseModel):
    terms: List[ExtractedTerm]


# ==================== Agentic Translation Models ====================

class AgenticTranslateRequest(BaseModel):
    """Request for agentic AI translation with full context"""
    text: str
    source_lang: str = "zh"
    target_lang: str = "th"
    novel_id: Optional[str] = None
    novel_title: Optional[str] = None
    novel_title_th: Optional[str] = None
    author: Optional[str] = None
    genre: Optional[str] = "fantasy"
    tone: Optional[str] = "dark"
    chapter_number: Optional[int] = None
    chapter_title: Optional[str] = None
    terminology: List[Term] = []
    translation_context: List[TranslationContext] = []
    provider: Optional[str] = None  # "openai" or "gemini", defaults to config
    two_step: bool = True  # Enable two-step translation (literal → polish)
    pronoun_style: Optional[str] = "traditional"
    # API Keys - can be provided by user or use server defaults
    openai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None


class AgenticTranslateResponse(BaseModel):
    """Response from agentic AI translation"""
    model_config = {"protected_namespaces": ()}  # Fix Pydantic warning for model_used field

    translated_text: str
    literal_translation: Optional[str] = None
    polished_translation: Optional[str] = None
    model_used: str
    provider: str
    tokens_used: int = 0
    terms_applied: List[str] = []
    quality_score: float = 0.0


class InitializeContextRequest(BaseModel):
    """Request to initialize novel context"""
    novel_id: str
    novel_title: str
    novel_title_th: str
    author: Optional[str] = ""
    genre: Optional[str] = "fantasy"
    tone: Optional[str] = "dark"
    pronoun_style: Optional[str] = "traditional"


class AddChapterContextRequest(BaseModel):
    """Request to add chapter context"""
    novel_id: str
    chapter_number: int
    chapter_title: str
    source_text: str
    translated_text: str
    key_events: List[str] = []


class UpdateTerminologyRequest(BaseModel):
    """Request to update terminology"""
    novel_id: str
    terms: List[Term]


# ==================== Global Managers ====================

# Initialize global managers
terminology_manager = TerminologyManager()
context_manager = ContextManager(max_context_chapters=10)

# Default translator (will be created based on config)
_default_translator: Optional[AgenticTranslator] = None


def get_default_translator() -> AgenticTranslator:
    """Get or create default translator based on environment config"""
    global _default_translator
    
    if _default_translator is None:
        provider = os.getenv("LLM_PROVIDER", "openai").lower()
        model = os.getenv("LLM_MODEL", None)
        
        if provider == "gemini":
            _default_translator = create_translator("gemini", model)
        else:
            _default_translator = create_translator("openai", model)
    
    return _default_translator


# Translation functions
def preprocess_terminology(text: str) -> tuple[str, dict]:
    """Replace glossary and remaining place/title spans before machine translation."""
    return protect_text(text, KNOWN_TERMINOLOGY)


def postprocess_terminology(text: str, placeholders: dict) -> str:
    """Put locked Thai names back after machine translation."""
    return restore_text(text, placeholders)


def format_translated_text(text: str) -> str:
    """Clean up and format translated text for better readability"""
    # Remove UI artifacts and navigation elements (Thai patterns after translation)
    cleanup_patterns = [
        r'\(ปุ่มลัด[^)]*\)',
        r'[\|｜]{2,}',
        r'กลับไปด้านบน',
        r'ชั้นหนังสือของฉัน',
        r'ข้อผิดพลาดของบท',
        r'คลิกที่นี่เพื่อรายงาน',
        r'รายงาน',
        r'ดาวน์โหลด',
        r'โทรศัพท์อ่าน',
    ]

    result = text
    for pattern in cleanup_patterns:
        result = re.sub(pattern, '', result)

    # Clean up excessive whitespace
    result = re.sub(r'\n{3,}', '\n\n', result)
    result = re.sub(r' {2,}', ' ', result)

    # Add proper paragraph breaks for dialogue (Thai style)
    # Dialogue often starts with quotes
    lines = result.split('\n')
    formatted_lines = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Check if this is dialogue (starts with quote marks)
        if line.startswith('"') or line.startswith('"') or line.startswith('「') or line.startswith('"'):
            formatted_lines.append('\n' + line)
        else:
            formatted_lines.append(line)

    result = '\n'.join(formatted_lines)
    result = re.sub(r'\n{3,}', '\n\n', result)

    return result.strip()


def clean_source_text(text: str) -> str:
    """Clean source text before translation - remove UI elements"""
    # Remove UI artifacts and navigation elements (Chinese patterns)
    cleanup_patterns = [
        r'\(快捷键[^)]*\)',
        r'[\|｜]{2,}',
        r'返回顶部',
        r'章节错误',
        r'点此举报',
        r'我的藏书架',
        r'手机阅读',
        r'下载',
        r'加入书签',
        r'上一章',
        r'下一章',
        r'返回目录',
    ]

    result = text
    for pattern in cleanup_patterns:
        result = re.sub(pattern, '', result)

    # Clean up excessive whitespace
    result = re.sub(r'\n{3,}', '\n\n', result)
    result = re.sub(r' {2,}', ' ', result)

    return result.strip()


def translate_with_google(text: str, source_lang: str, target_lang: str) -> str:
    """Translate text using multiple translation services"""
    # Map language codes
    lang_map = {
        "zh": "zh-CN",  # Chinese Simplified
        "zh-CN": "zh-CN",
        "th": "th",
        "en": "en",
    }
    src = lang_map.get(source_lang, source_lang)
    tgt = lang_map.get(target_lang, target_lang)

    # Clean source text first - remove UI elements
    cleaned_text = clean_source_text(text)

    # Pre-process: replace known terms with placeholders
    processed_text, placeholders = preprocess_terminology(cleaned_text)

    # Split text into chunks if too long (Google has a 5000 char limit)
    max_chars = 4500

    def translate_chunk(chunk: str) -> str:
        """Translate a single chunk using multiple methods"""
        # Method 1: Try translatepy (uses multiple providers)
        try:
            translator = TranslatePyTranslator()
            result = translator.translate(chunk, source_language=src, destination_language=tgt)
            return result.result
        except Exception as e:
            print(f"translatepy failed: {e}")

        # Method 2: Try deep_translator as fallback
        try:
            deep_translator = GoogleTranslator(source=src, target=tgt)
            return deep_translator.translate(chunk)
        except Exception as e:
            print(f"deep_translator failed: {e}")

        # Return original if all methods fail
        print("All translation methods failed for chunk")
        return chunk

    if len(processed_text) > max_chars:
        chunks = []
        current_chunk = ""
        for paragraph in processed_text.split('\n\n'):
            if len(current_chunk) + len(paragraph) > max_chars:
                if current_chunk:
                    chunks.append(current_chunk)
                current_chunk = paragraph
            else:
                current_chunk += '\n\n' + paragraph if current_chunk else paragraph
        if current_chunk:
            chunks.append(current_chunk)

        translated_chunks = []
        for chunk in chunks:
            translated_chunks.append(translate_chunk(chunk))

        translated = '\n\n'.join(translated_chunks)
    else:
        translated = translate_chunk(processed_text)

    # Post-process: replace placeholders with actual translations
    translated = postprocess_terminology(translated, placeholders)

    # Format the text for better readability
    return format_translated_text(translated)


def apply_terminology(text: str, terminology: List[Term], source_lang: str, target_lang: str) -> str:
    """Apply terminology replacements to translated text (for user-provided terms)"""
    result = text

    # First, check if we have user-provided translations
    for term in terminology:
        if term.original in result:
            result = result.replace(term.original, term.translation)

    return result


# Scraping functions
PIAOTIA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}


def piaotia_http_client() -> httpx.AsyncClient:
    """Browser-like client so Cloudflare/GBK novel sites do not reject the scraper."""
    return httpx.AsyncClient(
        follow_redirects=True,
        timeout=30.0,
        headers=PIAOTIA_HEADERS,
    )


async def fetch_piaotia_page(client: httpx.AsyncClient, url: str) -> str:
    """Fetch a page from piaotia.com with proper GBK encoding and rate limiting"""
    global last_request_time
    
    # Rate limiting - wait if we made a request recently
    domain = "piaotia.com"
    if domain in last_request_time:
        elapsed = asyncio.get_event_loop().time() - last_request_time[domain]
        if elapsed < RATE_LIMIT_DELAY:
            await asyncio.sleep(RATE_LIMIT_DELAY - elapsed)
    
    last_request_time[domain] = asyncio.get_event_loop().time()
    
    response = await client.get(url, timeout=30, headers=PIAOTIA_HEADERS)
    response.raise_for_status()
    # Try to decode with GBK encoding (common for Chinese sites)
    try:
        return response.content.decode('gbk')
    except Exception:
        return response.text


def parse_piaotia_book_info(soup: BeautifulSoup, url: str) -> dict:
    """Parse book info page for metadata"""
    info = {
        'title': '',
        'author': '',
        'description': '',
        'cover_image_url': '',
        'category': '',
    }

    # Title from H1
    h1 = soup.find('h1')
    if h1:
        info['title'] = h1.get_text(strip=True)

    # Cover image - look for the book cover link pattern
    cover_link = soup.find('a', href=re.compile(r'/files/article/image/'))
    if cover_link:
        img = cover_link.find('img')
        if img and img.get('src'):
            info['cover_image_url'] = urljoin(url, img['src'])
    else:
        # Alternative: look for img with specific path
        img = soup.find('img', src=re.compile(r'/files/article/image/'))
        if img:
            info['cover_image_url'] = urljoin(url, img['src'])

    # Description - look for "内容简介" section
    desc_marker = soup.find(text=re.compile(r'内容简介'))
    if desc_marker:
        # Find the parent element and get text after the marker
        parent = desc_marker.parent
        if parent:
            # Get siblings or next text
            next_elem = parent.next_sibling
            desc_parts = []
            while next_elem:
                if hasattr(next_elem, 'get_text'):
                    text = next_elem.get_text(strip=True)
                    if text and not text.startswith('最新章节'):
                        desc_parts.append(text)
                elif isinstance(next_elem, str):
                    text = next_elem.strip()
                    if text:
                        desc_parts.append(text)
                next_elem = next_elem.next_sibling
                if len(desc_parts) > 5:
                    break
            info['description'] = ' '.join(desc_parts)[:500]

    # Author - look in table cells
    author_cell = soup.find(text=re.compile(r'作\s*者'))
    if author_cell:
        parent = author_cell.parent
        if parent:
            # Author is usually in the same row, next cell
            row = parent.find_parent('tr')
            if row:
                cells = row.find_all('td')
                for cell in cells:
                    text = cell.get_text(strip=True)
                    if '作者' in text:
                        info['author'] = text.replace('作', '').replace('者', '').replace('：', '').replace(':', '').strip()
                        break

    return info


def parse_piaotia_chapter_list(soup: BeautifulSoup, url: str) -> List[dict]:
    """Parse chapter list page to extract all chapter links"""
    chapters = []

    # Chapters are in <div class="centent">
    centent_div = soup.find('div', class_='centent')
    if not centent_div:
        return chapters

    # Find all chapter links in <ul><li><a> structure
    chapter_links = centent_div.find_all('a', href=True)

    for idx, link in enumerate(chapter_links):
        href = link.get('href', '')
        title = link.get_text(strip=True)

        # Skip empty links or non-chapter links
        if not href or not title:
            continue
        if href.endswith('.js') or href.startswith('javascript'):
            continue

        # Extract chapter number from title (e.g., "第1章 云澈、萧澈")
        chapter_match = re.search(r'第(\d+)章', title)
        chapter_num = int(chapter_match.group(1)) if chapter_match else idx + 1

        # Build full URL
        chapter_url = urljoin(url, href)

        chapters.append({
            'chapter_number': chapter_num,
            'title': title,
            'url': chapter_url,
        })

    return chapters


def parse_piaotia_chapter_content(soup: BeautifulSoup) -> str:
    """Parse chapter content page to extract the text"""
    # Piaotia chapter content is NOT in a specific div
    # It's plain text with <br /><br /> separators between H1 and footer

    # Find the H1 with chapter title
    h1 = soup.find('h1')
    if not h1:
        return ""

    # Method: extract text from body, filter out UI elements
    body = soup.find('body') or soup

    # Remove scripts and styles first
    for tag in ['script', 'style', 'noscript']:
        for elem in body.find_all(tag):
            elem.decompose()

    # Remove navigation divs by ID/class
    nav_selectors = [
        ('div', {'id': 'guild'}),
        ('div', {'id': 'shop'}),
        ('div', {'class': 'toplink'}),
        ('div', {'class': 'bottomlink'}),
        ('div', {'id': 'feit2'}),
        ('div', {'class': 'tuijian'}),
        ('div', {'id': 'left'}),
        ('div', {'id': 'centerm'}),
        ('div', {'id': 'centerl'}),
    ]
    
    for tag, attrs in nav_selectors:
        for elem in body.find_all(tag, attrs):
            elem.decompose()

    # Get all text nodes
    text_parts = []

    # Find all text that looks like novel content
    for elem in body.find_all(text=True):
        text = elem.strip()
        if not text:
            continue

        # Skip UI elements
        skip_patterns = [
            '选择背景', '选择字体', '飘天文学', '繁體中文', '加入书架',
            '推荐本书', '我的书架', '加入书签', '返回目录', '返回书页',
            '书籍介绍', '章节目录', '上一章', '下一章', '快捷键',
            'fontbig', 'font1', 'font2', 'font3', '返回顶部',
            '章节错误', '点此举报', '重要声明', 'Copyright', 'All rights',
            '阅读更多小说', '永久地址', 'www.piaotia',
            'AD开始', 'AD结束', '翻页上', '翻页下', '标题上', '标题下',
        ]

        if any(skip in text for skip in skip_patterns):
            continue

        # Skip very short texts that are likely UI
        if len(text) < 5 and not re.search(r'[\u4e00-\u9fff]', text):
            continue

        text_parts.append(text)

    # Join and clean up
    content = '\n\n'.join(text_parts)

    # Clean up excessive whitespace
    content = re.sub(r'\n{3,}', '\n\n', content)
    content = re.sub(r' {2,}', ' ', content)

    # Remove &nbsp; artifacts
    content = content.replace('\xa0', ' ')
    content = re.sub(r'\s{4,}', '', content)

    return content.strip()


async def scrape_piaotia_novel(url: str) -> ScrapeResponse:
    """Scrape novel from piaotia.com - handles book info, chapter list, and chapter pages"""

    async with piaotia_http_client() as client:
        # Determine page type from URL
        is_book_info = '/bookinfo/' in url
        is_chapter_list = url.rstrip('/').endswith('/') or 'index.html' in url or '/html/' in url and not re.search(r'/\d+\.html$', url)
        is_chapter_page = re.search(r'/\d+\.html$', url) and '/html/' in url

        # Fetch the page
        content = await fetch_piaotia_page(client, url)
        soup = BeautifulSoup(content, 'lxml')

        # Initialize response data
        title = ""
        author = ""
        description = ""
        cover_image_url = ""
        chapters = []

        # If this is a chapter page, extract content directly
        if is_chapter_page:
            # Get chapter title from H1
            h1 = soup.find('h1')
            if h1:
                full_title = h1.get_text(strip=True)
                # Extract book name and chapter title
                # Format: "书名  第X章 标题"
                parts = re.split(r'第\d+章', full_title)
                if parts:
                    title = parts[0].strip()

                # Extract chapter number
                chapter_match = re.search(r'第(\d+)章\s*(.+)', full_title)
                chapter_num = int(chapter_match.group(1)) if chapter_match else 1
                chapter_title = chapter_match.group(2).strip() if chapter_match else full_title

            # Extract chapter content
            chapter_content = parse_piaotia_chapter_content(soup)

            chapters.append(ScrapedChapter(
                chapter_number=chapter_num,
                title=f"Chapter {chapter_num}",
                original_title=chapter_title,
                url=url,
                content=chapter_content
            ))

            # Try to get book info from the linked book info page
            book_info_link = soup.find('a', href=re.compile(r'/bookinfo/'))
            if book_info_link:
                book_info_url = urljoin(url, book_info_link.get('href'))
                try:
                    book_content = await fetch_piaotia_page(client, book_info_url)
                    book_soup = BeautifulSoup(book_content, 'lxml')
                    book_info = parse_piaotia_book_info(book_soup, book_info_url)
                    title = book_info['title'] or title
                    author = book_info['author']
                    description = book_info['description']
                    cover_image_url = book_info['cover_image_url']
                except Exception as e:
                    print(f"Failed to fetch book info: {e}")

        # If this is a chapter list page
        elif is_chapter_list:
            # Get title from H1
            h1 = soup.find('h1')
            if h1:
                title = h1.get_text(strip=True).replace('最新章节', '').strip()

            # Get author from the list div
            author_div = soup.find('div', class_='list')
            if author_div:
                author_text = author_div.get_text(strip=True)
                if '作者' in author_text:
                    author = author_text.replace('作者', '').replace('：', '').replace(':', '').strip()

            # Extract chapter list - DON'T scrape content yet, just return URLs
            # Content will be fetched on-demand when user opens a chapter
            chapter_list = parse_piaotia_chapter_list(soup, url)

            for ch in chapter_list:
                chapters.append(ScrapedChapter(
                    chapter_number=ch['chapter_number'],
                    title=f"Chapter {ch['chapter_number']}",
                    original_title=ch['title'],
                    url=ch['url'],
                    content=""  # Empty - will be fetched on-demand
                ))

            # Try to get book info
            book_info_link = soup.find('a', href=re.compile(r'/bookinfo/'))
            if book_info_link:
                book_info_url = urljoin(url, book_info_link.get('href'))
                try:
                    book_content = await fetch_piaotia_page(client, book_info_url)
                    book_soup = BeautifulSoup(book_content, 'lxml')
                    book_info = parse_piaotia_book_info(book_soup, book_info_url)
                    title = book_info['title'] or title
                    author = book_info['author'] or author
                    description = book_info['description']
                    cover_image_url = book_info['cover_image_url']
                except Exception as e:
                    print(f"Failed to fetch book info: {e}")

        # If this is a book info page
        elif is_book_info:
            book_info = parse_piaotia_book_info(soup, url)
            title = book_info['title']
            author = book_info['author']
            description = book_info['description']
            cover_image_url = book_info['cover_image_url']

            # Find chapter list link - DON'T scrape content, just return URLs
            chapter_list_link = soup.find('a', href=re.compile(r'/html/'))
            if chapter_list_link:
                chapter_list_url = urljoin(url, chapter_list_link.get('href'))
                try:
                    list_content = await fetch_piaotia_page(client, chapter_list_url)
                    list_soup = BeautifulSoup(list_content, 'lxml')
                    chapter_list = parse_piaotia_chapter_list(list_soup, chapter_list_url)

                    # Just return chapter list without content
                    for ch in chapter_list:
                        chapters.append(ScrapedChapter(
                            chapter_number=ch['chapter_number'],
                            title=f"Chapter {ch['chapter_number']}",
                            original_title=ch['title'],
                            url=ch['url'],
                            content=""  # Empty - will be fetched on-demand
                        ))
                except Exception as e:
                    print(f"Failed to fetch chapter list: {e}")

        else:
            # Generic fallback - try to extract whatever we can
            h1 = soup.find('h1')
            if h1:
                title = h1.get_text(strip=True)

            chapter_content = parse_piaotia_chapter_content(soup)
            if chapter_content:
                chapter_match = re.search(r'第(\d+)章', title)
                chapter_num = int(chapter_match.group(1)) if chapter_match else 1

                chapters.append(ScrapedChapter(
                    chapter_number=chapter_num,
                    title=f"Chapter {chapter_num}",
                    original_title=title,
                    url=url,
                    content=chapter_content
                ))

    return ScrapeResponse(
        title=title,
        original_title=title,
        author=author,
        description=description,
        cover_image_url=cover_image_url,
        chapters=chapters
    )




def extract_terms_from_text(text: str, source_lang: str, target_lang: str) -> List[ExtractedTerm]:
    """
    Extract potential terminology from text.
    Uses frequency analysis and pattern matching.
    """
    terms = []
    found_terms = set()
    
    # First, check for known terminology in the text
    for original, info in KNOWN_TERMINOLOGY.items():
        if original in text:
            found_terms.add(original)
            terms.append(ExtractedTerm(
                original=original,
                term=original,
                translation=info["translation"],
                type=info["type"],
                description=info["description"],
                confidence=1.0
            ))
    
    # Then extract high-frequency Chinese terms (potential names)
    # Pattern for Chinese characters (2-4 chars, likely names)
    chinese_pattern = re.compile(r'[\u4e00-\u9fff]{2,4}')
    matches = chinese_pattern.findall(text)
    
    # Count frequency
    freq = Counter(matches)
    
    # Extract high-frequency terms (appear 2+ times)
    for term, count in freq.most_common(30):
        if term in found_terms:
            continue
        if count >= 2 and term not in ['的话', '虽然', '但是', '这个', '那个', '不是', '没有', '已经', '可以', '什么']:
            # Try to translate the term
            try:
                translation = translate_with_google(term, source_lang, target_lang)
            except Exception:
                translation = term
            
            terms.append(ExtractedTerm(
                original=term,
                term=term,
                translation=translation,
                type="unknown",
                description=f"Appears {count} times in text",
                confidence=0.5
            ))
            found_terms.add(term)
    
    return terms[:50]


# Import Korean scraper
from korean_scraper import scrape_korean_novel

# API Endpoints
@app.post("/scrape", response_model=ScrapeResponse)
async def scrape_novel(request: ScrapeRequest):
    """Scrape a novel from supported sources (Chinese & Korean)"""
    try:
        # Korean sources
        if "munpia" in request.url or "munpia.com" in request.url:
            return await scrape_korean_novel(request.url)
        elif "ridibooks" in request.url or "ridibooks.com" in request.url:
            return await scrape_korean_novel(request.url)
        elif "series.naver.com" in request.url:
            return await scrape_korean_novel(request.url)
        elif "page.kakao.com" in request.url:
            return await scrape_korean_novel(request.url)
        elif "novelpia" in request.url or "novelpia.com" in request.url:
            return await scrape_korean_novel(request.url)
        # Chinese sources
        elif "piaotia.com" in request.url:
            return await scrape_piaotia_novel(request.url)
        elif "qidian.com" in request.url or "qidian.qq.com" in request.url:
            return await scrape_qidian_novel(request.url)
        elif "69shu.com" in request.url:
            return await scrape_69shu_novel(request.url)
        elif "zongheng.com" in request.url:
            return await scrape_zongheng_novel(request.url)
        elif "17k.com" in request.url:
            return await scrape_17k_novel(request.url)
        else:
            # Try generic scraping - detect if Korean or Chinese
            if any(kw in request.url.lower() for kw in ['ko', 'korean', 'munpia', 'ridibooks', 'naver', 'kakao']):
                return await scrape_korean_novel(request.url)
            else:
                return await scrape_generic_novel(request.url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scraping failed: {str(e)}")


class ChapterContentRequest(BaseModel):
    url: str


class ChapterContentResponse(BaseModel):
    content: str
    chapter_number: int
    title: str


@app.post("/chapter", response_model=ChapterContentResponse)
async def get_chapter_content(request: ChapterContentRequest):
    """Fetch content for a single chapter on-demand"""
    try:
        async with piaotia_http_client() as client:
            if "piaotia.com" in request.url:
                content = await fetch_piaotia_page(client, request.url)
                soup = BeautifulSoup(content, 'lxml')
                
                # Extract chapter info
                h1 = soup.find('h1')
                full_title = h1.get_text(strip=True) if h1 else ""
                
                # Extract chapter number
                chapter_match = re.search(r'第(\d+)章', full_title)
                chapter_num = int(chapter_match.group(1)) if chapter_match else 1
                
                # Extract chapter title
                title_match = re.search(r'第\d+章\s*(.+)', full_title)
                chapter_title = title_match.group(1).strip() if title_match else full_title
                
                # Extract content
                chapter_content = parse_piaotia_chapter_content(soup)
                
                return ChapterContentResponse(
                    content=chapter_content,
                    chapter_number=chapter_num,
                    title=chapter_title
                )
            else:
                raise HTTPException(status_code=400, detail="Unsupported URL")
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise HTTPException(status_code=429, detail="Rate limited. Please wait a moment and try again.")
        raise HTTPException(status_code=500, detail=f"Failed to fetch chapter: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch chapter: {str(e)}")


async def scrape_qidian_novel(url: str) -> ScrapeResponse:
    """Scrape novel from qidian.com"""
    async with httpx.AsyncClient() as client:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = await client.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        content = response.text

    soup = BeautifulSoup(content, 'lxml')

    # Extract title
    title_elem = soup.find('h1') or soup.find('span', class_='book-name')
    title = title_elem.get_text(strip=True) if title_elem else "Unknown Novel"

    # Extract author
    author = ""
    author_elem = soup.find('span', class_='author') or soup.find('a', class_='writer')
    if author_elem:
        author = author_elem.get_text(strip=True)

    # Extract content
    content_div = soup.find('div', class_='read-content') or soup.find('div', id='chapter-content')
    chapter_content = ""
    if content_div:
        for script in content_div(['script', 'style']):
            script.decompose()
        chapter_content = content_div.get_text(separator='\n', strip=True)
        chapter_content = re.sub(r'\n{3,}', '\n\n', chapter_content)

    # Extract chapter number from URL or title
    chapter_match = re.search(r'第(\d+)章', title) or re.search(r'/(\d+)/', url)
    chapter_num = int(chapter_match.group(1)) if chapter_match else 1

    return ScrapeResponse(
        title=title,
        original_title=title,
        author=author,
        description="",
        cover_image_url="",
        chapters=[ScrapedChapter(
            chapter_number=chapter_num,
            title=f"Chapter {chapter_num}",
            original_title=title,
            url=url,
            content=chapter_content
        )]
    )


async def scrape_69shu_novel(url: str) -> ScrapeResponse:
    """Scrape novel from 69shu.com"""
    async with httpx.AsyncClient() as client:
        response = await client.get(url, timeout=30)
        response.raise_for_status()
        try:
            content = response.content.decode('gbk')
        except Exception:
            content = response.text

    soup = BeautifulSoup(content, 'lxml')

    title_elem = soup.find('h1')
    title = title_elem.get_text(strip=True) if title_elem else "Unknown Novel"

    content_div = soup.find('div', class_='yd_text2') or soup.find('div', id='content')
    chapter_content = ""
    if content_div:
        for script in content_div(['script', 'style']):
            script.decompose()
        chapter_content = content_div.get_text(separator='\n', strip=True)

    chapter_match = re.search(r'第(\d+)章', title)
    chapter_num = int(chapter_match.group(1)) if chapter_match else 1

    return ScrapeResponse(
        title=title,
        original_title=title,
        author="",
        description="",
        cover_image_url="",
        chapters=[ScrapedChapter(
            chapter_number=chapter_num,
            title=f"Chapter {chapter_num}",
            original_title=title,
            url=url,
            content=chapter_content
        )]
    )


async def scrape_zongheng_novel(url: str) -> ScrapeResponse:
    """Scrape novel from zongheng.com"""
    async with httpx.AsyncClient() as client:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = await client.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        content = response.text

    soup = BeautifulSoup(content, 'lxml')

    title_elem = soup.find('h1') or soup.find('div', class_='title')
    title = title_elem.get_text(strip=True) if title_elem else "Unknown Novel"

    content_div = soup.find('div', class_='content') or soup.find('div', id='chapterContent')
    chapter_content = ""
    if content_div:
        for script in content_div(['script', 'style']):
            script.decompose()
        chapter_content = content_div.get_text(separator='\n', strip=True)

    chapter_match = re.search(r'第(\d+)章', title)
    chapter_num = int(chapter_match.group(1)) if chapter_match else 1

    return ScrapeResponse(
        title=title,
        original_title=title,
        author="",
        description="",
        cover_image_url="",
        chapters=[ScrapedChapter(
            chapter_number=chapter_num,
            title=f"Chapter {chapter_num}",
            original_title=title,
            url=url,
            content=chapter_content
        )]
    )


async def scrape_17k_novel(url: str) -> ScrapeResponse:
    """Scrape novel from 17k.com"""
    async with httpx.AsyncClient() as client:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = await client.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        content = response.text

    soup = BeautifulSoup(content, 'lxml')

    title_elem = soup.find('h1') or soup.find('div', class_='chapter-title')
    title = title_elem.get_text(strip=True) if title_elem else "Unknown Novel"

    content_div = soup.find('div', class_='p') or soup.find('div', id='readArea')
    chapter_content = ""
    if content_div:
        for script in content_div(['script', 'style']):
            script.decompose()
        chapter_content = content_div.get_text(separator='\n', strip=True)

    chapter_match = re.search(r'第(\d+)章', title)
    chapter_num = int(chapter_match.group(1)) if chapter_match else 1

    return ScrapeResponse(
        title=title,
        original_title=title,
        author="",
        description="",
        cover_image_url="",
        chapters=[ScrapedChapter(
            chapter_number=chapter_num,
            title=f"Chapter {chapter_num}",
            original_title=title,
            url=url,
            content=chapter_content
        )]
    )


async def scrape_generic_novel(url: str) -> ScrapeResponse:
    """Generic novel scraper - tries to extract content from any page"""
    async with httpx.AsyncClient() as client:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = await client.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        try:
            content = response.content.decode('gbk')
        except Exception:
            content = response.text

    soup = BeautifulSoup(content, 'lxml')

    # Try to find title
    title_elem = soup.find('h1') or soup.find('title')
    title = title_elem.get_text(strip=True) if title_elem else "Unknown Novel"

    # Try common content selectors
    content_selectors = [
        ('div', {'id': 'content'}),
        ('div', {'class': 'content'}),
        ('div', {'class': 'chapter-content'}),
        ('div', {'class': 'article-content'}),
        ('article', {}),
        ('div', {'class': 'post-content'}),
    ]

    chapter_content = ""
    for tag, attrs in content_selectors:
        content_div = soup.find(tag, attrs) if attrs else soup.find(tag)
        if content_div:
            for script in content_div(['script', 'style', 'nav', 'header', 'footer']):
                script.decompose()
            chapter_content = content_div.get_text(separator='\n', strip=True)
            if len(chapter_content) > 100:  # Found substantial content
                break

    chapter_match = re.search(r'第(\d+)章', title)
    chapter_num = int(chapter_match.group(1)) if chapter_match else 1

    return ScrapeResponse(
        title=title,
        original_title=title,
        author="",
        description="",
        cover_image_url="",
        chapters=[ScrapedChapter(
            chapter_number=chapter_num,
            title=f"Chapter {chapter_num}",
            original_title=title,
            url=url,
            content=chapter_content
        )]
    )


@app.post("/translate", response_model=TranslateResponse)
async def translate_content(request: TranslateRequest):
    """Translate content with terminology consistency using Google Translate (fallback)"""
    try:
        # First, translate the main text
        translated = translate_with_google(
            request.text,
            request.source_lang,
            request.target_lang
        )

        # Apply terminology replacements
        translated = apply_terminology(
            translated,
            request.terminology,
            request.source_lang,
            request.target_lang
        )

        return TranslateResponse(
            translated_text=translated,
            model_used="google-translate",
            tokens_used=len(request.text)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")


@app.post("/translate/agentic", response_model=AgenticTranslateResponse)
async def translate_agentic(request: AgenticTranslateRequest):
    """
    Translate content using agentic AI with full context awareness.
    Supports OpenAI GPT and Google Gemini.
    Two-step translation: Literal → Polish for literary quality.
    API keys can be provided in request or use server defaults.
    """
    try:
        # Determine provider
        provider = request.provider or os.getenv("LLM_PROVIDER", "openai").lower()
        
        # Get API keys - prefer request keys over environment
        openai_key = request.openai_api_key
        gemini_key = request.gemini_api_key
        
        # Validate that at least one API key is provided (strict BYOK)
        if not openai_key and not gemini_key:
            raise HTTPException(status_code=400, detail="API key required. Please add your OpenAI or Gemini API key in Settings.")
        
        # Validate selected provider has a key
        provider_lower = provider.lower() if provider else "openai"
        if provider_lower == "openai" and not openai_key:
            raise HTTPException(status_code=400, detail="OpenAI API key required for OpenAI provider.")
        if provider_lower == "gemini" and not gemini_key:
            raise HTTPException(status_code=400, detail="Gemini API key required for Gemini provider.")
        
        # Create translator with user-provided or server keys
        provider_enum = LLMProvider.OPENAI if provider == "openai" else LLMProvider.GEMINI
        translator = AgenticTranslator(
            provider=provider_enum,
            openai_api_key=openai_key,
            gemini_api_key=gemini_key,
        )
        
        # Build terminology list
        terms = []
        for term in request.terminology:
            terms.append(TerminologyTerm(
                original=term.original,
                translation=term.translation,
                term_type="unknown",
                description="",
                confidence=1.0,
            ))
        
        # Add known terminology if novel_id is provided
        if request.novel_id:
            known_terms = terminology_manager.get_terminology(request.novel_id)
            terms.extend(known_terms)
        
        # Build context
        context = None
        if request.novel_id:
            context = context_manager.get_context(request.novel_id)
        
        if context is None:
            # Create new context from request
            context = NovelContext(
                novel_title=request.novel_title or "Unknown",
                novel_title_th=request.novel_title_th or "ไม่ทราบชื่อ",
                author=request.author or "",
                genre=request.genre,
                tone=request.tone,
                main_characters=[],
                terminology=terms,
                previous_chapters=[
                    ChapterContext(
                        chapter_number=ctx.chapter_number,
                        chapter_title="",
                        source_text=ctx.source_text,
                        translated_text=ctx.translated_text,
                        key_events=[],
                    )
                    for ctx in request.translation_context
                ],
                pronoun_style=request.pronoun_style,
            )
        
        # Perform translation
        result = await translator.translate_chapter(
            text=request.text,
            context=context,
            terminology=terms,
            two_step=request.two_step,
        )
        
        # Update context if chapter info provided
        if request.novel_id and request.chapter_number:
            context_manager.add_chapter_context(
                novel_id=request.novel_id,
                chapter_number=request.chapter_number,
                chapter_title=request.chapter_title or "",
                source_text=request.text[:1000],
                translated_text=result.translated_text[:1000],
            )
        
        return AgenticTranslateResponse(
            translated_text=result.translated_text,
            literal_translation=result.literal_translation if request.two_step else None,
            polished_translation=result.polished_translation if request.two_step else None,
            model_used=result.model_used,
            provider=result.provider,
            tokens_used=result.tokens_used,
            terms_applied=result.terms_applied,
            quality_score=result.quality_score,
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Fallback to Google Translate on error
        print(f"Agentic translation failed: {e}, falling back to Google Translate")
        try:
            translated = translate_with_google(
                request.text,
                request.source_lang,
                request.target_lang
            )
            return AgenticTranslateResponse(
                translated_text=translated,
                model_used="google-translate",
                provider="google_translate",
                tokens_used=len(request.text),
            )
        except Exception as fallback_error:
            raise HTTPException(status_code=500, detail=f"Translation failed: {str(fallback_error)}")


@app.post("/context/initialize")
async def initialize_novel_context(request: InitializeContextRequest):
    """Initialize context for a novel before translation"""
    try:
        context = context_manager.initialize_context(
            novel_id=request.novel_id,
            title=request.novel_title,
            title_th=request.novel_title_th,
            author=request.author,
            genre=request.genre,
            tone=request.tone,
        )
        context.pronoun_style = request.pronoun_style
        
        return {"success": True, "novel_id": request.novel_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialize context: {str(e)}")


@app.post("/context/add-chapter")
async def add_chapter_context(request: AddChapterContextRequest):
    """Add a translated chapter to the context for future translations"""
    try:
        context_manager.add_chapter_context(
            novel_id=request.novel_id,
            chapter_number=request.chapter_number,
            chapter_title=request.chapter_title,
            source_text=request.source_text,
            translated_text=request.translated_text,
            key_events=request.key_events,
        )
        
        return {"success": True, "chapter_number": request.chapter_number}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add chapter context: {str(e)}")


@app.post("/terminology/update")
async def update_novel_terminology(request: UpdateTerminologyRequest):
    """Update terminology for a novel"""
    try:
        terms = [
            TerminologyTerm(
                original=term.original,
                translation=term.translation,
                term_type="unknown",
                description="",
                confidence=1.0,
            )
            for term in request.terms
        ]
        
        context_manager.update_terminology(request.novel_id, terms)
        
        return {"success": True, "terms_count": len(terms)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update terminology: {str(e)}")


@app.get("/terminology/known")
async def get_known_terminology():
    """Get pre-defined terminology for popular novels."""
    return {
        "novel": "Against the Gods (逆天邪神)",
        "terminology": [
            {"original": k, **v} for k, v in KNOWN_TERMINOLOGY.items()
        ]
    }


@app.get("/terminology/{novel_id}")
async def get_novel_terminology(novel_id: str):
    """Get terminology for a novel"""
    terms = terminology_manager.get_terminology(novel_id)
    return {
        "novel_id": novel_id,
        "terms": [
            {
                "original": term.original,
                "translation": term.translation,
                "type": term.term_type,
                "description": term.description,
            }
            for term in terms
        ]
    }


@app.post("/extract-terminology", response_model=ExtractTerminologyResponse)
async def extract_terminology(request: ExtractTerminologyRequest):
    """Extract terminology from text for consistent translation"""
    try:
        terms = extract_terms_from_text(
            request.text,
            request.source_lang,
            request.target_lang
        )
        
        return ExtractTerminologyResponse(terms=terms)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Terminology extraction failed: {str(e)}")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "cache_stats": translation_cache.get_stats(),
    }


@app.get("/pipeline/stats")
async def get_pipeline_stats():
    """Get translation pipeline statistics"""
    return {
        "cache": translation_cache.get_stats(),
        "cache_hit_rate": f"{translation_cache.hit_rate:.1f}%",
    }


@app.get("/sources/korean")
async def get_korean_sources():
    """Get supported Korean novel sources"""
    return {
        "sources": [
            {
                "id": "munpia",
                "name": "문피아 (Munpia)",
                "url_pattern": "https://www.munpia.com/...",
                "description": "Largest Korean web novel platform",
                "language": "ko",
            },
            {
                "id": "ridibooks",
                "name": "리디북스 (Ridibooks)",
                "url_pattern": "https://ridibooks.com/...",
                "description": "Popular Korean ebook/novel platform",
                "language": "ko",
            },
            {
                "id": "naver",
                "name": "네이버 시리즈 (Naver Series)",
                "url_pattern": "https://series.naver.com/...",
                "description": "Naver's web novel/manga platform",
                "language": "ko",
            },
            {
                "id": "kakao",
                "name": "카카오페이지 (KakaoPage)",
                "url_pattern": "https://page.kakao.com/...",
                "description": "Kakao's webtoon/novel platform",
                "language": "ko",
            },
            {
                "id": "novelpia",
                "name": "NovelPia",
                "url_pattern": "https://novelpia.com/...",
                "description": "Korean web novel platform",
                "language": "ko",
            },
        ]
    }


# ==================== MULTI-AGENT PIPELINE ENDPOINTS ====================

class CharacterModel(BaseModel):
    """Character info for pipeline"""
    original_name: str
    thai_name: str
    personality: Optional[str] = ""
    role: Optional[str] = ""


class TermModel(BaseModel):
    """Terminology term"""
    original: str
    translation: str
    type: str
    description: Optional[str] = ""


class PipelineTranslateRequest(BaseModel):
    """Request for multi-agent pipeline translation"""
    text: str
    novel_id: str
    novel_title: str
    novel_title_th: str
    chapter_number: int
    chapter_title: Optional[str] = ""
    author: Optional[str] = ""
    genre: Optional[str] = "fantasy"
    tone: Optional[str] = "dark"
    pronoun_style: Optional[str] = "traditional"
    characters: List[CharacterModel] = []
    terminology: List[TermModel] = []
    target_quality: Optional[str] = "B"          # A, B, C, D
    skip_polish: Optional[bool] = False          # Skip style agent for speed
    add_to_review_queue: Optional[bool] = True   # Add to human review queue
    openai_api_key: Optional[str] = None
    model: Optional[str] = "gpt-4o"


class PipelineTranslateResponse(BaseModel):
    """Response from multi-agent pipeline"""
    translated_text: str
    grade: str
    overall_score: float
    terminology_score: float
    flow_score: float
    accuracy_score: float
    dialogue_score: float
    issues: List[str]
    strengths: List[str]
    needs_human_review: bool
    review_queue_id: Optional[str] = None
    agent_summary: Dict


class ReviewPendingResponse(BaseModel):
    """Response for pending reviews"""
    items: List[Dict]
    total: int


class ReviewApproveRequest(BaseModel):
    """Request to approve review"""
    item_id: str
    reviewer: Optional[str] = "anonymous"


class ReviewEditRequest(BaseModel):
    """Request to edit and approve review"""
    item_id: str
    edited_text: str
    reviewer: Optional[str] = "anonymous"


class ReviewRejectRequest(BaseModel):
    """Request to reject review"""
    item_id: str
    reviewer: Optional[str] = "anonymous"
    notes: Optional[str] = ""


class ReviewStatsResponse(BaseModel):
    """Response for review queue stats"""
    pending: int
    approved: int
    rejected: int
    total_processed: int


# Global pipeline instance
_pipeline: Optional[TranslationPipeline] = None


def get_pipeline(model: str = "gpt-4o", target_quality: str = "B") -> TranslationPipeline:
    """Get or create pipeline instance"""
    global _pipeline
    if _pipeline is None:
        _pipeline = create_pipeline(model=model, target_quality=target_quality)
    return _pipeline


@app.post("/translate/pipeline", response_model=PipelineTranslateResponse)
async def translate_with_pipeline(request: PipelineTranslateRequest):
    """
    Translate using multi-agent pipeline:
    Agent 1: Translation (literal)
    Agent 2: Terminology Check (consistency)
    Agent 3: Style Polish (literary)
    Agent 4: Quality Scoring
    
    Quality grades: A (excellent), B (good), C (needs review), D (needs retranslation)
    """
    try:
        # Build characters
        characters = [
            CharacterInfo(
                original_name=c.original_name,
                thai_name=c.thai_name,
                personality=c.personality or "",
                role=c.role or "",
            )
            for c in request.characters
        ]
        
        # Build terminology
        terms = [
            TermModel(
                original=t.original,
                translation=t.translation,
                type=t.type,
                description=t.description or "",
            )
            for t in request.terminology
        ]
        
        # Convert to internal format
        from multi_agent_translator import TerminologyTerm
        terminology = [
            TerminologyTerm(t.original, t.translation, t.type, t.description)
            for t in terms
        ]
        
        # Build context
        from multi_agent_translator import NovelContext as PipelineNovelContext
        context = PipelineNovelContext(
            novel_title=request.novel_title,
            novel_title_th=request.novel_title_th,
            author=request.author or "",
            genre=request.genre,
            tone=request.tone,
            main_characters=characters,
            terminology=terminology,
            previous_chapters=[],
            pronoun_style=request.pronoun_style,
            target_quality=request.target_quality,
        )
        
        # Run pipeline
        pipeline = get_pipeline(request.model, request.target_quality)
        if request.openai_api_key:
            pipeline = TranslationPipeline(
                openai_key=request.openai_api_key,
                model=request.model,
                target_quality=request.target_quality,
            )
        
        result = await pipeline.translate(
            text=request.text,
            context=context,
            terminology=terminology,
            skip_polish=request.skip_polish,
        )
        
        # Add to review queue if needed
        review_id = None
        if request.add_to_review_queue and result.needs_human_review:
            # Add to in-memory queue
            item = review_queue.add_to_queue(
                result=result,
                novel_id=request.novel_id,
                chapter_number=request.chapter_number,
                original_text=request.text,
                novel_title=request.novel_title_th,
                chapter_title=request.chapter_title or "",
            )
            review_id = item.id
            
            # Also save to database (if available)
            try:
                db = await get_db_manager()
                await db.add_to_review_queue(
                    item_id=review_id,
                    novel_id=request.novel_id,
                    chapter_number=request.chapter_number,
                    original_text=request.text[:1000],  # Store first 1000 chars
                    translated_text=result.final_text,
                    grade=result.quality_score.grade.value,
                    overall_score=result.quality_score.overall_score,
                    issues=result.quality_score.issues,
                    strengths=result.quality_score.strengths,
                    priority=result.quality_score.review_priority,
                    novel_title=request.novel_title_th,
                    chapter_title=request.chapter_title or "",
                )
            except Exception as e:
                print(f"Warning: Could not save to database: {e}")
        
        # Build agent summary
        agent_summary = {
            "translation_tokens": sum(r.tokens_used for r in result.agent_results if r.agent_role.value == "translator"),
            "terminology_fixes": len([r for r in result.agent_results if r.agent_role.value == "terminology" and r.issues_found]),
            "style_polish": not request.skip_polish,
            "total_processing_time": sum(r.processing_time for r in result.agent_results),
        }
        
        return PipelineTranslateResponse(
            translated_text=result.final_text,
            grade=result.quality_score.grade.value,
            overall_score=result.quality_score.overall_score,
            terminology_score=result.quality_score.terminology_score,
            flow_score=result.quality_score.flow_score,
            accuracy_score=result.quality_score.accuracy_score,
            dialogue_score=result.quality_score.dialogue_score,
            issues=result.quality_score.issues,
            strengths=result.quality_score.strengths,
            needs_human_review=result.needs_human_review,
            review_queue_id=review_id,
            agent_summary=agent_summary,
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline translation failed: {str(e)}")


@app.get("/review/pending", response_model=ReviewPendingResponse)
async def get_pending_reviews(novel_id: Optional[str] = None, limit: int = 20):
    """
    Get translations pending human review.
    Sorted by priority (higher priority = more urgent).
    """
    # Try to get from database first
    try:
        db = await get_db_manager()
        db_items = await db.get_pending_reviews(novel_id, limit)
        if db_items:
            return ReviewPendingResponse(items=db_items, total=len(db_items))
    except Exception as e:
        print(f"Warning: Could not fetch from database: {e}")
    
    # Fallback to in-memory queue
    items = review_queue.get_pending_reviews(novel_id, limit)
    
    return ReviewPendingResponse(
        items=[
            {
                "id": item.id,
                "novel_id": item.novel_id,
                "novel_title": item.novel_title,
                "chapter_number": item.chapter_number,
                "chapter_title": item.chapter_title,
                "translated_text": item.translated_text,
                "grade": item.quality_score.grade.value,
                "overall_score": item.quality_score.overall_score,
                "issues": item.quality_score.issues,
                "priority": item.priority,
                "created_at": item.created_at.isoformat(),
            }
            for item in items
        ],
        total=len(items),
    )


@app.post("/review/approve")
async def approve_review(request: ReviewApproveRequest):
    """Approve a translation in the review queue."""
    # Try database first
    try:
        db = await get_db_manager()
        success = await db.approve_review(request.item_id, request.reviewer)
        if success:
            return {
                "success": True,
                "item_id": request.item_id,
                "status": "approved",
                "reviewed_by": request.reviewer,
            }
    except Exception as e:
        print(f"Warning: Could not update database: {e}")
    
    # Fallback to in-memory queue
    item = review_queue.approve_review(request.item_id, request.reviewer)
    
    if not item:
        raise HTTPException(status_code=404, detail="Review item not found")
    
    return {
        "success": True,
        "item_id": item.id,
        "status": item.status.value,
        "reviewed_by": item.reviewed_by,
    }


@app.post("/review/edit")
async def edit_review(request: ReviewEditRequest):
    """Edit and approve a translation in the review queue."""
    # Try database first
    try:
        db = await get_db_manager()
        success = await db.edit_review(request.item_id, request.edited_text, request.reviewer)
        if success:
            return {
                "success": True,
                "item_id": request.item_id,
                "status": "edited",
                "edited_text": request.edited_text,
                "reviewed_by": request.reviewer,
            }
    except Exception as e:
        print(f"Warning: Could not update database: {e}")
    
    # Fallback to in-memory queue
    item = review_queue.edit_review(request.item_id, request.edited_text, request.reviewer)
    
    if not item:
        raise HTTPException(status_code=404, detail="Review item not found")
    
    return {
        "success": True,
        "item_id": item.id,
        "status": item.status.value,
        "edited_text": item.edited_text,
        "reviewed_by": item.reviewed_by,
    }


@app.post("/review/reject")
async def reject_review(request: ReviewRejectRequest):
    """Reject a translation (needs retranslation)."""
    # Try database first
    try:
        db = await get_db_manager()
        success = await db.reject_review(request.item_id, request.reviewer, request.notes)
        if success:
            return {
                "success": True,
                "item_id": request.item_id,
                "status": "rejected",
                "notes": request.notes,
            }
    except Exception as e:
        print(f"Warning: Could not update database: {e}")
    
    # Fallback to in-memory queue
    item = review_queue.reject_review(request.item_id, request.reviewer, request.notes)
    
    if not item:
        raise HTTPException(status_code=404, detail="Review item not found")
    
    return {
        "success": True,
        "item_id": item.id,
        "status": item.status.value,
        "notes": item.notes,
    }


@app.get("/review/stats", response_model=ReviewStatsResponse)
async def get_review_stats():
    """Get review queue statistics."""
    stats = review_queue.get_stats()
    return ReviewStatsResponse(**stats)


@app.get("/review/{item_id}")
async def get_review_item(item_id: str):
    """Get a specific review item details."""
    # Check pending queue
    if item_id in review_queue._queue:
        item = review_queue._queue[item_id]
        return {
            "id": item.id,
            "novel_id": item.novel_id,
                "novel_title": item.novel_title,
            "chapter_number": item.chapter_number,
                "chapter_title": item.chapter_title,
            "original_text": item.original_text,
            "translated_text": item.translated_text,
            "grade": item.quality_score.grade.value,
            "overall_score": item.quality_score.overall_score,
            "terminology_score": item.quality_score.terminology_score,
            "flow_score": item.quality_score.flow_score,
            "accuracy_score": item.quality_score.accuracy_score,
            "dialogue_score": item.quality_score.dialogue_score,
            "issues": item.quality_score.issues,
            "strengths": item.quality_score.strengths,
            "status": item.status.value,
            "priority": item.priority,
            "created_at": item.created_at.isoformat(),
        }
    
    # Check approved
    if item_id in review_queue._approved:
        item = review_queue._approved[item_id]
        return {
            "id": item.id,
            "novel_id": item.novel_id,
                "novel_title": item.novel_title,
            "chapter_number": item.chapter_number,
                "chapter_title": item.chapter_title,
            "translated_text": item.edited_text or item.translated_text,
            "grade": item.quality_score.grade.value,
            "status": item.status.value,
            "reviewed_by": item.reviewed_by,
            "reviewed_at": item.reviewed_at.isoformat() if item.reviewed_at else None,
        }
    
    raise HTTPException(status_code=404, detail="Review item not found")


@app.get("/approved/{novel_id}/{chapter_number}")
async def get_approved_translation(novel_id: str, chapter_number: int):
    """Get approved translation for a chapter."""
    item = review_queue.get_approved(novel_id, chapter_number)
    
    if not item:
        raise HTTPException(status_code=404, detail="No approved translation found for this chapter")
    
    return {
        "novel_id": novel_id,
        "chapter_number": chapter_number,
        "translated_text": item.edited_text or item.translated_text,
        "grade": item.quality_score.grade.value,
        "reviewed_by": item.reviewed_by,
        "reviewed_at": item.reviewed_at.isoformat() if item.reviewed_at else None,
    }


# ==================== MANGA TRANSLATION ENDPOINTS ====================

class MangaTranslateRequest(BaseModel):
    """Request for manga image translation"""
    image_base64: str                    # Base64 encoded image
    source_lang: str = "ko"              # ko, ja, zh, zh-TW
    target_lang: str = "th"              # Target language
    render_style: str = "overlay"        # overlay, inpaint, side_by_side
    series_title: Optional[str] = ""
    chapter_number: Optional[int] = 0
    characters: List[Dict] = []          # [{name: "", personality: ""}]
    tone: str = "casual"                 # casual, serious, comedy, action
    setting: str = ""                    # modern, fantasy, historical, sci-fi
    provider: Optional[str] = None       # openai or gemini
    model: Optional[str] = "gpt-4o"
    openai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None


class TextRegionResponse(BaseModel):
    """Response for a detected text region"""
    bbox: List[int]                      # [x1, y1, x2, y2]
    original_text: str
    translated_text: str
    confidence: float
    region_type: str                     # speech, narration, sfx, title, sign, thought
    font_size: int
    is_vertical: bool


class MangaTranslateResponse(BaseModel):
    """Response from manga translation"""
    model_config = {"protected_namespaces": ()}  # Fix Pydantic warning for model_used field

    translated_image_base64: str         # Base64 encoded translated image
    original_image_base64: str           # Base64 encoded original image (for comparison)
    regions: List[TextRegionResponse]
    model_used: str
    provider: str
    tokens_used: int = 0


class MangaExtractTextRequest(BaseModel):
    """Request for text extraction only (no translation)"""
    image_base64: str
    source_lang: str = "ko"              # ko, ja, zh, zh-TW


class MangaExtractTextResponse(BaseModel):
    """Response for text extraction"""
    regions: List[TextRegionResponse]
    extracted_text: str                  # All text combined


class MangaBatchTranslateRequest(BaseModel):
    """Request for batch manga translation"""
    images: List[str]                    # List of base64 encoded images
    source_lang: str = "ko"
    target_lang: str = "th"
    render_style: str = "overlay"
    series_title: Optional[str] = ""
    chapter_start: Optional[int] = 1
    characters: List[Dict] = []
    tone: str = "casual"
    setting: str = ""
    provider: Optional[str] = None
    model: Optional[str] = "gpt-4o"
    openai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None


class MangaBatchTranslateResponse(BaseModel):
    """Response for batch manga translation"""
    results: List[MangaTranslateResponse]
    total_pages: int
    successful_pages: int
    total_tokens_used: int


# Global manga translator instance
_manga_translator: Optional[MangaTranslationPipeline] = None


def get_manga_translator(
    source_lang: str = "ko",
    provider: str = "openai",
    model: str = "gpt-4o",
    openai_key: str = None,
    gemini_key: str = None
) -> MangaTranslationPipeline:
    """Get or create manga translator instance"""
    openai_key = openai_key
    gemini_key = gemini_key

    return create_manga_translator(
        openai_api_key=openai_key,
        gemini_api_key=gemini_key,
        model=model,
        source_lang=source_lang
    )


@app.post("/manga/translate", response_model=MangaTranslateResponse)
async def translate_manga_image(request: MangaTranslateRequest):
    """
    Translate a manga/manhwa image.

    Process:
    1. OCR extracts text from speech bubbles, narration boxes, etc.
    2. AI translates text with manga context (characters, tone)
    3. Render translated text back onto the image

    Supported languages: Korean (ko), Japanese (ja), Chinese (zh)
    Render styles: overlay (semi-transparent), inpaint (replace text), side_by_side
    """
    try:
        # Decode base64 image
        image_data = base64.b64decode(request.image_base64)
        image = Image.open(BytesIO(image_data))

        # Map source language
        lang_map = {
            "ko": SourceLanguage.KOREAN,
            "ja": SourceLanguage.JAPANESE,
            "zh": SourceLanguage.CHINESE,
            "zh-TW": SourceLanguage.CHINESE_TRAD,
            "en": SourceLanguage.ENGLISH,
        }
        source_lang = lang_map.get(request.source_lang, SourceLanguage.KOREAN)

        # Build translation context
        context = MangaTranslationContext(
            series_title=request.series_title or "",
            chapter_number=request.chapter_number or 0,
            characters=request.characters,
            previous_dialogues=[],
            tone=request.tone,
            setting=request.setting,
        )

        # Get translator
        provider = request.provider or os.getenv("LLM_PROVIDER", "openai").lower()
        translator = get_manga_translator(
            source_lang=request.source_lang,
            provider=provider,
            model=request.model,
            openai_key=request.openai_api_key,
            gemini_key=request.gemini_api_key,
        )

        # Run translation
        result = await translator.translate_image(
            image=image,
            source_lang=source_lang,
            context=context,
            render_style=request.render_style,
        )

        # Build response
        regions_response = []
        for region in result.regions:
            regions_response.append(TextRegionResponse(
                bbox=list(region.bbox),
                original_text=region.text,
                translated_text=region.translated_text,
                confidence=region.confidence,
                region_type=region.region_type.value,
                font_size=region.font_size,
                is_vertical=region.is_vertical,
            ))

        return MangaTranslateResponse(
            translated_image_base64=base64.b64encode(result.translated_image).decode('utf-8'),
            original_image_base64=base64.b64encode(result.original_image).decode('utf-8'),
            regions=regions_response,
            model_used=result.model_used,
            provider=result.provider,
            tokens_used=0,  # TODO: track actual token usage
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Manga translation failed: {str(e)}")


@app.post("/manga/extract-text", response_model=MangaExtractTextResponse)
async def extract_manga_text(request: MangaExtractTextRequest):
    """
    Extract text from manga image using OCR.
    No translation - just returns detected text regions.

    Useful for:
    - Checking OCR quality before translation
    - Manual translation workflows
    - Text analysis
    """
    try:
        # Decode image
        image_data = base64.b64decode(request.image_base64)
        image = Image.open(BytesIO(image_data))

        # Create OCR extractor
        translator = get_manga_translator(source_lang=request.source_lang)
        regions = translator.ocr.extract_text(image)

        # Build response
        regions_response = []
        all_text = []

        for region in regions:
            regions_response.append(TextRegionResponse(
                bbox=list(region.bbox),
                original_text=region.text,
                translated_text="",  # No translation
                confidence=region.confidence,
                region_type=region.region_type.value,
                font_size=region.font_size,
                is_vertical=region.is_vertical,
            ))
            all_text.append(region.text)

        return MangaExtractTextResponse(
            regions=regions_response,
            extracted_text="\n".join(all_text),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Text extraction failed: {str(e)}")


@app.post("/manga/batch-translate", response_model=MangaBatchTranslateResponse)
async def batch_translate_manga(request: MangaBatchTranslateRequest):
    """
    Translate multiple manga images in batch.
    Useful for translating entire chapters.

    Maintains context between pages for consistent translation.
    """
    try:
        results = []
        total_tokens = 0
        successful = 0

        # Build context that accumulates across pages
        context = MangaTranslationContext(
            series_title=request.series_title or "",
            chapter_number=request.chapter_start or 1,
            characters=request.characters,
            previous_dialogues=[],
            tone=request.tone,
            setting=request.setting,
        )

        provider = request.provider or os.getenv("LLM_PROVIDER", "openai").lower()
        translator = get_manga_translator(
            source_lang=request.source_lang,
            provider=provider,
            model=request.model,
            openai_key=request.openai_api_key,
            gemini_key=request.gemini_api_key,
        )

        lang_map = {
            "ko": SourceLanguage.KOREAN,
            "ja": SourceLanguage.JAPANESE,
            "zh": SourceLanguage.CHINESE,
            "zh-TW": SourceLanguage.CHINESE_TRAD,
        }
        source_lang = lang_map.get(request.source_lang, SourceLanguage.KOREAN)

        for idx, image_base64 in enumerate(request.images):
            try:
                # Decode image
                image_data = base64.b64decode(image_base64)
                image = Image.open(BytesIO(image_data))

                # Update chapter number for context
                context.chapter_number = request.chapter_start + idx

                # Translate
                result = await translator.translate_image(
                    image=image,
                    source_lang=source_lang,
                    context=context,
                    render_style=request.render_style,
                )

                # Update context with dialogues from this page
                for region in result.regions:
                    if region.region_type.value == "speech" and region.translated_text:
                        context.previous_dialogues.append({
                            "speaker": "unknown",
                            "text": region.translated_text
                        })

                # Keep only last 10 dialogues for context
                context.previous_dialogues = context.previous_dialogues[-10:]

                # Build response
                regions_response = []
                for region in result.regions:
                    regions_response.append(TextRegionResponse(
                        bbox=list(region.bbox),
                        original_text=region.text,
                        translated_text=region.translated_text,
                        confidence=region.confidence,
                        region_type=region.region_type.value,
                        font_size=region.font_size,
                        is_vertical=region.is_vertical,
                    ))

                results.append(MangaTranslateResponse(
                    translated_image_base64=base64.b64encode(result.translated_image).decode('utf-8'),
                    original_image_base64=base64.b64encode(result.original_image).decode('utf-8'),
                    regions=regions_response,
                    model_used=result.model_used,
                    provider=result.provider,
                    tokens_used=0,
                ))
                successful += 1

            except Exception as e:
                # Log error but continue with other images
                print(f"Failed to translate image {idx}: {e}")
                results.append(MangaTranslateResponse(
                    translated_image_base64=image_base64,  # Return original
                    original_image_base64=image_base64,
                    regions=[],
                    model_used="error",
                    provider="error",
                    tokens_used=0,
                ))

        return MangaBatchTranslateResponse(
            results=results,
            total_pages=len(request.images),
            successful_pages=successful,
            total_tokens_used=total_tokens,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch translation failed: {str(e)}")


@app.get("/manga/supported-languages")
async def get_supported_manga_languages():
    """Get list of supported source languages for manga translation"""
    return {
        "languages": [
            {"code": "en", "name": "English", "description": "English manga/manhwa - English to Thai"},
            {"code": "ko", "name": "Korean (Manhwa)", "description": "웹툰 - Korean webtoons"},
            {"code": "ja", "name": "Japanese (Manga)", "description": "漫画 - Japanese manga"},
            {"code": "zh", "name": "Chinese (Manhua)", "description": "漫画 - Simplified Chinese"},
            {"code": "zh-TW", "name": "Traditional Chinese", "description": "繁體中文 - Traditional Chinese"},
        ],
        "target_languages": [
            {"code": "th", "name": "Thai", "description": "ภาษาไทย"},
        ],
        "render_styles": [
            {"code": "overlay", "name": "Overlay", "description": "Semi-transparent text overlay on original"},
            {"code": "inpaint", "name": "Inpaint", "description": "Remove original text, replace with translation"},
            {"code": "side_by_side", "name": "Side by Side", "description": "Original and translated images side by side"},
        ]
    }


@app.get("/manga/health")
async def manga_translation_health():
    """Check manga translation system health"""
    try:
        # Check if EasyOCR is available
        ocr_available = EASYOCR_AVAILABLE

        # Check API keys
        openai_key = os.getenv("OPENAI_API_KEY")
        gemini_key = os.getenv("GEMINI_API_KEY")

        return {
            "status": "healthy" if ocr_available else "degraded",
            "ocr_available": ocr_available,
            "openai_configured": bool(openai_key),
            "gemini_configured": bool(gemini_key),
            "supported_features": {
                "ocr": ocr_available,
                "translation": bool(openai_key or gemini_key),
                "rendering": True,
                "batch": True,
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ==================== MANGA URL FETCHER ====================

class MangaFetchRequest(BaseModel):
    """Request to fetch manga from URL"""
    url: str
    source_lang: str = "ko"  # ko, ja, zh


class MangaPageInfo(BaseModel):
    """Info about a manga page"""
    page_number: int
    image_url: str
    original_base64: Optional[str] = None  # Fetched on demand


class MangaFetchResponse(BaseModel):
    """Response with manga chapter info and image URLs"""
    title: str
    chapter_number: Optional[int] = None
    total_pages: int
    pages: List[MangaPageInfo]
    source_url: str
    site_name: str


class MangaTranslateURLRequest(BaseModel):
    """Request to translate manga from URL"""
    url: str
    source_lang: str = "ko"
    render_style: str = "overlay"
    series_title: Optional[str] = ""
    tone: str = "casual"
    provider: Optional[str] = None
    model: Optional[str] = "gpt-4o"
    openai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None


@app.post("/manga/fetch", response_model=MangaFetchResponse)
async def fetch_manga_from_url(request: MangaFetchRequest):
    """
    Fetch manga chapter images from a URL.
    Supports: webtoons.com, mangadex.org, bato.to, and many more.

    Returns image URLs that can be used for translation.
    """
    try:
        url = request.url
        pages = []
        title = "Unknown"
        chapter_number = None
        site_name = "Unknown"

        # Detect site and fetch accordingly
        if "webtoons.com" in url or "webtoon" in url:
            result = await fetch_webtoons(url)
            pages = result["pages"]
            title = result["title"]
            chapter_number = result.get("chapter_number")
            site_name = "Webtoons"
        elif "mangadex.org" in url:
            result = await fetch_mangadex(url)
            pages = result["pages"]
            title = result["title"]
            chapter_number = result.get("chapter_number")
            site_name = "MangaDex"
        elif "bato.to" in url or "batoto" in url:
            result = await fetch_bato(url)
            pages = result["pages"]
            title = result["title"]
            chapter_number = result.get("chapter_number")
            site_name = "Bato.to"
        elif "mangakakalot" in url or "manganato" in url or "manganelo" in url:
            result = await fetch_mangakakalot(url)
            pages = result["pages"]
            title = result["title"]
            chapter_number = result.get("chapter_number")
            site_name = "MangaKakalot"
        elif "toonily" in url:
            result = await fetch_toonily(url)
            pages = result["pages"]
            title = result["title"]
            chapter_number = result.get("chapter_number")
            site_name = "Toonily"
        elif "asura" in url or "asurascans" in url:
            result = await fetch_asura(url)
            pages = result["pages"]
            title = result["title"]
            chapter_number = result.get("chapter_number")
            site_name = "Asura Scans"
        elif "flame" in url or "flamecomics" in url:
            result = await fetch_generic_manga(url)
            pages = result["pages"]
            title = result["title"]
            chapter_number = result.get("chapter_number")
            site_name = "Flame Comics"
        elif "reaperscans" in url:
            result = await fetch_generic_manga(url)
            pages = result["pages"]
            title = result["title"]
            chapter_number = result.get("chapter_number")
            site_name = "Reaper Scans"
        elif "manhwa" in url or "manhua" in url:
            result = await fetch_generic_manga(url)
            pages = result["pages"]
            title = result["title"]
            chapter_number = result.get("chapter_number")
            site_name = "Manhwa/Manhua Site"
        else:
            # Generic fetch attempt
            result = await fetch_generic_manga(url)
            pages = result["pages"]
            title = result["title"]
            chapter_number = result.get("chapter_number")
            site_name = "Manga Site"

        if not pages:
            raise HTTPException(status_code=400, detail="No images found at this URL")

        page_infos = [
            MangaPageInfo(page_number=i+1, image_url=img_url)
            for i, img_url in enumerate(pages)
        ]

        return MangaFetchResponse(
            title=title,
            chapter_number=chapter_number,
            total_pages=len(pages),
            pages=page_infos,
            source_url=url,
            site_name=site_name,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch manga: {str(e)}")


async def fetch_webtoons(url: str) -> dict:
    """Fetch images from Webtoons.com using browser automation"""
    try:
        from playwright.async_api import async_playwright
        PLAYWRIGHT_AVAILABLE = True
    except ImportError:
        PLAYWRIGHT_AVAILABLE = False
    
    if PLAYWRIGHT_AVAILABLE:
        # Use Playwright for browser-based fetching (bypasses hotlink protection)
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            
            try:
                await page.goto(url, wait_until="networkidle", timeout=60000)
                
                # Get title
                title = await page.title() or "Unknown"
                # Clean title
                title = re.sub(r'\s*-\s*Webtoon.*|\s*\|.*', '', title, flags=re.IGNORECASE)
                
                # Wait for images to load
                await page.wait_for_selector("img", timeout=10000)
                
                # Get all image URLs
                images = await page.eval_on_selector_all("img", """
                    Array.from(document.querySelectorAll('img'))
                        .map(img => img.src || img.dataset.url)
                        .filter(src => src && src.startsWith('http') && (src.includes('webtoon') || src.includes('phinf')))
                """)
                
                # Get chapter number from URL
                chapter_match = re.search(r'episode_no=(\d+)', url) or re.search(r'/(\d+)', url)
                chapter_number = int(chapter_match.group(1)) if chapter_match else None
                
                return {"pages": images, "title": title, "chapter_number": chapter_number}
                
            finally:
                await browser.close()
    else:
        # Fallback to httpx with headers
        async with httpx.AsyncClient() as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
                "Referer": "https://www.webtoons.com/",
                "Origin": "https://www.webtoons.com",
            }
            response = await client.get(url, headers=headers, timeout=30)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'lxml')

            # Get title
            title_elem = soup.find("h1") or soup.find("span", class_="subj")
            title = title_elem.get_text(strip=True) if title_elem else "Unknown"

            # Get chapter number from URL
            chapter_match = re.search(r'episode_no=(\d+)', url) or re.search(r'/(\d+)', url)
            chapter_number = int(chapter_match.group(1)) if chapter_match else None

            # Get images - Webtoons uses specific image containers
            images = []
            for img in soup.find_all("img"):
                src = img.get("data-url") or img.get("src")
                if src and src.startswith("http") and ("webtoon" in src or "phinf" in src):
                    images.append(src)

            return {"pages": images, "title": title, "chapter_number": chapter_number}


async def fetch_mangadex(url: str) -> dict:
    """Fetch images from MangaDex"""
    async with httpx.AsyncClient() as client:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

        # Extract chapter ID from URL
        chapter_match = re.search(r'/chapter/([a-f0-9-]+)', url)
        if not chapter_match:
            raise HTTPException(status_code=400, detail="Invalid MangaDex URL")

        chapter_id = chapter_match.group(1)

        # Get chapter data from MangaDex API
        api_url = f"https://api.mangadex.org/at-home/server/{chapter_id}"
        api_response = await client.get(api_url, headers=headers, timeout=30)
        api_response.raise_for_status()
        chapter_data = api_response.json()

        base_url = chapter_data["baseUrl"]
        hash_id = chapter_data["chapter"]["hash"]
        image_files = chapter_data["chapter"]["data"]

        # Build image URLs
        images = [f"{base_url}/data/{hash_id}/{img}" for img in image_files]

        # Get manga title
        manga_url = f"https://api.mangadex.org/chapter/{chapter_id}?includes[]=manga"
        manga_response = await client.get(manga_url, headers=headers, timeout=30)
        manga_data = manga_response.json()

        title = "Unknown"
        for rel in manga_data.get("data", {}).get("relationships", []):
            if rel.get("type") == "manga":
                attrs = rel.get("attributes", {})
                title = attrs.get("title", {}).get("en") or attrs.get("title", {}).get("ja", "Unknown")
                break

        return {"pages": images, "title": title, "chapter_number": None}


async def fetch_bato(url: str) -> dict:
    """Fetch images from Bato.to"""
    async with httpx.AsyncClient() as client:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        response = await client.get(url, headers=headers, timeout=30, follow_redirects=True)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'lxml')

        # Get title
        title_elem = soup.find("h3") or soup.find("h1")
        title = title_elem.get_text(strip=True) if title_elem else "Unknown"

        # Bato.to stores images in data-src attributes
        images = []
        for img in soup.select("img[data-src]"):
            src = img.get("data-src")
            if src and src.startswith("http"):
                images.append(src)

        # Fallback to regular images
        if not images:
            for img in soup.find_all("img"):
                src = img.get("src")
                if src and src.startswith("http") and "chapter" in src.lower():
                    images.append(src)

        return {"pages": images, "title": title, "chapter_number": None}


async def fetch_mangakakalot(url: str) -> dict:
    """Fetch images from MangaKakalot/MangaNato/MangaNelo"""
    async with httpx.AsyncClient() as client:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        response = await client.get(url, headers=headers, timeout=30, follow_redirects=True)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'lxml')

        # Get title
        title_elem = soup.find("h1") or soup.find("div", class_="chr-title")
        title = title_elem.get_text(strip=True) if title_elem else "Unknown"

        # MangaKakalot stores images in specific containers
        images = []
        
        # Try different selectors
        container = (
            soup.find("div", class_="container-chapter-reader") or
            soup.find("div", class_="vung-doc") or
            soup.find("div", id="vungdoc")
        )
        
        if container:
            for img in container.find_all("img"):
                src = img.get("data-src") or img.get("src")
                if src:
                    if src.startswith("//"):
                        src = "https:" + src
                    if src.startswith("http"):
                        images.append(src)

        return {"pages": images, "title": title, "chapter_number": None}


async def fetch_toonily(url: str) -> dict:
    """Fetch images from Toonily"""
    async with httpx.AsyncClient() as client:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": url,
        }
        response = await client.get(url, headers=headers, timeout=30, follow_redirects=True)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'lxml')

        # Get title
        title_elem = soup.find("h1") or soup.find("h2", class_="chapter-title")
        title = title_elem.get_text(strip=True) if title_elem else "Unknown"

        # Toonily stores images in reading-content div
        images = []
        container = soup.find("div", class_="reading-content") or soup.find("div", class_="entry-content")
        
        if container:
            for img in container.find_all("img"):
                src = img.get("data-src") or img.get("src")
                if src:
                    if src.startswith("//"):
                        src = "https:" + src
                    if src.startswith("http"):
                        images.append(src)

        return {"pages": images, "title": title, "chapter_number": None}


async def fetch_asura(url: str) -> dict:
    """Fetch images from Asura Scans"""
    async with httpx.AsyncClient() as client:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": url,
        }
        response = await client.get(url, headers=headers, timeout=30, follow_redirects=True)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'lxml')

        # Get title
        title_elem = soup.find("h1") or soup.find("h2")
        title = title_elem.get_text(strip=True) if title_elem else "Unknown"

        # Asura uses various containers
        images = []
        container = (
            soup.find("div", class_="reading-content") or
            soup.find("div", class_="entry-content") or
            soup.find("div", id="chapter-reader")
        )
        
        if container:
            for img in container.find_all("img"):
                src = img.get("data-src") or img.get("data-lazy-src") or img.get("src")
                if src:
                    if src.startswith("//"):
                        src = "https:" + src
                    if src.startswith("http"):
                        images.append(src)

        return {"pages": images, "title": title, "chapter_number": None}


async def fetch_generic_manga(url: str) -> dict:
    """Generic manga image fetcher"""
    async with httpx.AsyncClient() as client:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        response = await client.get(url, headers=headers, timeout=30, follow_redirects=True)

        # Try to decode with different encodings
        try:
            content = response.content.decode('utf-8')
        except Exception:
            try:
                content = response.content.decode('gbk')
            except Exception:
                content = response.text

        soup = BeautifulSoup(content, 'lxml')

        # Get title
        title_elem = soup.find("h1") or soup.find("title")
        title = title_elem.get_text(strip=True) if title_elem else "Unknown"
        # Clean up title
        title = re.sub(r'\s*-\s*Read.*|\s*\|.*|\s*Chapter.*', '', title, flags=re.IGNORECASE)

        # Find images - try common manga reader patterns
        images = []

        # Pattern 1: Common manga reader divs
        for selector in [
            ("div", {"class": "reader-area"}),
            ("div", {"id": "readerarea"}),
            ("div", {"class": "reading-content"}),
            ("div", {"class": "entry-content"}),
            ("div", {"class": "chap-content"}),
            ("div", {"id": "chapter-content"}),
        ]:
            container = soup.find(selector[0], selector[1]) if isinstance(selector[1], dict) else None
            if container:
                for img in container.find_all("img"):
                    src = img.get("data-src") or img.get("data-lazy-src") or img.get("src")
                    if src:
                        if src.startswith("//"):
                            src = "https:" + src
                        if src.startswith("http"):
                            images.append(src)
                if images:
                    break

        # Pattern 2: All large images in page
        if not images:
            for img in soup.find_all("img"):
                src = img.get("data-src") or img.get("src")
                if src and src.startswith("http"):
                    # Filter by size - manga pages are usually large
                    images.append(src)

        # Deduplicate
        images = list(dict.fromkeys(images))

        return {"pages": images, "title": title, "chapter_number": None}


@app.post("/manga/translate-url")
async def translate_manga_from_url(request: MangaTranslateURLRequest):
    """
    Fetch manga from URL and translate all pages.
    Returns a stream of translated pages for better UX.
    """
    try:
        # First, fetch the manga images
        fetch_result = await fetch_manga_from_url(MangaFetchRequest(
            url=request.url,
            source_lang=request.source_lang
        ))

        if not fetch_result.pages:
            raise HTTPException(status_code=400, detail="No images found")

        # Get API keys
        openai_key = request.openai_api_key
        gemini_key = request.gemini_api_key
        
        # Validate that at least one API key is provided (strict BYOK)
        if not openai_key and not gemini_key:
            raise HTTPException(status_code=400, detail="API key required. Please add your OpenAI or Gemini API key in Settings.")
        
        # Resolve the provider before validating it (it was previously read
        # before assignment, raising UnboundLocalError on every request).
        provider = request.provider or os.getenv("LLM_PROVIDER", "openai").lower()

        # Validate selected provider has a key
        provider_lower = provider.lower() if provider else "openai"
        if provider_lower == "openai" and not openai_key:
            raise HTTPException(status_code=400, detail="OpenAI API key required for OpenAI provider.")
        if provider_lower == "gemini" and not gemini_key:
            raise HTTPException(status_code=400, detail="Gemini API key required for Gemini provider.")

        translator = get_manga_translator(
            source_lang=request.source_lang,
            provider=provider,
            model=request.model,
            openai_key=openai_key,
            gemini_key=gemini_key,
        )

        lang_map = {
            "ko": SourceLanguage.KOREAN,
            "ja": SourceLanguage.JAPANESE,
            "zh": SourceLanguage.CHINESE,
            "zh-TW": SourceLanguage.CHINESE_TRAD,
        }
        source_lang = lang_map.get(request.source_lang, SourceLanguage.KOREAN)

        # Build context
        context = MangaTranslationContext(
            series_title=request.series_title or fetch_result.title,
            chapter_number=fetch_result.chapter_number or 1,
            characters=[],
            previous_dialogues=[],
            tone=request.tone,
            setting="",
        )

        # Download and translate each image
        results = []
        
        # Determine the correct referer for hotlink protection
        referer = request.url
        if "webtoons.com" in request.url:
            # For Webtoons, use the main page as referer
            referer = "https://www.webtoons.com/"
        elif "naver" in request.url or "phinf.pstatic.net" in request.url:
            referer = "https://www.webtoons.com/"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
            "Referer": referer,
            "Origin": "https://www.webtoons.com" if "webtoons.com" in request.url else "",
        }
        
        async with httpx.AsyncClient(timeout=60, headers=headers) as client:
            for page_info in fetch_result.pages:
                try:
                    # Download image with headers (client already has headers set)
                    img_response = await client.get(page_info.image_url, follow_redirects=True)
                    img_response.raise_for_status()

                    image = Image.open(BytesIO(img_response.content))

                    # Translate
                    result = await translator.translate_image(
                        image=image,
                        source_lang=source_lang,
                        context=context,
                        render_style=request.render_style,
                    )

                    # Update context
                    for region in result.regions:
                        if region.region_type.value == "speech" and region.translated_text:
                            context.previous_dialogues.append({
                                "speaker": "unknown",
                                "text": region.translated_text
                            })
                    context.previous_dialogues = context.previous_dialogues[-10:]

                    results.append({
                        "page_number": page_info.page_number,
                        "translated_base64": base64.b64encode(result.translated_image).decode('utf-8'),
                        "original_base64": base64.b64encode(result.original_image).decode('utf-8'),
                        "regions_count": len(result.regions),
                    })

                except Exception as e:
                    print(f"Failed to translate page {page_info.page_number}: {e}")
                    results.append({
                        "page_number": page_info.page_number,
                        "error": str(e),
                    })

        return {
            "title": fetch_result.title,
            "chapter_number": fetch_result.chapter_number,
            "total_pages": fetch_result.total_pages,
            "site_name": fetch_result.site_name,
            "source_url": request.url,
            "pages": results,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")


@app.get("/manga/supported-sites")
async def get_supported_manga_sites():
    """Get list of supported manga sites for URL fetching"""
    return {
        "sites": [
            {
                "name": "MangaDex",
                "domains": ["mangadex.org"],
                "example": "https://mangadex.org/chapter/...",
                "notes": "Best option - No protection, works perfectly"
            },
            {
                "name": "Bato.to",
                "domains": ["bato.to", "batoto"],
                "example": "https://bato.to/title/.../chapter-...",
                "notes": "Works well - Manhwa and Manga"
            },
            {
                "name": "MangaKakalot / MangaNato",
                "domains": ["mangakakalot.com", "manganato.com", "manganelo.com"],
                "example": "https://mangakakalot.com/chapter/...",
                "notes": "Works well - Large manga library"
            },
            {
                "name": "Toonily",
                "domains": ["toonily.com"],
                "example": "https://toonily.com/.../chapter-...",
                "notes": "Korean manhwa - Works well"
            },
            {
                "name": "Asura Scans",
                "domains": ["asurascans.com", "asuracomic.com"],
                "example": "https://asurascans.com/.../chapter-...",
                "notes": "Korean manhwa translations"
            },
            {
                "name": "Webtoons (LINE)",
                "domains": ["webtoons.com"],
                "example": "https://www.webtoons.com/en/...",
                "notes": "Official platform - Uses browser automation (slower)"
            },
            {
                "name": "Flame Comics",
                "domains": ["flamecomics.com"],
                "example": "https://flamecomics.com/.../chapter-...",
                "notes": "Korean manhwa scanlation"
            },
            {
                "name": "Reaper Scans",
                "domains": ["reaperscans.com"],
                "example": "https://reaperscans.com/.../chapter-...",
                "notes": "Korean manhwa scanlation"
            },
            {
                "name": "Other Manga Sites",
                "domains": ["*"],
                "example": "Any URL with manga images",
                "notes": "Best effort - May work on other sites"
            }
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
