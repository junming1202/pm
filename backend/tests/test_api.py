import pytest
from fastapi.testclient import TestClient

from app.main import STATIC_DIR, app

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_hello():
    response = client.get("/api/hello")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello from FastAPI"}


@pytest.mark.skipif(
    not STATIC_DIR.is_dir(), reason="Static frontend export not present"
)
def test_index_served():
    response = client.get("/")
    assert response.status_code == 200
    assert "<!DOCTYPE html>" in response.text
