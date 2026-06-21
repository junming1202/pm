import pytest
from fastapi.testclient import TestClient

from app.db import connect, init_db
from app.main import app

GOOD = {"username": "user", "password": "password"}


@pytest.fixture
def client():
    # Start fresh each test: wipe tables, then use the client (lifespan runs
    # init_db). The session cookie is set via login.
    init_db()
    with connect() as conn:
        conn.executescript(
            "DELETE FROM cards; DELETE FROM columns; "
            "DELETE FROM boards; DELETE FROM users;"
        )
    with TestClient(app) as c:
        c.post("/api/login", json=GOOD)
        yield c


def get_board(client):
    response = client.get("/api/board")
    assert response.status_code == 200
    return response.json()


def first_column(board):
    return board["columns"][0]


def test_board_seeds_five_empty_columns(client):
    board = get_board(client)
    assert board["name"] == "My Board"
    assert [c["title"] for c in board["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert all(c["cardIds"] == [] for c in board["columns"])
    assert board["cards"] == {}


def test_board_persists_across_requests(client):
    board = get_board(client)
    column_id = first_column(board)["id"]
    client.post("/api/cards", json={"column_id": int(column_id), "title": "A"})
    again = get_board(client)
    assert len(again["columns"][0]["cardIds"]) == 1


def test_rename_column(client):
    board = get_board(client)
    column_id = first_column(board)["id"]
    response = client.patch(
        f"/api/columns/{column_id}", json={"title": "Renamed"}
    )
    assert response.status_code == 200
    assert response.json()["columns"][0]["title"] == "Renamed"


def test_create_edit_delete_card(client):
    board = get_board(client)
    column_id = int(first_column(board)["id"])

    created = client.post(
        "/api/cards",
        json={"column_id": column_id, "title": "Task", "details": "Do it"},
    )
    assert created.status_code == 201
    board = created.json()
    card_id = board["columns"][0]["cardIds"][0]
    assert board["cards"][card_id] == {
        "id": card_id,
        "title": "Task",
        "details": "Do it",
    }

    edited = client.patch(
        f"/api/cards/{card_id}", json={"title": "Task 2", "details": "Updated"}
    )
    assert edited.status_code == 200
    assert edited.json()["cards"][card_id]["title"] == "Task 2"

    deleted = client.delete(f"/api/cards/{card_id}")
    assert deleted.status_code == 200
    assert deleted.json()["cards"] == {}


def test_delete_renumbers_positions(client):
    board = get_board(client)
    column_id = int(first_column(board)["id"])
    for title in ["A", "B", "C"]:
        board = client.post(
            "/api/cards", json={"column_id": column_id, "title": title}
        ).json()
    ids = board["columns"][0]["cardIds"]
    # Delete the middle card; remaining order should be A, C and contiguous.
    board = client.delete(f"/api/cards/{ids[1]}").json()
    remaining = board["columns"][0]["cardIds"]
    titles = [board["cards"][cid]["title"] for cid in remaining]
    assert titles == ["A", "C"]


def test_move_card_within_column(client):
    board = get_board(client)
    column_id = int(first_column(board)["id"])
    for title in ["A", "B", "C"]:
        board = client.post(
            "/api/cards", json={"column_id": column_id, "title": title}
        ).json()
    ids = board["columns"][0]["cardIds"]
    # Move C (index 2) to the front (index 0).
    board = client.post(
        f"/api/cards/{ids[2]}/move",
        json={"column_id": column_id, "index": 0},
    ).json()
    order = [board["cards"][cid]["title"] for cid in board["columns"][0]["cardIds"]]
    assert order == ["C", "A", "B"]


def test_move_card_across_columns(client):
    board = get_board(client)
    col0 = int(board["columns"][0]["id"])
    col1 = int(board["columns"][1]["id"])
    board = client.post(
        "/api/cards", json={"column_id": col0, "title": "Move me"}
    ).json()
    card_id = board["columns"][0]["cardIds"][0]

    board = client.post(
        f"/api/cards/{card_id}/move", json={"column_id": col1, "index": 0}
    ).json()
    assert board["columns"][0]["cardIds"] == []
    assert board["columns"][1]["cardIds"] == [card_id]


def test_card_in_other_users_board_not_found(client):
    # Operating on a non-existent card id returns 404.
    assert client.delete("/api/cards/999999").status_code == 404
    assert (
        client.patch(
            "/api/cards/999999", json={"title": "x", "details": ""}
        ).status_code
        == 404
    )


def test_board_endpoints_require_auth():
    with TestClient(app) as anon:
        assert anon.get("/api/board").status_code == 401
        assert anon.post("/api/cards", json={"column_id": 1, "title": "x"}).status_code == 401
        assert anon.patch("/api/columns/1", json={"title": "x"}).status_code == 401
