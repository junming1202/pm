# Backend

Python FastAPI service. Serves the JSON API under `/api/*` and the static frontend at `/`. Managed with `uv`. Runs in Docker.

## Stack

- FastAPI + Uvicorn
- `uv` for dependency management (`pyproject.toml`, `uv.lock`)
- pytest + httpx for tests

## Layout

```
backend/
  pyproject.toml      Project metadata and dependencies (runtime + dev group)
  uv.lock             Locked dependency versions
  app/
    __init__.py
    main.py           FastAPI app: API routes + static mount
    auth.py           Session auth: credentials, signed cookie, current_user dep
  tests/
    test_api.py       Endpoint tests (health, hello, index)
    test_auth.py      Auth tests (login, logout, me, protected board)
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
- `GET /api/board` -> placeholder, requires auth (real board data lands in Parts 6/7).
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

- Database (Parts 5-6): normalized SQLite (`users`, `boards`, `columns`, `cards`), created if absent. DB files are gitignored (`*.db`).
- AI (Parts 8-9): OpenRouter calls using `OPENROUTER_API_KEY` from `.env`, model `deepseek/deepseek-v4-flash`, with Structured Outputs.