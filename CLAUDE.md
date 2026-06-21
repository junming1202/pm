# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Project Management MVP: a local single-board Kanban app with hardcoded login (`user` / `password`), SQLite persistence, drag-and-drop cards, and an AI chat sidebar that can create/edit/move cards through OpenRouter.

The deployed shape is one Docker container: a Next.js static export is built from `frontend/`, copied into the FastAPI image, and served by the backend at `/`; JSON APIs live under `/api/*`.

Important project constraints from `AGENTS.md` and `docs/PLAN.md`:
- Keep the app simple and avoid over-engineering or extra features.
- Do not use emojis in project-facing docs/UI copy.
- For issues, identify and prove the root cause before fixing.
- Review `docs/PLAN.md` when continuing planned project work, and update relevant docs/AGENTS files when decisions change.
- The frontend must remain compatible with `output: "export"`; avoid Next.js server-only features such as route handlers, server actions, or dynamic SSR.

## Common commands

### Full stack

```bash
# from repo root
./scripts/start.sh     # Docker compose build/start; app at http://localhost:8000
./scripts/stop.sh      # Docker compose down

docker compose up --build -d
docker compose down
```

Windows equivalents are `scripts\start.bat` and `scripts\stop.bat`.

### Frontend

```bash
# from frontend/
npm install
npm run dev             # Next dev server for frontend-only work
npm run build           # static export build
npm run lint
npm run test:unit       # Vitest unit/integration tests
npm run test:unit:watch # Vitest watch mode
npm run test:e2e        # Playwright tests; requires full stack on :8000
npm run test:all        # unit then e2e
```

Run a single frontend test:

```bash
# from frontend/
npm run test:unit -- src/lib/kanban.test.ts
npm run test:unit -- src/components/ChatSidebar.test.tsx
npm run test:e2e -- tests/kanban.spec.ts
npm run test:e2e -- tests/kanban.spec.ts -g "AI chat"
```

E2E runs against FastAPI serving the static export, not `next dev`. Start the stack first with `../scripts/start.sh`. Override the target with `E2E_BASE_URL` if needed.

### Backend

```bash
# from backend/
uv sync
uv run pytest -q
uv run uvicorn app.main:app --reload   # backend-only dev on :8000; static / may be absent
```

Run a single backend test:

```bash
# from backend/
uv run pytest -q tests/test_board.py
uv run pytest -q tests/test_chat.py::test_chat_create_card_applies_operation
uv run pytest -q -k chat
```

### Docker build

```bash
# from repo root
docker build -t pm-app .
```

The root `Dockerfile` has two stages: Node builds `frontend/out`, then the Python/uv image copies that output into `static/` and runs Uvicorn.

## Architecture

### Backend (`backend/`)

FastAPI app in `backend/app/main.py`:
- Defines `/api/health`, `/api/hello`, auth routes, board CRUD/move routes, `/api/ai/health`, and `/api/chat`.
- Initializes SQLite during lifespan startup via `init_db()`.
- Mounts `static/` at `/` last, only if the static export exists, so `/api/*` takes precedence.

Key backend modules:
- `app/auth.py`: hardcoded MVP credentials, signed `pm_session` cookie with `itsdangerous`, and `current_user` dependency for protected routes.
- `app/db.py`: stdlib `sqlite3` connection management, schema creation, `PM_DB_PATH` override, and `get_db` dependency.
- `app/repository.py`: all board data access and mutations. It lazily creates the user/board, serializes integer DB ids as strings, and keeps card positions contiguous after inserts/deletes/moves.
- `app/ai.py`: minimal OpenRouter client. Uses `OPENROUTER_API_KEY` from `.env` and model `deepseek/deepseek-v4-flash`. `chat()` asks for strict structured output (`reply` plus `operations`).

Backend tests are under `backend/tests/`. `conftest.py` points `PM_DB_PATH` at a temporary DB so tests do not touch the local `pm.db`. AI tests mock network calls.

### Frontend (`frontend/`)

Next.js App Router static export with client-rendered Kanban UI:
- `src/app/page.tsx` renders `AuthGate`.
- `AuthGate` calls `/api/me` on load, shows `LoginScreen` when unauthenticated, and passes user/logout state into `KanbanBoard` after login.
- `KanbanBoard` owns board state, fetches `GET /api/board`, wires drag/drop, column rename, card CRUD, optimistic moves, and renders `ChatSidebar` on large screens.
- `ChatSidebar` owns chat history, calls `POST /api/chat`, appends the reply, and pushes returned board updates into `KanbanBoard` when operations were applied.
- `src/lib/api.ts` is the API client. It uses relative `/api` paths with `credentials: "include"`; endpoints return the full updated board for state replacement.
- `src/lib/kanban.ts` contains shared board types and pure drag/drop helpers.

Frontend state shape mirrors `GET /api/board`:

```ts
type BoardData = {
  columns: { id: string; title: string; cardIds: string[] }[];
  cards: Record<string, { id: string; title: string; details: string }>;
};
```

Column and card ids both come from integer DB primary keys and can collide as strings. Drag-and-drop column drop zones must stay namespaced with `columnDropId()` (`column:<id>`) so a column id is never mistaken for a card id.

Path alias `@/*` maps to `frontend/src/*` in TypeScript and Vitest config.

### Data and auth

SQLite schema is normalized as documented in `docs/DATABASE.md`: `users`, `boards`, `columns`, and `cards`. The MVP enforces one board per user. Default columns are seeded for a new user on first board access: Backlog, Discovery, In Progress, Review, Done.

Auth is documented in `docs/AUTH.md`. Login is hardcoded, but sessions are real signed httponly cookies and all board/AI routes depend on `current_user`.

### AI board operations

`POST /api/chat` sends the current board JSON, prior history, and user message to OpenRouter. The model returns `{ reply, operations }`; the backend applies supported operations in order via `repository.apply_operations` and returns `{ reply, applied, board }`.

Supported operation types:
- `create_card` with `column_id`, `title`, `details`
- `edit_card` with `card_id`, `title`, `details`
- `move_card` with `card_id`, `column_id`, `index`
- `rename_column` with `column_id`, `title`

Invalid or unresolvable operations are skipped rather than making the whole chat request fatal. AI/network/schema failures return 502.

## Environment

Root `.env` is loaded by Docker compose and by the backend via `python-dotenv`. `.env.example` documents expected variables. Important variables:
- `OPENROUTER_API_KEY`: required for live AI calls and the AI chat E2E path.
- `SESSION_SECRET`: signs `pm_session`; a fixed dev default is used if unset.
- `PM_DB_PATH`: optional SQLite path override; tests set this to a temp file.

## Documentation map

- `AGENTS.md`: business requirements, technical decisions, color scheme, coding standards.
- `docs/PLAN.md`: completed project plan and implementation decisions.
- `docs/AUTH.md`: session-cookie auth flow.
- `docs/DATABASE.md`: SQLite schema and ordering strategy.
- `frontend/AGENTS.md`, `backend/AGENTS.md`, `scripts/AGENTS.md`: area-specific notes.
