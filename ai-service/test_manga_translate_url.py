"""Regression tests for /manga/translate-url provider validation.

The handler used to read ``provider`` before assigning it, so every call
failed with UnboundLocalError (surfaced as HTTP 500). No network is used:
the page fetch is monkeypatched.
"""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import main


@pytest.fixture
def fake_fetch(monkeypatch):
    async def _fetch(_request):
        return SimpleNamespace(pages=["https://example.invalid/1.jpg"])

    monkeypatch.setattr(main, "fetch_manga_from_url", _fetch)


async def test_missing_key_for_selected_provider_is_400(fake_fetch):
    req = main.MangaTranslateURLRequest(
        url="https://example.invalid/series/1",
        provider="openai",
        gemini_api_key="g-key",
    )
    with pytest.raises(HTTPException) as exc:
        await main.translate_manga_from_url(req)
    assert exc.value.status_code == 400
    assert "OpenAI API key required" in exc.value.detail


async def test_default_provider_comes_from_env(fake_fetch, monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "Gemini")
    req = main.MangaTranslateURLRequest(
        url="https://example.invalid/series/1",
        openai_api_key="o-key",
    )
    with pytest.raises(HTTPException) as exc:
        await main.translate_manga_from_url(req)
    assert exc.value.status_code == 400
    assert "Gemini API key required" in exc.value.detail
