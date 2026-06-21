# Frontend

Next.js (App Router) single-board Kanban UI, built as a static export (`output: "export"`) and served by FastAPI. Auth (session cookies) gates the board; board data is still in-memory seed data until Parts 6/7 wire it to the backend. An AI chat sidebar arrives in Part 10.

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
    api.ts            Backend API client (login, logout, me); fetch with credentials
    kanban.ts         Types (Card, Column, BoardData), initialData seed, moveCard, createId
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

- `columns` keeps ordering; `cards` is a lookup keyed by id; column membership/order lives in `cardIds`.
- `initialData` is the hardcoded seed (5 columns, 8 cards) used as the demo's starting state.
- `moveCard(columns, activeId, overId)` is a pure reducer for drag-and-drop (same-column reorder and cross-column move). Keep it pure and well-tested.
- `createId(prefix)` generates client-side ids.

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

- `KanbanBoard` is a client component (`"use client"`) and holds all board state via `useState`. State is in-memory only today (resets on refresh). It accepts optional `user`/`onLogout` props; when absent (e.g. unit tests) it renders without the logout control.
- Mutations are immutable updates; column reordering goes through `moveCard`.
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
npm run test:e2e   # playwright (starts dev server on 127.0.0.1:3000)
npm run test:all   # unit then e2e
```

## Notes for later parts

- Keep everything client-rendered: the app is built with `output: "export"`. Avoid Next.js server-only features (server actions, route handlers, dynamic SSR).
- API integration (Parts 6/7) replaces the in-memory `initialData` with data fetched from the backend; `moveCard` and the reducer logic stay, but persistence becomes API calls in `lib/api.ts`.
- AI chat (Part 10) adds a sidebar widget; when the AI returns a board update, the UI must refresh to reflect it.
