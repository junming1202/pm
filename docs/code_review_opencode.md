# Code Review (opencode)

Date: 2026-06-21
Scope: entire repository (backend FastAPI, frontend Next.js, Docker, scripts, docs).
Reviewer: opencode automated review
Based on: existing CODE_REVIEW.md findings extended with new items discovered during source analysis.

Priority key: P1 = should fix, P2 = worth fixing, P3 = optional/polish.

---

## High priority (P1)

### 1. SQLite data is lost on every container rebuild

`docker-compose.yml` defines no volume, and `scripts/start.sh` runs `docker compose up --build -d`, which recreates the container. The DB lives at `backend/pm.db` inside the container, so every start with a rebuild discards all board data.

**Existing finding from CODE_REVIEW.md. Action unchanged:**
- Mount a named volume (or bind mount) for the DB and point `PM_DB_PATH` at it.
- Add a `volumes` entry mapping a named volume to a stable in-container path (e.g. `/data`), and set `environment: PM_DB_PATH=/data/pm.db` in `docker-compose.yml`.

### 2. Dockerfile does not copy `uv.lock`, so builds are not reproducible

`Dockerfile` copies only `backend/pyproject.toml` before `uv sync --no-dev`. Without `uv.lock`, `uv sync` resolves fresh versions at build time, so the locked dependency set is ignored and image builds can drift.

**Existing finding from CODE_REVIEW.md. Action unchanged:**
- `COPY backend/pyproject.toml backend/uv.lock ./` and use `uv sync --no-dev --frozen` (or `--locked`) so the build fails if the lock is stale.

### 3. `get_db` commits even when a request handler raises

`get_db` (`backend/app/db.py:64-71`) yields the connection, then `conn.commit()` runs after the `yield` on the success path; on an exception the `finally` only closes. The bigger risk is multi-step writes (e.g. `move_card`, `apply_operations`) that raise partway: the partial writes are not explicitly rolled back before close.

**Existing finding from CODE_REVIEW.md. Action unchanged:**
- Wrap the `yield` so an exception triggers `conn.rollback()` before close.

### 4. Debounced rename timers leak on unmount

In `KanbanBoard.tsx:32`, `renameTimers` is a `useRef<Record<string, ReturnType<typeof setTimeout>>>` that holds pending debounced column rename saves. The `useEffect` cleanup at line 63-65 only sets `active = false` for the board fetch; it does **not** clear `renameTimers`. If the component unmounts while a timer is pending (e.g. user navigates away mid-typing), the timer fires and calls `setBoard` on an unmounted component (React 19 warns/strict-mode errors).

**Action:**
- In the `useEffect` cleanup, iterate `renameTimers.current` and `clearTimeout` each timer, or move timer lifecycle into a proper cleanup pattern.

### 5. `loadBoard` called from `.catch` handlers lacks unmount guard

The `loadBoard` function (`KanbanBoard.tsx:34-41`) does not have the `active` guard that the `useEffect` board fetch has. It is called from `.catch()` callbacks in `handleDragEnd` (line 100), `handleRenameColumn` (line 116), `handleAddCard` (line 121), `handleDeleteCard` (line 125), and `handleUpdateCard` (line 129). If the component unmounts while any of these async operations settle, `loadBoard` calls `setBoard` and `setStatus` on unmounted state.

**Action:**
- Add an `active`/`mounted` ref guard to `loadBoard` (or gate it behind the same pattern as the `useEffect`), or use a shared `useRef(true)` that is set to `false` in the cleanup.

### 6. No rate limiting on `/api/login`

The login endpoint (`backend/app/main.py:78-93`) accepts POST requests with no rate limiting or throttling. While credentials are hardcoded for the MVP, an attacker can brute-force without hindrance. When multi-user auth is added, this becomes a real risk.

