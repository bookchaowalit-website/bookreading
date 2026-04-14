"""
FastAPI routes for the AI Service.
Defines all API endpoints.
"""

from fastapi import FastAPI, HTTPException
from typing import List, Optional

# Import from other modules
from scrapers import (
    scrape_novel,
    ScrapeResponse,
    ChapterContentRequest,
    ChapterContentResponse,
    ScrapeRequest,
)
from terminology import (
    get_known_terminology,
    extract_terms_from_text,
    ExtractedTerm,
)


def register_routes(app: FastAPI):
    """Register all routes with the FastAPI app."""
    
    @app.post("/scrape", response_model=ScrapeResponse)
    async def scrape_novel_endpoint(request: ScrapeRequest):
        """Scrape a novel from the given URL."""
        try:
            result = await scrape_novel(request.url)
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Scraping failed: {str(e)}")
    
    @app.post("/chapter", response_model=ChapterContentResponse)
    async def get_chapter_content_endpoint(request: ChapterContentRequest):
        """Get content of a specific chapter."""
        try:
            from scrapers import fetch_page, parse_piaotia_chapter_content
            from bs4 import BeautifulSoup
            
            async with request.httpx.AsyncClient() as client:
                html = await fetch_page(client, request.url)
                soup = BeautifulSoup(html, "html.parser")
                content = parse_piaotia_chapter_content(soup)
            
            return ChapterContentResponse(
                title="",
                original_title="",
                content=content,
                url=request.url,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get chapter: {str(e)}")
    
    @app.get("/terminology/known")
    async def get_known_terminology_endpoint():
        """Get all known terminology."""
        return get_known_terminology()
    
    @app.post("/extract-terminology")
    async def extract_terminology_endpoint(text: str, source_lang: str = "zh"):
        """Extract terminology from text."""
        terms = extract_terms_from_text(text, source_lang)
        return {"terms": terms}
    
    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "healthy", "service": "ai-service"}
