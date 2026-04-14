"""
Pytest configuration and fixtures.
"""

import pytest
import os


@pytest.fixture
def test_db_url():
    """Provide test database URL."""
    return os.getenv(
        "TEST_DATABASE_URL",
        "postgres://bookreading:testpassword@localhost:5432/bookreading_test?sslmode=disable"
    )


@pytest.fixture
def sample_chinese_text():
    """Provide sample Chinese text for testing."""
    return "云澈走进了深渊，那里充满了危险。"


@pytest.fixture
def sample_terminology():
    """Provide sample terminology for testing."""
    return {
        "云澈": {"translation": "หยุนเช่อ", "type": "character"},
        "深渊": {"translation": "เหวี่ยนลึก", "type": "location"},
    }


@pytest.fixture
def mock_httpx_client():
    """Mock httpx client for testing."""
    import httpx
    from unittest.mock import AsyncMock
    
    client = AsyncMock(spec=httpx.AsyncClient)
    return client
