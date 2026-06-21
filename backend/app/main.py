import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import repository
from app.auth import (
    SESSION_COOKIE,
    create_session_token,
    current_user,
    verify_credentials,
)
from app.db import get_db, init_db

# Directory containing the built Next.js static export, served at "/".
# Populated by the Docker build (frontend "out/" is copied here).
# May be absent during local backend-only development.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Project Management MVP", lifespan=lifespan)


class LoginRequest(BaseModel):
    username: str
    password: str


class RenameColumnRequest(BaseModel):
    title: str


class CreateCardRequest(BaseModel):
    column_id: int
    title: str
    details: str = ""


class UpdateCardRequest(BaseModel):
    title: str
    details: str = ""


class MoveCardRequest(BaseModel):
    column_id: int
    index: int


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/hello")
def hello() -> dict[str, str]:
    return {"message": "Hello from FastAPI"}


@app.post("/api/login")
def login(body: LoginRequest, response: Response) -> dict[str, str]:
    if not verify_credentials(body.username, body.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token = create_session_token(body.username)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return {"username": body.username}


@app.post("/api/logout")
def logout(response: Response) -> dict[str, bool]:
    response.delete_cookie(key=SESSION_COOKIE, path="/")
    return {"ok": True}


@app.get("/api/me")
def me(username: str = Depends(current_user)) -> dict[str, str]:
    return {"username": username}


@app.get("/api/board")
def get_board(
    username: str = Depends(current_user),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    return repository.get_board(db, username)


@app.patch("/api/columns/{column_id}")
def rename_column(
    column_id: int,
    body: RenameColumnRequest,
    username: str = Depends(current_user),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    if not repository.rename_column(db, username, column_id, body.title):
        raise HTTPException(status_code=404, detail="Column not found")
    return repository.get_board(db, username)


@app.post("/api/cards", status_code=201)
def create_card(
    body: CreateCardRequest,
    username: str = Depends(current_user),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    card = repository.create_card(
        db, username, body.column_id, body.title, body.details
    )
    if card is None:
        raise HTTPException(status_code=404, detail="Column not found")
    return repository.get_board(db, username)


@app.patch("/api/cards/{card_id}")
def update_card(
    card_id: int,
    body: UpdateCardRequest,
    username: str = Depends(current_user),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    if not repository.update_card(db, username, card_id, body.title, body.details):
        raise HTTPException(status_code=404, detail="Card not found")
    return repository.get_board(db, username)


@app.delete("/api/cards/{card_id}")
def delete_card(
    card_id: int,
    username: str = Depends(current_user),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    if not repository.delete_card(db, username, card_id):
        raise HTTPException(status_code=404, detail="Card not found")
    return repository.get_board(db, username)


@app.post("/api/cards/{card_id}/move")
def move_card(
    card_id: int,
    body: MoveCardRequest,
    username: str = Depends(current_user),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    if not repository.move_card(db, username, card_id, body.column_id, body.index):
        raise HTTPException(status_code=404, detail="Card or column not found")
    return repository.get_board(db, username)


# Serve the static site at "/". Mounted last so /api routes take precedence.
# Skipped when the export is not present (e.g. local backend-only dev).
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
