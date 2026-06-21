# Project Plan: Project Management MVP

A single-board Kanban app: fake login, drag-and-drop cards, SQLite persistence, and an AI chat sidebar (via OpenRouter) that can create/edit/move cards. Next.js frontend (static export) served by a FastAPI backend, packaged in one Docker container.

This document is the working checklist. Each part lists substeps, tests, and success criteria. Check items off as completed.

## Key decisions (confirmed)

- Architecture: Next.js static export (`output: "export"`) built into the backend and served by FastAPI at `/`. No Next.js server features.
- Backend: Python FastAPI, `uv` package manager, single Docker container.
- Database: SQLite, created if absent. Board stored as proper normalized tables (users, boards, columns, cards), not a JSON blob.
- Auth: real session cookies/tokens. Login must persist across page refresh. Credentials hardcoded to `user` / `password` for the MVP; schema supports multiple users.
- AI: OpenRouter, model id `deepseek/deepseek-v4-flash` (kept exactly as specified). `OPENROUTER_API_KEY` read from `.env`.
- One board per user for the MVP; fixed columns that can be renamed.
- Coding standards: simple, concise, no over-engineering, no emojis, root-cause before fixes.

## Conventions

- Backend tests: `pytest`. Frontend unit/integration: Vitest + Testing Library. E2E: Playwright.
- Run inside Docker for integration/e2e where the full stack is needed; local for fast unit loops.
- Document any new decisions back into this file and the relevant `AGENTS.md`.

---

## Part 1: Plan (this document) and frontend AGENTS.md

- [x] Enrich `docs/PLAN.md` with detailed substeps, tests, and success criteria.
- [x] Create `frontend/AGENTS.md` describing existing frontend code.
- [ ] User reviews and approves the plan before any further work.

Tests / success criteria:
- Plan covers all 10 parts with actionable checklists and verifiable success criteria.
- `frontend/AGENTS.md` accurately reflects the current frontend structure and stack.
- User has explicitly approved before Part 2 begins.

---

## Part 2: Scaffolding (Docker + FastAPI + scripts)

- [x] Create `backend/` FastAPI app managed with `uv` (`pyproject.toml`, locked deps).
- [x] Add a health endpoint (`GET /api/health` returns status JSON).
- [x] Add an example API endpoint (`GET /api/hello` returns a hello payload).
- [x] Serve a placeholder static `index.html` at `/` from FastAPI.
- [x] Write `Dockerfile` (uses `uv`, runs the FastAPI app, exposes port).
- [x] Add `docker-compose.yml` (or equivalent) for local run, loading `.env`.
- [x] Write start/stop scripts in `scripts/` for Mac, Windows, Linux.
- [x] Update `backend/AGENTS.md` and `scripts/AGENTS.md` with what was built.

Tests / success criteria:
- Backend unit test: `GET /api/health` returns 200 and expected JSON.
- Backend unit test: `GET /api/hello` returns 200 and expected JSON.
- `docker build` succeeds; container starts via the start script.
- Visiting `/` serves the placeholder HTML; the page can call `/api/hello` successfully.
- Stop script cleanly stops the container.

---

## Part 3: Add in Frontend (static build served by backend)

- [x] Configure Next.js for static export (`output: "export"`, image/asset settings as needed).
- [x] Build the frontend and wire output into the Docker image so FastAPI serves it at `/`.
- [x] Ensure SPA-style routing/asset paths resolve correctly when served by FastAPI.
- [x] Confirm the existing demo Kanban board renders at `/` in the container.
- [x] Keep/adjust existing Vitest and Playwright tests for the served build.

Tests / success criteria:
- Frontend unit tests pass (`npm run test:unit`).
- Frontend builds with static export without errors.
- In the running container, `/` shows the demo Kanban board with 5 columns.
- E2E (against the container or dev server): load board, add a card, drag a card between columns.

---

## Part 4: Fake user sign in (real session cookies)

- [x] Backend: `POST /api/login` validating `user`/`password`, issuing a signed session cookie/token.
- [x] Backend: `POST /api/logout` clearing the session.
- [x] Backend: `GET /api/me` returning the current user when authenticated, 401 otherwise.
- [x] Protect board APIs so they require a valid session.
- [x] Frontend: login screen shown when unauthenticated; board shown when authenticated.
- [x] Frontend: logout control; session persists across page refresh (cookie-based).
- [x] Document the auth approach in `docs/` and the relevant `AGENTS.md`.

Tests / success criteria:
- Backend tests: valid login sets session and returns 200; invalid login returns 401.
- Backend tests: `GET /api/me` returns 401 without session, 200 with session.
- Backend tests: logout invalidates the session.
- Frontend/E2E: cannot see board until logged in; after login the board appears; after refresh the user stays logged in; logout returns to the login screen.

