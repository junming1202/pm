# Authentication

The MVP uses a single hardcoded account and a signed session cookie. The data
model (Part 5+) supports multiple users; only the login check is hardcoded.

## Flow

1. The frontend (`AuthGate`) calls `GET /api/me` on load.
   - 200 -> show the board.
   - 401 -> show the login screen.
2. `POST /api/login` with `{username, password}`. If valid (`user`/`password`),
   the backend sets an httponly cookie `pm_session` and returns `{username}`.
3. The cookie is sent automatically on every request, so a page refresh stays
   logged in (`AuthGate` re-checks `/api/me`).
4. `POST /api/logout` clears the cookie; the UI returns to the login screen.

## Cookie

- Name: `pm_session`.
- Value: the username, signed with `itsdangerous` (`URLSafeSerializer`). Tamper
  or forgery is rejected (signature check fails -> 401).
- Flags: `httponly`, `samesite=lax`, `path=/`.
- Signing secret: `SESSION_SECRET` from `.env`. A fixed dev default is used if
  unset so local runs work; set a real value for any non-local deployment.

## Protecting routes

Backend routes depend on `current_user` (in `app/auth.py`), which reads and
validates the cookie and raises 401 if missing or invalid. `GET /api/board` is
protected this way today; future board endpoints (Part 6) do the same.

## Tests

- Backend (`backend/tests/test_auth.py`): valid/invalid login, `me` 401/200,
  logout invalidates, board requires session, forged cookie rejected.
- Frontend (`frontend/src/components/AuthGate.test.tsx`): login screen when
  anonymous, board after login, error on bad login, stays logged in on refresh,
  logout returns to login.
