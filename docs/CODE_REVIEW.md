# Code Review

Date: 2026-06-21
Scope: entire repository (backend FastAPI, frontend Next.js, Docker, scripts, docs).
Overall: the MVP is well-structured, simple, and matches the plan. Tests pass (backend 30 passed/1 skipped, frontend 21 unit, 5 e2e). The findings below are improvements, not blockers. Each has a concrete action and a priority.

Priority key: P1 = should fix, P2 = worth fixing, P3 = optional/polish.

---

## High priority (P1)

### 1. SQLite data is lost on every container rebuild

`docker-compose.yml` defines no volume, and `scripts/start.sh` runs `docker compose up --build -d`, which recreates the container. The DB lives at `backend/pm.db` inside the container, so every start with a rebuild discards all board data. This contradicts the project goal that "the board persists in SQLite."

Action:
- Mount a named volume (or bind mount) for the DB and point `PM_DB_PATH` at it.
- Example: add a `volumes` entry mapping a named volume to a stable in-container path (e.g. `/data`), and set `environment: PM_DB_PATH=/data/pm.db` in `docker-compose.yml`.
- Verify: create a card, run `./scripts/stop.sh` then `./scripts/start.sh`, confirm the card survives.

### 2. Dockerfile does not copy `uv.lock`, so builds are not reproducible

`Dockerfile` copies only `backend/pyproject.toml` before `uv sync --no-dev`. Without `uv.lock`, `uv sync` resolves fresh versions at build time, so the locked dependency set is ignored and image builds can drift.

Action:
- `COPY backend/pyproject.toml backend/uv.lock ./` and use `uv sync --no-dev --frozen` (or `--locked`) so the build fails if the lock is stale instead of silently re-resolving.
- Verify: `docker build` succeeds and the resolved versions match `uv.lock`.

### 3. `get_db` commits even when a request handler raises

`get_db` (`backend/app/db.py`) yields the connection, then `conn.commit()` runs after the `yield` on the success path; on an exception the `finally` only closes. That is acceptable, but note that FastAPI dependencies with `yield` resume after the response. The bigger risk is multi-step writes (e.g. `move_card`, `apply_operations`) that raise partway: the partial writes are not explicitly rolled back before close, and SQLite will roll back the open transaction on close only if not committed. This works today but is implicit.

Action:
- Make the transaction boundary explicit: wrap the `yield` so an exception triggers `conn.rollback()` before close.
- Example: `try: yield conn; conn.commit(); except Exception: conn.rollback(); raise; finally: conn.close()`.
- Verify: add a test that forces a mid-operation failure and asserts no partial write persists.

---

## Medium priority (P2)

### 4. `apply_operations` swallows failed AI operations silently

`repository.apply_operations` returns only the operations that succeeded; failures (bad ids, unknown types) are dropped with no signal. The `/api/chat` response reports `applied` but never the rejected ones, so the user sees a reply implying success while some changes silently did nothing.

Action:
- Return or log which operations were skipped, and consider surfacing a brief note in the chat reply when `len(applied) < len(operations)`.
- At minimum, add a server-side log line for skipped operations to aid debugging.

### 5. No CORS / same-origin assumption is undocumented and untested for dev split

`lib/api.ts` uses relative `/api` paths and relies on the backend serving the static export at the same origin. During split local dev (`next dev` on :3000, backend on :8000) every call 404s or is cross-origin. This is fine for the intended Docker flow but is a sharp edge.

Action:
- Document in `frontend/AGENTS.md` that `npm run dev` is for UI-only work and API calls require the full Docker stack (or a proxy).
- Optional: add a dev rewrite/proxy so `next dev` can talk to the backend.

### 6. AI model id is fixed to `deepseek/deepseek-v4-flash` with no fallback or validation

`ai.py` hardcodes the model. If OpenRouter renames/removes it, every chat call 502s with a generic "OpenRouter returned 4xx". The error message does not include the response body, making diagnosis hard.

Action:
- Include the OpenRouter error body (truncated) in the `AIError` message for `HTTPStatusError`.
- Consider making the model id an env var with the current value as default, so it can be swapped without a code change.

### 7. `ask()` and `chat()` can raise `KeyError`/`IndexError` on unexpected response shape

