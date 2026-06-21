"""Session auth: hardcoded credentials and a signed session cookie.

The cookie value is the username, signed with itsdangerous so it cannot be
forged or tampered with. The signing secret comes from SESSION_SECRET (.env);
a fixed dev default is used if unset so local runs work out of the box.
"""

import os

from fastapi import Cookie, HTTPException, status
from itsdangerous import BadSignature, URLSafeSerializer

# MVP credentials. The schema/users table (Part 5+) will generalise this.
VALID_USERNAME = "user"
VALID_PASSWORD = "password"

SESSION_COOKIE = "pm_session"
_SECRET = os.environ.get("SESSION_SECRET", "dev-secret-change-me")
_serializer = URLSafeSerializer(_SECRET, salt="pm-session")


def verify_credentials(username: str, password: str) -> bool:
    return username == VALID_USERNAME and password == VALID_PASSWORD


def create_session_token(username: str) -> str:
    return _serializer.dumps({"username": username})


def read_session_token(token: str) -> str | None:
    try:
        data = _serializer.loads(token)
    except BadSignature:
        return None
    return data.get("username")


def current_user(pm_session: str | None = Cookie(default=None)) -> str:
    """FastAPI dependency: return the username or raise 401."""
    username = read_session_token(pm_session) if pm_session else None
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    return username
