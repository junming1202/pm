# Database design

SQLite, normalized tables. The file is created automatically on first run if it
does not exist, and a default board is seeded for a new user. This document is
the proposed schema for Part 6 implementation; it requires sign-off first.

## Goals

- Multiple users supported by the schema; the MVP only uses one (`user`).
- One board per user for the MVP (enforced with a unique constraint).
- Fixed columns that can be renamed; cards can be created, edited, moved, and
  deleted, with stable ordering within and across columns.
- Map cleanly to the frontend model (`columns: Column[]`, `cards` keyed by id).

## Tables

### users

| column        | type     | constraints                          |
| ------------- | -------- | ------------------------------------ |
| id            | INTEGER  | PRIMARY KEY AUTOINCREMENT            |
| username      | TEXT     | NOT NULL, UNIQUE                     |
| created_at    | TEXT     | NOT NULL, default current timestamp  |

Notes: passwords are not stored for the MVP (login is hardcoded). A
`password_hash` column can be added later without touching other tables.

### boards

| column     | type    | constraints                                         |
| ---------- | ------- | --------------------------------------------------- |
| id         | INTEGER | PRIMARY KEY AUTOINCREMENT                            |
| user_id    | INTEGER | NOT NULL, UNIQUE, FK -> users(id) ON DELETE CASCADE  |
| name       | TEXT    | NOT NULL                                             |
| created_at | TEXT    | NOT NULL, default current timestamp                 |

Notes: `user_id` is UNIQUE, which enforces one board per user for the MVP.

### columns

| column    | type    | constraints                                          |
| --------- | ------- | ---------------------------------------------------- |
| id        | INTEGER | PRIMARY KEY AUTOINCREMENT                             |
| board_id  | INTEGER | NOT NULL, FK -> boards(id) ON DELETE CASCADE          |
| title     | TEXT    | NOT NULL                                              |
| position  | INTEGER | NOT NULL                                              |

Constraints: UNIQUE(board_id, position) keeps ordering unambiguous within a
board. The five default columns are seeded at positions 0..4.

### cards

| column    | type    | constraints                                          |
| --------- | ------- | ---------------------------------------------------- |
| id        | INTEGER | PRIMARY KEY AUTOINCREMENT                             |
| column_id | INTEGER | NOT NULL, FK -> columns(id) ON DELETE CASCADE         |
| title     | TEXT    | NOT NULL                                              |
| details   | TEXT    | NOT NULL, default ''                                  |
| position  | INTEGER | NOT NULL                                             |

Constraints: UNIQUE(column_id, position) keeps ordering unambiguous within a
column.

## Relationships

```
users (1) ---- (1) boards (1) ---- (N) columns (1) ---- (N) cards
```

- A user has exactly one board (MVP); a board has many columns; a column has
  many cards. All children cascade-delete with their parent.

## Ordering strategy

- Order is an explicit integer `position` per sibling set (columns within a
  board, cards within a column), kept contiguous and 0-based.
- Move/insert/delete renumber the affected sibling set so positions stay
  contiguous (0..n-1). With at most 5 columns and a small number of cards,
  renumbering on write is simple and cheap; no gap/fractional scheme is needed.
- Cross-column move: remove from the source column (renumber source), insert at
  the target index in the destination column (renumber destination).
- `ORDER BY position` always yields the intended order.

## Create-if-not-exists and seeding

- On startup (or first DB access), create the SQLite file if absent and run
  `CREATE TABLE IF NOT EXISTS` for all four tables. Enable
  `PRAGMA foreign_keys = ON` per connection.
- On first login / first board fetch for a user with no board, seed:
  - one `users` row (if missing) for the username,
  - one `boards` row for that user, named "My Board",
  - the five default columns (Backlog, Discovery, In Progress, Review, Done) at
    positions 0..4,
  - no cards (columns start empty).
- The DB file lives outside the image and is gitignored (`*.db`).

## Mapping to the frontend model

- `Column` <- `columns` row (`id`, `title`), ordered by `position`; `cardIds`
  derived from its `cards` ordered by `position`.
- `cards` lookup <- `cards` rows (`id`, `title`, `details`).
- Ids are integer PKs in the DB; the API serializes them as strings to match the
  existing frontend `string` id types.

## Out of scope for the MVP

- Auth/password storage (login is hardcoded; column can be added later).
- Multiple boards per user, labels, due dates, assignees, comments.
- Soft deletes / audit history.
