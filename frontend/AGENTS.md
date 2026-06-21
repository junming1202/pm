# Frontend

Next.js (App Router) single-board Kanban UI, built as a static export (`output: "export"`) and served by FastAPI. Auth (session cookies) gates the board; board data is fetched from and persisted to the backend (`GET /api/board` plus column/card mutations). An AI chat sidebar arrives in Part 10.

## Stack

- Next.js 16 (App Router) + React 19, TypeScript
- Tailwind CSS 4 (via `@tailwindcss/postcss`)
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` for drag and drop
- `clsx` for conditional classes
- Vitest + Testing Library (unit/integration), Playwright (e2e)

## Layout

```
src/
  app/
    layout.tsx        Root layout, fonts (Space Grotesk + Manrope), global metadata
    page.tsx          Home route, renders <KanbanBoard />
    globals.css       Tailwind import + CSS variables (color scheme, surfaces, shadows)
  components/
    AuthGate.tsx      Checks /api/me; renders LoginScreen or KanbanBoard; owns login/logout
    AuthGate.test.tsx Auth flow tests (login, error, persist-on-refresh, logout)
    LoginScreen.tsx   On-brand sign-in form (data-testid="login-form")
    KanbanBoard.tsx   Owns board state, DndContext, drag/rename/add/delete; shows user + logout
    KanbanColumn.tsx  Droppable column, editable title, hosts cards + NewCardForm
    KanbanCard.tsx    Sortable card, delete control
    KanbanCardPreview.tsx  Card rendering used in the DragOverlay
    NewCardForm.tsx   Inline form to add a card to a column
    KanbanBoard.test.tsx   Component/integration test
  lib/
    api.ts            Backend API client (auth + board CRUD); fetch with credentials
    kanban.ts         Types (Card, Column, BoardData), moveCard, locateCard
    kanban.test.ts    Unit tests for moveCard / helpers
  test/
    setup.ts          Vitest setup (jest-dom matchers)
    vitest.d.ts       Type augmentation for matchers
tests/
  kanban.spec.ts      Playwright e2e (load board, add card, drag between columns)
```

## Data model (`src/lib/kanban.ts`)

```ts
type Card = { id: string; title: string; details: string };
type Column = { id: string; title: string; cardIds: string[] };
type BoardData = { columns: Column[]; cards: Record<string, Card> };
```

- `columns` keeps ordering; `cards` is a lookup keyed by id; column membership/order lives in `cardIds`. Shape mirrors the backend's `GET /api/board` response.
- `moveCard(columns, activeId, overId)` is a pure reducer for drag-and-drop (same-column reorder and cross-column move). Keep it pure and well-tested.
- `locateCard(columns, cardId)` returns `{ columnId, index }` for a card; used to turn a drag result into the backend move payload (`{ column_id, index }`).

## Auth

- `AuthGate` (client component) is the entry point rendered by `page.tsx`. On
  mount it calls `GET /api/me`; if authenticated it shows `KanbanBoard`,
  otherwise `LoginScreen`. It owns `login`/`logout` and passes `user`/`onLogout`
  to the board.
- The session is a backend httponly cookie, so login survives a page refresh
  (the cookie is sent automatically; `AuthGate` re-checks `/api/me` on load).
- `lib/api.ts` wraps fetch with `credentials: "include"` and base path `/api`.
  Same-origin in the container (FastAPI serves the static export), so relative
  paths work.

## State and conventions

- `KanbanBoard` is a client component (`"use client"`). On mount it fetches the board from `GET /api/board` (loading/error states with a retry button). It accepts optional `user`/`onLogout` props; when absent (e.g. unit tests) it renders without the logout control.
- Mutations call `lib/api.ts` (create/update/delete/move card, rename column); each endpoint returns the full board, which replaces local state. Moves are optimistic (reorder locally via `moveCard`, then persist); column renames are optimistic and debounced (400ms). On any failure the board reloads from the server.
- Styling uses CSS variables defined in `globals.css` (see project color scheme). Prefer variables over hardcoded hex.
- Test ids: columns expose `data-testid="column-<columnId>"`, cards expose `data-testid="card-<cardId>"`. e2e tests rely on these.

## Path alias

`@/*` maps to `src/*` (configured in `tsconfig.json`, `vitest.config.ts`).

## Commands

```bash
npm install
npm run dev        # dev server (next dev)
npm run build      # production build
npm run lint
npm run test:unit  # vitest
npm run test:e2e   # playwright against the full stack (see below)
npm run test:all   # unit then e2e
```

E2E (Playwright) runs against the full stack, not the dev server. Start it first
with `../scripts/start.sh` (FastAPI serving the static export on
`http://localhost:8000`), then run `npm run test:e2e`. Override the target with
`E2E_BASE_URL`. Each E2E test logs in and resets the board to empty first.

## Notes for later parts

- Keep everything client-rendered: the app is built with `output: "export"`. Avoid Next.js server-only features (server actions, route handlers, dynamic SSR).
- API integration (Parts 6/7) is done: the board is fetched from the backend and all mutations persist via `lib/api.ts`. `moveCard` and the reducer logic stay client-side; persistence is API calls.
- AI chat (Part 10) adds a sidebar widget; when the AI returns a board update, the UI must refresh to reflect it.