**Action:**
- Add in-memory rate limiting (e.g. per-IP, 5 attempts per minute) using a simple dict or `slowapi`. For the MVP this is optional hardening, but the issue should be tracked.

### 7. Static mount at `/` swallows 404s for missing API routes

Because static files are mounted at `/` (`backend/app/main.py:209-210`), any undefined path (e.g. a typo like `/api/boar`) is caught by the static mount and serves `index.html` with a 200 status instead of a 404. This makes API debugging harder.

**Action:**
- Add a catch-all at the end that returns a JSON 404 for `/api/*` paths not matched by any route, before the static mount. Or mount a catch-22 handler.
- Example: `@app.api_route("/api/{path:path}", methods=["GET","POST","PATCH","DELETE"])` that raises 404.

---

## Medium priority (P2)

### 8. `apply_operations` swallows failed AI operations silently

`repository.apply_operations` returns only the operations that succeeded; failures (bad ids, unknown types) are dropped with no signal. The `/api/chat` response reports `applied` but never the rejected ones.

**Existing finding from CODE_REVIEW.md. Action unchanged:**
- Return or log which operations were skipped, and consider surfacing a brief note in the chat reply when `len(applied) < len(operations)`.

### 9. No CORS / same-origin assumption is undocumented and untested for dev split

`lib/api.ts` uses relative `/api` paths and relies on the backend serving the static export at the same origin. During split local dev (`next dev` on :3000, backend on :8000) every call 404s or is cross-origin.

**Existing finding from CODE_REVIEW.md. Action unchanged:**
- Document in `frontend/AGENTS.md` that `npm run dev` is for UI-only work.
- Optional: add a dev rewrite/proxy.

### 10. AI model id is fixed with no fallback or error body reporting

`ai.py:19` hardcodes `deepseek/deepseek-v4-flash`. If OpenRouter renames/removes it, every chat call 502s. The error message from `_post` (line 122) only includes the status code, not the response body.

**Extended from CODE_REVIEW.md:**
- Include the OpenRouter error body (truncated) in the `AIError` message.
- Make the model id an env var (`OPENROUTER_MODEL` with current value as default).

### 11. `ask()` and `chat()` can raise `KeyError`/`IndexError` on unexpected response shape

Both `data["choices"][0]["message"]["content"]` index directly without guards (`ai.py:133`, `ai.py:152`). A malformed OpenRouter success response (empty `choices`, missing keys) raises an unhandled exception that escapes as a 500.

**Existing finding from CODE_REVIEW.md. Action unchanged:**
- Guard the extraction and raise `AIError("AI returned an unexpected response shape")`.

### 12. Column rename has no length/empty validation

`rename_column` (backend `repository.py:128-135`) and the column title input (frontend `KanbanColumn.tsx:44-48`) accept any string, including empty. An empty column title renders a blank header.

**Existing finding from CODE_REVIEW.md. Action unchanged:**
- Trim and reject empty titles in `rename_column` (return 400 or ignore), and mirror a minimal guard in the UI.

### 13. Frontend errors are reduced to a boolean / generic message

`ChatSidebar` collapses all failures to `setError(true)` -> "Something went wrong." `KanbanBoard` mutation failures only trigger `loadBoard()` with no user-visible notice; a failed move/add silently reverts.

**Existing finding from CODE_REVIEW.md. Action unchanged:**
- Surface a transient inline error (toast or inline text) on mutation failure in `KanbanBoard`.
- Keep the chat error generic but log the underlying error to the console for debugging.

### 14. No loading state for board mutations

When creating, editing, or deleting a card, there is no visual feedback that the operation is in progress. On slow connections the UI appears unresponsive until the server responds. The optimistic drag-and-drop has a brief visual update before the server confirms, but immediate mutations (add, edit, delete) have no spinner or disabled state.

**Action:**
- Add a mutation-in-progress state (e.g. a light overlay or disabled buttons) for card add/edit/delete.

### 15. `KanbanCard.save()` discards unsaved details when title is empty

