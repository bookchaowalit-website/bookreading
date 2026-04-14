"""
Error handling utilities for AI Service.
Provides custom exception types and error handling helpers.
"""

from typing import Optional, Dict, Any
from fastapi import HTTPException


class AIServiceError(Exception):
    """Base exception for AI service errors."""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class ScrapingError(AIServiceError):
    """Error during web scraping."""
    pass


class TranslationError(AIServiceError):
    """Error during translation."""
    pass


class LLMError(TranslationError):
    """Error from LLM provider (OpenAI/Gemini)."""
    pass


class TerminologyError(AIServiceError):
    """Error in terminology management."""
    pass


class MangaTranslationError(AIServiceError):
    """Error in manga translation."""
    pass


class DatabaseError(AIServiceError):
    """Error in database operations."""
    pass


def handle_api_error(func):
    """Decorator to handle common API errors and return appropriate HTTP responses."""
    from functools import wraps
    from fastapi import HTTPException
    
    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except HTTPException:
            raise  # Re-raise HTTP exceptions as-is
        except AIServiceError as e:
            raise HTTPException(
                status_code=500,
                detail={
                    "error": type(e).__name__,
                    "message": e.message,
                    "details": e.details if e.details else None,
                }
            )
        except Exception as e:
            # Log the full traceback in production
            raise HTTPException(
                status_code=500,
                detail={
                    "error": "InternalServerError",
                    "message": "An unexpected error occurred",
                }
            )
    
    return wrapper


def safe_get(dictionary: dict, key: str, default: Any = None, error_msg: Optional[str] = None) -> Any:
    """Safely get a value from dictionary with better error messages."""
    if key not in dictionary and error_msg:
        raise TerminologyError(error_msg, details={"key": key})
    return dictionary.get(key, default)
