"""Board data access. All ids returned to callers are serialized as strings to
match the frontend model. Positions are kept contiguous (0-based) within each
sibling set (columns in a board, cards in a column).
"""

import sqlite3

DEFAULT_COLUMNS = ["Backlog", "Discovery", "In Progress", "Review", "Done"]
DEFAULT_BOARD_NAME = "My Board"


# --- seeding -------------------------------------------------------------

def _get_or_create_user(conn: sqlite3.Connection, username: str) -> int:
    row = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row:
        return row["id"]
    cur = conn.execute("INSERT INTO users (username) VALUES (?)", (username,))
    return cur.lastrowid


def _get_or_create_board(conn: sqlite3.Connection, user_id: int) -> int:
    row = conn.execute(
        "SELECT id FROM boards WHERE user_id = ?", (user_id,)
    ).fetchone()
    if row:
        return row["id"]
    cur = conn.execute(
        "INSERT INTO boards (user_id, name) VALUES (?, ?)",
        (user_id, DEFAULT_BOARD_NAME),
    )
    board_id = cur.lastrowid
    for position, title in enumerate(DEFAULT_COLUMNS):
        conn.execute(
            "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?)",
            (board_id, title, position),
        )
    return board_id


def get_or_create_board_id(conn: sqlite3.Connection, username: str) -> int:
    """Ensure the user and their seeded board exist; return the board id."""
    user_id = _get_or_create_user(conn, username)
    return _get_or_create_board(conn, user_id)


# --- reads ---------------------------------------------------------------

def get_board(conn: sqlite3.Connection, username: str) -> dict:
    board_id = get_or_create_board_id(conn, username)
    board = conn.execute(
        "SELECT id, name FROM boards WHERE id = ?", (board_id,)
    ).fetchone()

    column_rows = conn.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
        (board_id,),
    ).fetchall()

    columns = []
    cards: dict[str, dict] = {}
    for col in column_rows:
        card_rows = conn.execute(
            "SELECT id, title, details FROM cards WHERE column_id = ? ORDER BY position",
            (col["id"],),
        ).fetchall()
        card_ids = []
        for card in card_rows:
            cid = str(card["id"])
            cards[cid] = {
                "id": cid,
                "title": card["title"],
                "details": card["details"],
            }
            card_ids.append(cid)
        columns.append(
            {"id": str(col["id"]), "title": col["title"], "cardIds": card_ids}
        )

    return {"id": str(board["id"]), "name": board["name"], "columns": columns, "cards": cards}


# --- helpers -------------------------------------------------------------

def _column_belongs_to(conn: sqlite3.Connection, column_id: int, board_id: int) -> bool:
    row = conn.execute(
        "SELECT 1 FROM columns WHERE id = ? AND board_id = ?",
        (column_id, board_id),
    ).fetchone()
    return row is not None


def _card_column(conn: sqlite3.Connection, card_id: int, board_id: int) -> int | None:
    row = conn.execute(
        """
        SELECT cards.column_id AS column_id
        FROM cards JOIN columns ON cards.column_id = columns.id
        WHERE cards.id = ? AND columns.board_id = ?
        """,
        (card_id, board_id),
    ).fetchone()
    return row["column_id"] if row else None


def _renumber(conn: sqlite3.Connection, column_id: int) -> None:
    """Rewrite card positions in a column to be contiguous 0..n-1."""
    rows = conn.execute(
        "SELECT id FROM cards WHERE column_id = ? ORDER BY position",
        (column_id,),
    ).fetchall()
    # Shift into a temporary range first to avoid UNIQUE(column_id, position)
    # collisions while reassigning.
    for offset, row in enumerate(rows):
        conn.execute(
            "UPDATE cards SET position = ? WHERE id = ?",
            (-(offset + 1), row["id"]),
        )
    for offset, row in enumerate(rows):
        conn.execute(
            "UPDATE cards SET position = ? WHERE id = ?", (offset, row["id"])
        )


# --- writes --------------------------------------------------------------

def rename_column(
    conn: sqlite3.Connection, username: str, column_id: int, title: str
) -> bool:
    board_id = get_or_create_board_id(conn, username)
    if not _column_belongs_to(conn, column_id, board_id):
        return False
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column_id))
    return True


def create_card(
    conn: sqlite3.Connection,
    username: str,
    column_id: int,
    title: str,
    details: str,
) -> dict | None:
    board_id = get_or_create_board_id(conn, username)
    if not _column_belongs_to(conn, column_id, board_id):
        return None
    count = conn.execute(
        "SELECT COUNT(*) AS n FROM cards WHERE column_id = ?", (column_id,)
    ).fetchone()["n"]
    cur = conn.execute(
        "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
        (column_id, title, details, count),
    )
    cid = str(cur.lastrowid)
    return {"id": cid, "title": title, "details": details}