In `KanbanCard.tsx:32-38`, `save()` checks `if (trimmed)` meaning if the title is empty/whitespace, it exits without saving -- but also silently discards any details the user may have typed. The form closes (because `setEditing(false)` is after the `if`) and the changes are lost.

**Action:**
- When the title is empty, keep the edit form open (don't call `setEditing(false)`) or show a validation hint.
- Alternatively, require a non-empty title with the `required` attribute on the input (already on NewCardForm but not on KanbanCard).

### 16. ChatSidebar sends stale `history` closure

In `ChatSidebar.tsx:34`, `const history = messages` captures the current messages array at the time `send` is called. This is correct because the new user message was already appended to state. However, if `send` is called again before the previous `setMessages` has settled (unlikely in practice but possible in React 18+ concurrent mode), `history` could be stale.

**Action:**
- Use a ref to track the latest messages for the API call, or read from a ref in the async callback.

---

## Low priority (P3)

### 17. `loadBoard` and the mount effect duplicate fetch logic

`KanbanBoard.tsx` has both a `loadBoard` helper (line 34) and a near-identical `useEffect` (line 48) with its own `active` guard. They can diverge.

**Existing finding from CODE_REVIEW.md. Action unchanged:**
- Have the mount effect call `loadBoard` (with an `ignore`/`active` guard inside) to remove duplication.

### 18. Magic sentinel `1_000_000` in `move_card`

The move uses position `1_000_000` as a temporary park value (`repository.py:206`), which assumes a column never holds ~1M cards.

**Action:**
- Compute a guaranteed-free sentinel from `MAX(position)+1`, or add a comment naming the assumption.

### 19. `SESSION_SECRET` dev default is shipped in `.env.example`

`.env.example` ships `SESSION_SECRET=dev-secret-change-me` and `auth.py` falls back to the same. A deployment that forgets to set it gets a known secret.

**Existing finding from CODE_REVIEW.md. Action unchanged:**
- In `.env.example`, leave `SESSION_SECRET=` blank with a comment to generate one.

### 20. No backend linter/formatter configured

The frontend has ESLint; the backend has no `ruff`/formatter config. Style consistency relies on convention.

**Existing finding from CODE_REVIEW.md. Action unchanged:**
- Add `ruff` to the dev group with a minimal config.

### 21. Tests do not cover AI "unexpected response shape" and rollback paths

Current AI tests mock well-formed responses. Findings 3 (rollback) and 11 (response shape) lack regression tests.

**Existing finding from CODE_REVIEW.md. Action unchanged:**
- Add tests for malformed AI success payloads and for transaction rollback on mid-operation failure.

### 22. KanbanColumn empty-state text flashes during optimistic moves

`KanbanColumn` shows "Drop a card here" when `cards.length === 0`. During an optimistic drag operation, the card is removed from the source column immediately (local state), but the server hasn't confirmed. The empty state flashes briefly until the server response updates state or the drag completes.

**Existing finding from CODE_REVIEW.md. Action unchanged:**
- Cosmetic; not worth special handling for the MVP.

### 23. `move_card` renumbers source column twice when source == target

In `repository.py:186-241`, when source and target columns are the same, the source column is renumbered twice: once after parking the card (lines 209-220) and again at the end (lines 235-240). This is functionally correct but does 2x the writes for same-column moves.

**Action:**
- Either skip the early renumber when source == target and handle the move directly in the destination logic, or accept the 2x writes as acceptable for MVP simplicity.

### 24. CSS variables mixed with Tailwind arbitrary values

Some styles use `var(--navy-dark)` inside Tailwind's `text-[var(--navy-dark)]` syntax (e.g. `KanbanBoard.tsx:139`), while others use plain CSS in `globals.css`. This works but mixing approaches adds inconsistency.

**Action:**
- Register the design tokens in Tailwind's `@theme` block (already partially done in `globals.css:15-18`) and use the `text-navy-dark` style instead of `text-[var(--navy-dark)]`. Low priority.

### 25. NewCardForm closes even when the API call fails

In `KanbanBoard.tsx:120-122`, `handleAddCard` calls `api.createCard().then(setBoard).catch(loadBoard)`. The `.catch` reloads the board but the `NewCardForm` has already closed (via its own state reset after calling `onAdd`). The user sees the form disappear and no card appear, with no error feedback.

**Action:**
- Either don't close the form until the API succeeds (pass the Promise through), or surface a transient error message as suggested in finding 13.

### 26. `KanbanBoard` header content is visible while loading

The header section with "Kanban Studio" and column legend pins is rendered only when `board` is non-null (status "ready"). Good. But the decorative background circles (lines 167-168) are always rendered, even during loading state, since they're outside the conditionals. Minor.

**Action:**
- Move the decorative circles inside the `status === "ready"` return block, or accept the minor visual artifact.

### 27. Frontend `tsconfig.json` target ES2017

`tsconfig.json:3` sets `"target": "ES2017"`. Modern bundlers downlevel anyway, but ES2017 limits available syntax (async/await is fine, but optional chaining `?.` and nullish coalescing `??` are ES2020). Since Next.js/Vite handles transpilation, this is effectively a no-op, but using ES2022+ would better match the actual runtime environment (Node 22+).

**Action:**
- Bump target to `ES2022` for clarity.

### 28. `KanbanCard` uses `onPointerDown` stopPropagation for edit/delete buttons

`KanbanCard.tsx:114,123` uses `onPointerDown={(event) => event.stopPropagation()}` on the edit and delete buttons to prevent drag initiation. This works but is a well-known dnd-kit pattern that can interfere with other pointer events.

**Action:**
- Consider using `onPointerDown` only on the drag handle (if one is introduced) and using `useSortable`'s `disabled` prop per button interaction area. Fine for MVP.

---

## What looks good

- Clean separation: `auth.py`, `db.py`, `repository.py`, `ai.py` each own one concern; routes in `main.py` stay thin. No business logic leaks into route handlers.
- `moveCard` reducer is pure and unit-tested; the `column:<id>` namespacing fix for id collisions is correct and documented.
- Position renumbering via a negative temp range correctly avoids `UNIQUE(column_id, position)` collisions. The algorithm is sound.
- Auth uses signed cookies (`itsdangerous`), httponly + samesite=lax, with a clean `current_user` dependency.
- Structured Outputs schema is `strict` with all fields required, and invalid AI ops are non-fatal (graceful fallback).
- Tests are isolated (temp DB via `conftest.py`), and e2e resets board state per test. All SQL uses parameterized queries (no injection risk).
- Static export + single-container serving is correctly wired; `/api` precedence over the static mount is intentional and documented.
- Frontend API client (`lib/api.ts`) correctly uses `credentials: "include"` and provides a typed generic `request<T>` wrapper.
- Debounced column rename properly balances optimistic UI with server persistence.
- The UI color scheme is consistently applied via CSS variables and looks polished.

---

## Summary of changes from existing CODE_REVIEW.md

- **Findings retained**: #1-3 (P1), #4-9 (P2), #10-16 (P3) re-indexed and extended with additional detail.
- **New P1 findings added**: renameTimers leak on unmount (#4 new), `loadBoard` missing unmount guard (#5 new), no login rate limiting (#6 new), static mount swallows API 404s (#7 new).
- **New P2 findings added**: no mutation loading state (#14 new), KanbanCard discards details on empty title (#15 new), ChatSidebar stale history closure (#16 new).
- **New P3 findings added**: double renumber in same-column move (#23 new), CSS variable inconsistency (#24 new), NewCardForm closes on API failure (#25 new), header circles during loading (#26 new), outdated TS target (#27 new), stopPropagation pattern (#28 new).
