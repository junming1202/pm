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
  Dockerfile          Builds the image (uv base image, runs uvicorn)
  .dockerignore       Excludes venv, caches, tests, db files from the image
  app/
    __init__.py
    main.py           FastAPI app: API routes + static mount
  static/
    index.html        Placeholder page (Part 3 replaces with Next.js export)
  tests/
    test_api.py       Endpoint tests (health, hello, index)
```

## API

- `GET /api/health` -> `{"status": "ok"}`
- `GET /api/hello` -> `{"message": "Hello from FastAPI"}`
- `/` -> static site (`static/index.html`), mounted last so `/api/*` takes precedence.

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

- Auth (Part 4): login/logout/me endpoints with signed session cookies.
- Database (Parts 5-6): normalized SQLite (`users`, `boards`, `columns`, `cards`), created if absent. DB files are gitignored (`*.db`).
- AI (Parts 8-9): OpenRouter calls using `OPENROUTER_API_KEY` from `.env`, model `deepseek/deepseek-v4-flash`, with Structured Outputs.