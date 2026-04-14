"""
Tests for scrapers module.
"""

import pytest
from scrapers import (
    detect_site_type,
    ScrapedChapter,
    ScrapeResponse,
)


class TestDetectSiteType:
    """Test site type detection from URLs."""

    def test_detect_piaotia(self):
        assert detect_site_type("https://www.piaotia.com/book/123") == "piaotia"
        assert detect_site_type("https://www.ptwxz.com/book/456") == "piaotia"

    def test_detect_qidian(self):
        assert detect_site_type("https://www.qidian.com/book/789") == "qidian"

    def test_detect_69shu(self):
        assert detect_site_type("https://www.69shu.com/book/123") == "69shu"

    def test_detect_zongheng(self):
        assert detect_site_type("https://www.zongheng.com/book/456") == "zongheng"

    def test_detect_17k(self):
        assert detect_site_type("https://www.17k.com/book/789") == "17k"

    def test_detect_generic(self):
        assert detect_site_type("https://example.com/book/123") == "generic"


class TestScrapedChapter:
    """Test ScrapedChapter model."""

    def test_create_scraped_chapter(self):
        chapter = ScrapedChapter(
            chapter_number=1,
            title="Chapter 1",
            original_title="第一章",
            url="https://example.com/chapter/1",
            content="Test content",
        )

        assert chapter.chapter_number == 1
        assert chapter.title == "Chapter 1"
        assert chapter.original_title == "第一章"
        assert chapter.url == "https://example.com/chapter/1"
        assert chapter.content == "Test content"


class TestScrapeResponse:
    """Test ScrapeResponse model."""

    def test_create_scrape_response(self):
        chapters = [
            ScrapedChapter(
                chapter_number=1,
                title="Chapter 1",
                original_title="第一章",
                url="https://example.com/chapter/1",
                content="Content 1",
            )
        ]

        response = ScrapeResponse(
            book_title="Test Book",
            author="Test Author",
            description="Test description",
            cover_url="https://example.com/cover.jpg",
            chapters=chapters,
            total_chapters=1,
        )

        assert response.book_title == "Test Book"
        assert response.author == "Test Author"
        assert response.total_chapters == 1
        assert len(response.chapters) == 1
