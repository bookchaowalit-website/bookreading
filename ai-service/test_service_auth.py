"""Optional bearer-token auth between the backend and ai-service."""

import pytest
from fastapi.testclient import TestClient

import main
import service_auth

TOKEN = "unit-test-shared-secret"
PROTECTED = [
    ("post", "/scrape", {"url": "file:///etc/passwd"}),
    ("post", "/chapter", {"url": "file:///etc/passwd"}),
    ("post", "/manga/fetch", {"url": "file:///etc/passwd"}),
    ("post", "/manga/translate-url", {"url": "file:///etc/passwd"}),
    ("post", "/translate", {}),  # 422 once authorized: no provider call
    ("post", "/extract-terminology", {}),
    ("post", "/manga/translate", {}),
    ("get", "/terminology/known", None),
]


@pytest.fixture
def api():
    return TestClient(main.app)


def _call(api, method, path, body, headers=None):
    if method == "get":
        return api.get(path, headers=headers)
    return api.post(path, json=body, headers=headers)


@pytest.mark.parametrize(("method", "path", "body"), PROTECTED)
def test_no_token_configured_keeps_routes_open(api, monkeypatch, method, path, body):
    monkeypatch.delenv(service_auth.TOKEN_ENV, raising=False)
    assert _call(api, method, path, body).status_code != 401


@pytest.mark.parametrize(("method", "path", "body"), PROTECTED)
@pytest.mark.parametrize(
    "header",
    [None, "", "Bearer", "Bearer wrong", f"Basic {TOKEN}", f"Bearer {TOKEN}x"],
)
def test_missing_or_wrong_token_is_401(api, monkeypatch, method, path, body, header):
    monkeypatch.setenv(service_auth.TOKEN_ENV, TOKEN)
    headers = {} if header is None else {"Authorization": header}
    response = _call(api, method, path, body, headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(("method", "path", "body"), PROTECTED)
def test_valid_token_passes_auth(api, monkeypatch, method, path, body):
    monkeypatch.setenv(service_auth.TOKEN_ENV, TOKEN)
    response = _call(api, method, path, body, {"Authorization": f"bearer  {TOKEN}"})
    assert response.status_code != 401


@pytest.mark.parametrize("path", ["/health", "/manga/supported-sites", "/openapi.json"])
def test_public_metadata_routes_stay_open(api, monkeypatch, path):
    monkeypatch.setenv(service_auth.TOKEN_ENV, TOKEN)
    assert api.get(path).status_code == 200


def test_comparison_is_constant_time(monkeypatch):
    calls = []
    real = service_auth.hmac.compare_digest

    def spy(a, b):
        calls.append((a, b))
        return real(a, b)

    monkeypatch.setattr(service_auth.hmac, "compare_digest", spy)
    assert service_auth.token_is_valid(f"Bearer {TOKEN}", TOKEN)
    assert calls == [(TOKEN.encode(), TOKEN.encode())]
