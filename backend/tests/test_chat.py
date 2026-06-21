import json

import pytest
from fastapi.testclient import TestClient

from app import ai
from app.db import connect, init_db
from app.main import app

GOOD = {"username": "user", "password": "password"}


@pytest.fixture
def client():
    init_db()
    with connect() as conn:
        conn.executescript(
            "DELETE FROM cards; DELETE FROM columns; "
            "DELETE FROM boards; DELETE FROM users;"
        )
    with TestClient(app) as c:
        c.post("/api/login", json=GOOD)
        yield c


def _mock_ai(monkeypatch, reply, operations):
    """Make ai.chat return a fixed structured result without hitting the network."""
    def fake_chat(board, history, question):
        return {"reply": reply, "operations": operations}

    monkeypatch.setattr(ai, "chat", fake_chat)


def first_column_id(client):
    board = client.get("/api/board").json()
    return board["columns"][0]["id"]


def test_chat_requires_session():
    assert TestClient(app).post("/api/chat", json={"message": "hi"}).status_code == 401


def test_chat_reply_only(client, monkeypatch):
    _mock_ai(monkeypatch, "Your board has five columns.", [])
    response = client.post("/api/chat", json={"message": "describe the board"})
    assert response.status_code == 200
    data = response.json()
    assert data["reply"] == "Your board has five columns."
    assert data["applied"] == []
    assert data["board"]["cards"] == {}


def test_chat_creates_card(client, monkeypatch):
    column_id = first_column_id(client)
    _mock_ai(
        monkeypatch,
        "Added it.",
        [
            {
                "type": "create_card",
                "column_id": column_id,
                "card_id": "",
                "title": "Write docs",
                "details": "",
                "index": 0,
            }
        ],
    )
    response = client.post("/api/chat", json={"message": "add a card to write docs"})
    assert response.status_code == 200
    data = response.json()
    assert len(data["applied"]) == 1
    titles = [c["title"] for c in data["board"]["cards"].values()]
    assert "Write docs" in titles
    # Persisted: visible on a fresh board fetch.
    again = client.get("/api/board").json()
    assert any(c["title"] == "Write docs" for c in again["cards"].values())


def test_chat_renames_column(client, monkeypatch):
    column_id = first_column_id(client)
    _mock_ai(
        monkeypatch,
        "Renamed.",
        [
            {
                "type": "rename_column",
                "column_id": column_id,
                "card_id": "",
                "title": "To Do",
                "details": "",
                "index": 0,
            }
        ],
    )
    client.post("/api/chat", json={"message": "rename first column to To Do"})
    board = client.get("/api/board").json()
    assert board["columns"][0]["title"] == "To Do"


def test_chat_skips_invalid_operation(client, monkeypatch):
    _mock_ai(
        monkeypatch,
        "Done.",
        [
            {
                "type": "edit_card",
                "column_id": "",
                "card_id": "999999",
                "title": "X",
                "details": "",
                "index": 0,
            }
        ],
    )
    response = client.post("/api/chat", json={"message": "edit a missing card"})
    assert response.status_code == 200
    assert response.json()["applied"] == []


def test_chat_history_forwarded(client, monkeypatch):
    seen = {}

    def fake_chat(board, history, question):
        seen["history"] = history
        return {"reply": "ok", "operations": []}

    monkeypatch.setattr(ai, "chat", fake_chat)
    client.post(
        "/api/chat",
        json={
            "message": "and another",
            "history": [
                {"role": "user", "content": "hi"},
                {"role": "assistant", "content": "hello"},
            ],
        },
    )
    assert seen["history"] == [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
    ]


def test_chat_malformed_ai_returns_502(client, monkeypatch):
    import httpx

    def fake_post(url, **kwargs):
        request = httpx.Request("POST", url)
        return httpx.Response(
            200,
            request=request,
            json={"choices": [{"message": {"content": "not json"}}]},
        )

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(ai.httpx, "post", fake_post)
    response = client.post("/api/chat", json={"message": "hi"})
    assert response.status_code == 502


def test_chat_parses_structured_output(monkeypatch):
    """ai.chat parses the model's JSON content into reply + operations."""
    import httpx

    payload = {"reply": "Added.", "operations": [{"type": "create_card"}]}

    def fake_post(url, **kwargs):
        request = httpx.Request("POST", url)
        return httpx.Response(
            200,
            request=request,
            json={"choices": [{"message": {"content": json.dumps(payload)}}]},
        )

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(ai.httpx, "post", fake_post)
    result = ai.chat({"columns": []}, [], "add a card")
    assert result["reply"] == "Added."
    assert result["operations"] == [{"type": "create_card"}]
