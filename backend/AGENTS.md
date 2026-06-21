# Backend

Python FastAPI service. Serves the JSON API under `/api/*` and the static frontend at `/`. Managed with `uv`. Runs in Docker.

## Stack

- FastAPI + Uvicorn
- `uv` for dependency management (`pyproject.toml`, `uv.lock`)
- httpx for OpenRouter calls; python-dotenv to load `.env`
- pytest for tests

## Layout

```
backend/
  pyproject.toml      Project metadata and dependencies (runtime + dev group)
  uv.lock             Locked dependency versions
  app/
    __init__.py
    main.py           FastAPI app: API routes + static mount + DB init
    auth.py           Session auth: credentials, signed cookie, current_user dep
    db.py             SQLite connection, schema, init_db, get_db dependency
    repository.py     Board data access: seed, get_board, CRUD + move + apply_operations
    ai.py             OpenRouter client: ask() smoke test, chat() structured; AIError
  tests/
    conftest.py       Points PM_DB_PATH at a temp DB so tests never touch pm.db
    test_api.py       Endpoint tests (health, hello, index)
    test_auth.py      Auth tests (login, logout, me, protected board)
    test_board.py     Board tests (seed, rename, card CRUD, move, ordering, auth)
    test_ai.py        AI tests (missing key error, auth, mocked 2+2, 502 path)
    test_chat.py      Chat tests (reply-only, create/rename ops, invalid op, history, 502)
```

The Docker image is built from the root `Dockerfile` (multi-stage): stage 1
builds the Next.js static export, stage 2 is this backend with the export copied
into `static/`. There is no `static/` directory in the repo; it only exists
inside the image (and is gitignored if generated locally).

## API

- `GET /api/health` -> `{"status": "ok"}`
- `GET /api/hello` -> `{"message": "Hello from FastAPI"}`
- `POST /api/login` -> validates credentials, sets signed session cookie, returns `{"username"}`. 401 on bad credentials.
- `POST /api/logout` -> clears the session cookie, returns `{"ok": true}`.
- `GET /api/me` -> `{"username"}` when authenticated, 401 otherwise.
- `GET /api/board` -> the caller's board: `{id, name, columns:[{id,title,cardIds}], cards:{id:{id,title,details}}}`. Auto-creates the board (named "My Board" with five empty default columns) on first access. Requires auth.
- `PATCH /api/columns/{id}` -> rename a column (`{title}`); returns the updated board.
- `POST /api/cards` -> create a card (`{column_id, title, details?}`), appended to the column; 201 + board.
- `PATCH /api/cards/{id}` -> edit a card (`{title, details}`); returns the board.
- `DELETE /api/cards/{id}` -> delete a card and renumber its column; returns the board.
- `POST /api/cards/{id}/move` -> move a card (`{column_id, index}`) within/across columns, renumbering both; returns the board.
- `GET /api/ai/health` -> connectivity smoke test: asks the model "2+2" and returns `{"answer"}`. Requires auth. Returns 502 with a helpful message if the key is missing/invalid or OpenRouter fails.
- `POST /api/chat` -> board assistant. Body `{message, history?}` where `history` is `[{role, content}]`. Sends the board JSON + history + message to the model with Structured Outputs, applies any returned operations, and returns `{reply, applied, board}`. Requires auth; 502 if the AI call fails or returns invalid output.
- All board endpoints require auth (401 without a valid session) and 404 when a card/column is not found or not owned by the caller.
- `/` -> Next.js static export (served from `static/` when present), mounted
  last so `/api/*` takes precedence. The mount is skipped if `static/` is
  absent (local backend-only dev), so `GET /` only works in the Docker image
  or after copying the frontend `out/` into `backend/static`.

## Auth

- Credentials are hardcoded for the MVP (`user` / `password`) in `app/auth.py`.
- On login, the username is signed with `itsdangerous` (`URLSafeSerializer`) and
  stored in an httponly, samesite=lax cookie named `pm_session`. This keeps the
  user logged in across refreshes and cannot be forged without the secret.
- The signing secret comes from `SESSION_SECRET` (read from `.env`); a fixed dev
  default is used if unset so local runs work. Set a real `SESSION_SECRET` for
  any non-local use.
- `current_user` is a FastAPI dependency that reads/validates the cookie and
  raises 401 if missing/invalid. Protect any route by adding it as a dependency.

## Data layer

- `app/db.py` uses the stdlib `sqlite3` module. The DB file path defaults to
  `backend/pm.db` and can be overridden via `PM_DB_PATH` (tests use a temp file).
- `init_db()` creates the file and schema if missing; it runs at app startup via
  the FastAPI lifespan handler. Foreign keys are enabled per connection.
- Schema (normalized): `users`, `boards` (one per user), `columns` (ordered by
  `position`), `cards` (ordered by `position` within a column). See
  `docs/DATABASE.md`.
- `get_db` is a FastAPI dependency yielding a connection that commits on success
  and always closes.
- `app/repository.py` holds all data access: it lazily creates the user/board on
  first request, returns the board in the frontend's shape (integer PKs are
  serialized as strings), and keeps card positions contiguous (0-based) by
  renumbering on every write/move. Card moves park the moved card at a sentinel
  position and use a temporary negative range to avoid `UNIQUE(column_id,
  position)` collisions mid-update.

## AI (OpenRouter)

- `app/ai.py` is a minimal OpenRouter client. `ask(prompt)` sends a single-turn
  chat completion and returns the assistant's reply text.
- The key is read from `OPENROUTER_API_KEY` (loaded from `.env` via
  `python-dotenv`). If unset, `ask` raises `AIError` with a clear message; the
  key is never logged. The model id is fixed to `deepseek/deepseek-v4-flash`.
- `httpx` is a runtime dependency (also used by Starlette's TestClient). Tests
  mock `ai.httpx.post` (or `ai.chat`), so they never hit the network.
- See `.env.example` at the repo root for the required variables.
- `chat(board, history, question)` uses OpenRouter Structured Outputs
  (`response_format` json_schema) to force a `{reply, operations}` object. Each
  operation has a `type` and a fixed set of fields (`column_id`, `card_id`,
  `title`, `details`, `index`); unused string fields are `''` and unused index
  is `0` (the schema is `strict`, so all fields are required). Invalid JSON or a
  missing `reply` raises `AIError`.
- Operation types and the repository functions they call:
  - `create_card` (column_id, title, details) -> `create_card`
  - `edit_card` (card_id, title, details) -> `update_card`
  - `move_card` (card_id, column_id, index) -> `move_card`
  - `rename_column` (column_id, title) -> `rename_column`
  `repository.apply_operations` runs them in order and returns the ones that
  succeeded; unknown types or unresolvable ids are skipped (not fatal).

## Commands

```bash
# from backend/
uv sync                 # install deps (creates .venv)
uv run pytest -q        # run tests
uv run uvicorn app.main:app --reload   # local dev server on :8000
```

Run the full stack via Docker using the scripts in `scripts/` (see `scripts/AGENTS.md`).

## Conventions

- API routes are namespaced under `/api`. The static mount at `/` must stay last.
- Keep runtime deps minimal; dev-only tools go in the `dev` dependency group.
- Static frontend is served from `static/`; the Docker image copies it in.

## Notes for later parts

- AI chat UI (Part 10): call `POST /api/chat`, render `reply`, and refresh the
  board from the returned `board` (or re-fetch `GET /api/board`) when `applied`
  is non-empty.