---

## Part 5: Database modeling (normalized SQLite)

- [x] Propose normalized schema: `users`, `boards`, `columns`, `cards` (with ordering and FKs).
- [x] Define column/card ordering strategy (e.g., position integers) and constraints.
- [x] Document the schema and rationale in `docs/` (e.g., `docs/DATABASE.md`).
- [x] Specify the "create DB if not exists" + seed behavior.
- [ ] Get user sign-off on the schema before implementation.

Tests / success criteria:
- `docs/DATABASE.md` describes tables, columns, types, keys, relationships, and ordering.
- Schema supports multiple users and one board per user for the MVP.
- User has approved the schema before Part 6.

---

## Part 6: Backend (board CRUD APIs + persistence)

- [ ] Implement DB layer: connect to SQLite, create tables if absent, seed defaults for a new user/board.
- [ ] `GET /api/board` returns the authenticated user's board (columns + cards, ordered).
- [ ] Endpoints to rename a column.
- [ ] Endpoints to create, edit, delete, and move cards (reorder within and across columns).
- [ ] Ensure ordering integrity on move/insert/delete.
- [ ] Update `backend/AGENTS.md` with the data layer and routes.

Tests / success criteria:
- DB is created automatically on first run if missing.
- Backend unit/integration tests cover: get board, rename column, create/edit/delete card, move card (same and cross column), and ordering correctness.
- All board endpoints require authentication (401 without session).
- Tests verify persistence across requests.

---

## Part 7: Frontend + Backend integration (persistent board)

- [ ] Replace in-memory `initialData` with data fetched from `GET /api/board`.
- [ ] Wire rename/add/edit/delete/move actions to backend endpoints.
- [ ] Handle loading and error states; keep optimistic UI where sensible.
- [ ] Ensure refresh reloads the persisted board for the logged-in user.
- [ ] Update tests to cover API-backed behavior.

Tests / success criteria:
- Unit tests for the API client and state wiring.
- E2E: log in, add/edit/move/delete a card, refresh, and confirm changes persisted.
- Column rename persists after refresh.
- Errors surface clearly without breaking the board.

---

## Part 8: AI connectivity (OpenRouter smoke test)

- [ ] Backend: load `OPENROUTER_API_KEY` from `.env`; configure model `deepseek/deepseek-v4-flash`.
- [ ] Implement a minimal AI call helper.
- [ ] Add a connectivity test endpoint or test that asks "2+2" and checks the response.
- [ ] Document AI setup in `backend/AGENTS.md`.

Tests / success criteria:
- A "2+2" call returns a sensible answer (e.g., contains "4"), proving connectivity.
- Missing/invalid API key fails clearly with a helpful error.
- The key is never logged or committed.

---

## Part 9: AI board reasoning (Structured Outputs)

- [ ] Backend: build the AI request with the board JSON + user question + conversation history.
- [ ] Define a Structured Outputs schema: a user-facing reply plus an optional board update.
- [ ] Parse and validate the structured response; apply board updates via the Part 6 data layer.
- [ ] Define and document the update operation set (create/edit/move card, rename column).
- [ ] Add a chat endpoint that returns the reply and any applied changes.

Tests / success criteria:
- Backend tests with mocked AI responses: reply-only, and reply-plus-update cases.
- Structured output is validated; malformed responses are handled gracefully.
- Applied updates are persisted and reflected in `GET /api/board`.
- Conversation history is included in requests.

---

## Part 10: AI chat sidebar UI

- [ ] Build a sidebar chat widget matching the color scheme (yellow/blue/purple/navy/gray).
- [ ] Send user messages (with history) to the chat endpoint; render replies.
- [ ] When the AI updates the board, refresh the board UI automatically.
- [ ] Handle loading, errors, and empty states.
- [ ] Add unit/integration and E2E tests for the chat flow.

Tests / success criteria:
- Unit/integration tests for the chat component and refresh-on-update behavior.
- E2E: open chat, ask the AI to add/move a card, confirm the board updates without manual refresh.
- Chat UI is responsive and on-brand; no emojis.
- Full stack works end to end in the Docker container.

---

## Definition of done (overall)

- App runs in a single Docker container via the start script and stops via the stop script.
- Login required; session persists across refresh; logout works.
- Board persists in SQLite (normalized tables); created automatically if absent.
- Drag-and-drop, column rename, and card CRUD all work and persist.
- AI chat can create/edit/move cards and the UI refreshes automatically.
- Unit, integration, and E2E tests pass.