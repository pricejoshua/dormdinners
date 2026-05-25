# Task 04 — Pantry feature

**Phase:** 2 (Features)
**Depends on:** 01 (scaffold), 02 (schema)
**Blocks:** 07, 08 (optimization + shopping list both consume pantry state)

## Goal

A shared, inline-editable pantry table at `/pantry`. Anyone can add, edit, or
remove items. Removals are soft deletes.

## Deliverables

1. `app/pantry/page.tsx` (server component) that fetches non-deleted pantry
   items and renders the client table.
2. `app/pantry/PantryTable.tsx` (client component):
   - Columns: name, notes, updated_by, updated_at.
   - Inline editing on focus; debounced save on blur.
   - "Add row" button at the bottom appends a blank row.
   - Per-row delete button (sets `deleted_at = now()`).
   - Optimistic UI; on failure, revert and surface a small inline error.
3. API routes:
   - `POST /api/pantry` — create
   - `PATCH /api/pantry/[id]` — update (name, notes, updated_by)
   - `DELETE /api/pantry/[id]` — soft delete (sets `deleted_at`)
   - `GET /api/pantry` — list non-deleted, ordered by `updated_at desc`
   Each route uses the server-side Supabase client and returns JSON.
4. `updated_by` is a free text input prompted once per session (store in
   localStorage so the user doesn't retype on every edit). Show the active name
   in the page header with an "edit" link.

## Acceptance criteria

- Loading `/pantry` shows the current items.
- Adding, editing, and deleting work without a page reload.
- Deleted items disappear from the UI but remain in the DB with
  `deleted_at` set.
- Two browser tabs editing the same row don't crash anything (last write wins
  is fine — call this out in a comment).

## Notes / constraints

- Spreadsheet feel: tight rows, monospace optional for the notes column, no
  cards.
- Mobile: horizontal scroll if the table overflows; do not stack into cards.
- No realtime subscriptions for now — keep it polled or manual refresh.