Both index `data["choices"][0]["message"]["content"]` directly. A malformed OpenRouter success response (empty `choices`, missing keys) raises an unhandled exception that escapes as a 500 rather than the intended 502 `AIError`.

Action:
- Guard the extraction and raise `AIError("AI returned an unexpected response shape")` when keys/indices are missing.

### 8. Column rename has no length/empty validation

`rename_column` (backend) and the column title input (frontend) accept any string, including empty. An empty column title renders a blank header. The AI `rename_column` op can also set `''`.

Action:
- Trim and reject empty titles in `rename_column` (return 400 or ignore), and mirror a minimal guard in the UI.

### 9. Frontend errors are reduced to a boolean / generic message

`ChatSidebar` collapses all failures to `setError(true)` -> "Something went wrong." `KanbanBoard` mutation failures only trigger `loadBoard()` with no user-visible notice; a failed move/add silently reverts. Users cannot tell a save failed.

Action:
- Surface a transient inline error (toast or inline text) on mutation failure in `KanbanBoard`.
- Keep the chat error generic but log the underlying error to the console for debugging.

---

## Low priority (P3)

### 10. `loadBoard` and the mount effect duplicate fetch logic

`KanbanBoard` has both a `loadBoard` helper and a near-identical `useEffect` with its own `active` guard. They can diverge.

Action: have the mount effect call `loadBoard` (with an `ignore`/`active` guard inside) to remove duplication.

### 11. Magic sentinel `1_000_000` in `move_card`

The move uses position `1_000_000` as a temporary park value, which assumes a column never holds ~1M cards. Safe for the MVP but undocumented as an invariant.

Action: add a short comment naming the assumption, or compute a guaranteed-free sentinel from `MAX(position)+1`.

### 12. `details.trim()` in card edit can erase intentional content

`KanbanCard.save()` trims details; multi-line notes with trailing structure lose formatting. Minor.

Action: trim only the title; leave details as typed (or only collapse if fully whitespace).

### 13. `SESSION_SECRET` dev default is shipped in `.env.example`

`.env.example` ships `SESSION_SECRET=dev-secret-change-me` and `auth.py` falls back to the same. Fine for MVP, but a deployment that forgets to set it gets a known secret. The README/docs note this; reinforce it.

Action: in `.env.example`, leave `SESSION_SECRET=` blank with a comment to generate one, so an unset value is obvious rather than a shared known string.

### 14. No backend linter/formatter configured

The frontend has ESLint; the backend has no `ruff`/formatter config. Style consistency relies on convention.

Action: add `ruff` to the dev group with a minimal config; run in CI/pre-commit if introduced later.

### 15. Tests do not cover the AI "unexpected response shape" and rollback paths

Current AI tests mock well-formed responses. Findings 3 and 7 lack regression tests.

Action: add tests for malformed AI success payloads and for transaction rollback on mid-operation failure.

### 16. `KanbanColumn` shows "Drop a card here" but card count and empty-state can briefly disagree during optimistic moves

Cosmetic; optimistic state updates can flash. Not worth special handling for the MVP. No action required beyond awareness.

---

## What looks good

- Clean separation: `auth.py`, `db.py`, `repository.py`, `ai.py` each own one concern; routes in `main.py` stay thin.
- `moveCard` reducer is pure and unit-tested; the `column:<id>` namespacing fix for id collisions is correct and documented.
- Position renumbering via a negative temp range correctly avoids `UNIQUE(column_id, position)` collisions.
- Auth uses signed cookies (`itsdangerous`), httponly + samesite=lax, with a clean `current_user` dependency.
- Structured Outputs schema is `strict` with all fields required, and invalid AI ops are non-fatal.
- Tests are isolated (temp DB via `conftest.py`), and e2e resets board state per test.
- Static export + single-container serving is correctly wired; `/api` precedence over the static mount is intentional and documented.

---

## Suggested order of work

1. Fix data persistence volume (P1 #1) and Dockerfile lockfile (P1 #2) — these affect correctness of the deployed artifact.
2. Make the DB transaction boundary explicit (P1 #3).
3. Improve AI error reporting and response-shape guards (P2 #6, #7).
4. Surface mutation/chat errors to users (P2 #9) and report skipped AI ops (P2 #4).
5. Tidy validation and duplication (P2 #8, P3 #10) and add the missing tests (P3 #15).
