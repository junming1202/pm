"""SQLite connection, schema creation, and per-request connection dependency.

Uses the stdlib sqlite3 driver. The database file is created automatically if
absent and the schema is applied with CREATE TABLE IF NOT EXISTS. Foreign keys
are enabled per connection.
"""

import os
import sqlite3
from pathlib import Path

# DB path: configurable via PM_DB_PATH, defaults to backend/pm.db (gitignored).
DB_PATH = Path(
    os.environ.get("PM_DB_PATH", Path(__file__).resolve().parent.parent / "pm.db")
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS boards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS columns (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id    INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    position    INTEGER NOT NULL,
    UNIQUE (board_id, position)
);

CREATE TABLE IF NOT EXISTS cards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    column_id   INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    details     TEXT NOT NULL DEFAULT '',
    position    INTEGER NOT NULL,
    UNIQUE (column_id, position)
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """Create the DB file (if absent) and apply the schema."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.executescript(SCHEMA)


def get_db():
    """FastAPI dependency: yield a connection and commit/close per request."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
