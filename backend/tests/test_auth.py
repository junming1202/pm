from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

GOOD = {"username": "user", "password": "password"}


def test_login_valid_sets_session():
    response = client.post("/api/login", json=GOOD)
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert "pm_session" in response.cookies


def test_login_invalid_returns_401():
    response = client.post(
        "/api/login", json={"username": "user", "password": "wrong"}
    )
    assert response.status_code == 401
    assert "pm_session" not in response.cookies


def test_me_requires_session():
    fresh = TestClient(app)
    assert fresh.get("/api/me").status_code == 401


def test_me_with_session():
    authed = TestClient(app)
    authed.post("/api/login", json=GOOD)
    response = authed.get("/api/me")
    assert response.status_code == 200
    assert response.json() == {"username": "user"}


def test_logout_invalidates_session():
    authed = TestClient(app)
    authed.post("/api/login", json=GOOD)
    assert authed.get("/api/me").status_code == 200
    authed.post("/api/logout")
    assert authed.get("/api/me").status_code == 401


def test_board_requires_session():
    fresh = TestClient(app)
    assert fresh.get("/api/board").status_code == 401

    authed = TestClient(app)
    authed.post("/api/login", json=GOOD)
    response = authed.get("/api/board")
    assert response.status_code == 200
    assert response.json() == {"owner": "user"}


def test_forged_cookie_rejected():
    fresh = TestClient(app)
    fresh.cookies.set("pm_session", "not-a-valid-token")
    assert fresh.get("/api/me").status_code == 401