def update_card(
    conn: sqlite3.Connection,
    username: str,
    card_id: int,
    title: str,
    details: str,
) -> bool:
    board_id = get_or_create_board_id(conn, username)
    if _card_column(conn, card_id, board_id) is None:
        return False
    conn.execute(
        "UPDATE cards SET title = ?, details = ? WHERE id = ?",
        (title, details, card_id),
    )
    return True


def delete_card(conn: sqlite3.Connection, username: str, card_id: int) -> bool:
    board_id = get_or_create_board_id(conn, username)
    column_id = _card_column(conn, card_id, board_id)
    if column_id is None:
        return False
    conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    _renumber(conn, column_id)
    return True


def move_card(
    conn: sqlite3.Connection,
    username: str,
    card_id: int,
    target_column_id: int,
    target_index: int,
) -> bool:
    """Move a card to target_column_id at target_index (0-based). Renumbers both
    the source and destination columns so positions stay contiguous."""
    board_id = get_or_create_board_id(conn, username)
    source_column_id = _card_column(conn, card_id, board_id)
    if source_column_id is None:
        return False
    if not _column_belongs_to(conn, target_column_id, board_id):
        return False

    # Park the moved card at a sentinel position that cannot collide with the
    # negative temp range used while renumbering siblings.
    conn.execute(
        "UPDATE cards SET position = ? WHERE id = ?",
        (1_000_000, card_id),
    )
    # Remove from source ordering by renumbering remaining cards.
    remaining = conn.execute(
        "SELECT id FROM cards WHERE column_id = ? AND id != ? ORDER BY position",
        (source_column_id, card_id),
    ).fetchall()
    for offset, row in enumerate(remaining):
        conn.execute(
            "UPDATE cards SET position = ? WHERE id = ?", (-(offset + 1), row["id"])
        )
    for offset, row in enumerate(remaining):
        conn.execute(
            "UPDATE cards SET position = ? WHERE id = ?", (offset, row["id"])
        )

    # Build the destination order with the card inserted at target_index.
    dest = conn.execute(
        "SELECT id FROM cards WHERE column_id = ? AND id != ? ORDER BY position",
        (target_column_id, card_id),
    ).fetchall()
    dest_ids = [row["id"] for row in dest]
    index = max(0, min(target_index, len(dest_ids)))
    dest_ids.insert(index, card_id)

    # Move the card into the destination column, then renumber via temp range.
    conn.execute(
        "UPDATE cards SET column_id = ? WHERE id = ?", (target_column_id, card_id)
    )
    for offset, cid in enumerate(dest_ids):
        conn.execute(
            "UPDATE cards SET position = ? WHERE id = ?", (-(offset + 1), cid)
        )
    for offset, cid in enumerate(dest_ids):
        conn.execute("UPDATE cards SET position = ? WHERE id = ?", (offset, cid))
    return True


# --- AI operations -------------------------------------------------------

def _to_int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def apply_operation(
    conn: sqlite3.Connection, username: str, op: dict
) -> bool:
    """Apply a single AI-produced board operation. Returns whether it succeeded.

    Operation ids arrive as strings (the board model serializes ids as strings).
    Unknown types or unresolvable ids are skipped (return False).
    """
    op_type = op.get("type")
    if op_type == "create_card":
        column_id = _to_int(op.get("column_id"))
        if column_id is None:
            return False
        return create_card(
            conn, username, column_id, op.get("title", ""), op.get("details", "")
        ) is not None
    if op_type == "edit_card":
        card_id = _to_int(op.get("card_id"))
        if card_id is None:
            return False
        return update_card(
            conn, username, card_id, op.get("title", ""), op.get("details", "")
        )
    if op_type == "move_card":
        card_id = _to_int(op.get("card_id"))
        column_id = _to_int(op.get("column_id"))
        if card_id is None or column_id is None:
            return False
        return move_card(conn, username, card_id, column_id, op.get("index", 0))
    if op_type == "rename_column":
        column_id = _to_int(op.get("column_id"))
        if column_id is None:
            return False
        return rename_column(conn, username, column_id, op.get("title", ""))
    return False


def apply_operations(
    conn: sqlite3.Connection, username: str, operations: list[dict]
) -> list[dict]:
    """Apply operations in order; return the ones that succeeded."""
    applied = []
    for op in operations:
        if apply_operation(conn, username, op):
            applied.append(op)
    return applied
