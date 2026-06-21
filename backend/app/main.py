from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.auth import (
    SESSION_COOKIE,
    create_session_token,
    current_user,
    verify_credentials,
)

# Directory containing the built Next.js static export, served at "/".
# Populated by the Docker build (frontend "out/" is copied here).
# May be absent during local backend-only development.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="Project Management MVP")


class LoginRequest(BaseModel):
    username: str
    password: str


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
def get_board(username: str = Depends(current_user)) -> dict[str, str]:
    # Placeholder: real board data arrives in Parts 6/7. For now this exists to
    # demonstrate (and test) that board APIs require a valid session.
    return {"owner": username}


# Serve the static site at "/". Mounted last so /api routes take precedence.
# Skipped when the export is not present (e.g. local backend-only dev).
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
