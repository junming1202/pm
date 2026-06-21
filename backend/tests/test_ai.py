import httpx
import pytest
from fastapi.testclient import TestClient

from app import ai
from app.main import app

GOOD = {"username": "user", "password": "password"}


def _authed() -> TestClient:
    client = TestClient(app)
    client.post("/api/login", json=GOOD)
    return client


def test_ask_without_key_raises(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(ai.AIError, match="OPENROUTER_API_KEY"):
        ai.ask("hi")


def test_ai_health_requires_session():
    assert TestClient(app).get("/api/ai/health").status_code == 401


def test_ai_health_returns_answer(monkeypatch):
    def fake_post(url, **kwargs):
        request = httpx.Request("POST", url)
        return httpx.Response(
            200,
            request=request,
            json={"choices": [{"message": {"content": "4"}}]},
        )

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(ai.httpx, "post", fake_post)

    response = _authed().get("/api/ai/health")
    assert response.status_code == 200
    assert "4" in response.json()["answer"]


def test_ai_health_missing_key_returns_502(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    response = _authed().get("/api/ai/health")
    assert response.status_code == 502
    assert "OPENROUTER_API_KEY" in response.json()["detail"]
