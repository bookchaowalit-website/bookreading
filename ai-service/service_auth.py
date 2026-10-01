"""Optional shared-secret auth between the Go backend and this service.

When ``AI_SERVICE_TOKEN`` is set, every route except the public metadata and
health routes in :data:`PUBLIC_PATHS` requires ``Authorization: Bearer <token>``.
The comparison is constant-time. When the variable is unset (local dev), the
service stays open, as before.

The Next.js frontend reaches this service only through the Go backend's
session-checked ``/api/ai/*`` proxy, which adds the token server-side. Never
ship the token to the browser.
"""

from __future__ import annotations

import hmac
import os

from fastapi import HTTPException, Request

TOKEN_ENV = "AI_SERVICE_TOKEN"

# Read-only, non-scraping, non-translating routes that stay open.
PUBLIC_PATHS = frozenset(
    {
        "/health",
        "/manga/health",
        "/manga/supported-sites",
        "/manga/supported-languages",
        "/sources/korean",
        "/docs",
        "/docs/oauth2-redirect",
        "/redoc",
        "/openapi.json",
    }
)


def configured_token() -> str:
    return os.getenv(TOKEN_ENV, "").strip()


def token_is_valid(authorization: str | None, expected: str) -> bool:
    scheme, _, supplied = (authorization or "").partition(" ")
    if scheme.lower() != "bearer":
        return False
    return hmac.compare_digest(supplied.strip().encode("utf-8"), expected.encode("utf-8"))


async def require_service_token(request: Request) -> None:
    """FastAPI dependency applied app-wide; no-op when no token is configured."""
    expected = configured_token()
    if not expected or request.url.path in PUBLIC_PATHS:
        return
    if not token_is_valid(request.headers.get("authorization"), expected):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized",
            headers={"WWW-Authenticate": "Bearer"},
        )
