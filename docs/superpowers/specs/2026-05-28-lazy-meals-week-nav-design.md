# Lazy meal creation + per-week navigation

**Date:** 2026-05-28
**Status:** Approved design, pending implementation plan

## Problem

The `meals` table accumulates duplicate and blank rows. Root cause: `app/page.tsx`
calls `getOrCreateWeekMeals()` on every render. The page is `force-dynamic`, so
each load:

1. Counts meals for the current week.
2. If fewer than 5 exist, **inserts blank rows** (`title: ''`) to top up to 5.

This produces two symptoms from one cause — eager row creation on read:

- **Incomplete data by design** — blank-title rows are written before the user
  types anything.
- **Duplicates from a race** — there is no unique constraint on `meals`. Two
  near-simultaneous loads (two tabs, prefetch + navigation, React dev
  double-render, fast refresh) both observe "fewer than 5" and both insert,
  yielding 7/9/12+ rows for one week.

## Goals

1. Stop creating meal rows on page load. A meal row exists only after a
   deliberate user action.
2. Keep the current inline auto-save UX — no new Save button.
3. View and edit **any** week (past or future), not just the current one.
4. Clean up the junk already in the table.

## Non-goals

- No authentication or per-user scoping (unchanged from current app).
- The shopping list stays **current-week-only** for now (separate page,
  revisit later). Only meals and Optimize become per-week.
- No bulk "save the whole week" button. Saving stays per-field/auto.

## Design

### 1. Read no longer writes

`getOrCreateWeekMeals()` becomes `getWeekMeals(weekOf)` — it **only fetches**
the meals (and their ingredients) for the given week, returning 0–5 rows. It
never inserts. The "always show 5 slots" guarantee moves to the client.

### 2. Client-side draft slots

`WeekView` (new client component) renders exactly 5 slots. It pads the fetched
real meals with **draft slots**. A draft slot lives only in the browser and
writes nothing to the DB until acted upon.

Each slot carries a **stable client key** (generated once via
`crypto.randomUUID()`) used as its React `key`. The DB `id` is separate state,
`null` until the row is created. This keeps the component from remounting (and
losing input focus) at the moment a draft becomes real.

### 3. New endpoint: `POST /api/meals`

Creates exactly one meal for a given week and returns the row.

- Request body: `{ title: string, week_of: string, headcount: number | null }`.
- Validates `week_of` is a valid `YYYY-MM-DD` Monday.
- Returns the inserted `MealRow`.

This is the single place a meal comes into existence — always triggered by user
action, never by a page load. That removes the read-triggered race entirely.

### 4. Lazy first write (auto-save preserved)

Each slot exposes an `ensureMealId()` helper that all persistence actions route
through:

- Slot already has an `id` → return it (today's behavior).
- Slot is a draft → `POST /api/meals` with the current title + headcount, adopt
  the returned `id`, then continue.

Actions that trigger creation:

- Committing a **non-empty title** (blur / Enter). Because `POST /api/meals`
  takes the title, this is a single call — no follow-up PATCH needed.
- Clicking **+ Add ingredient** or **Paste recipe URL** on a draft
  (auto-creates with an empty title, then attaches the ingredient).

Slots that are never touched — or where the title is typed then cleared back to
empty — write nothing. After the first write, the slot behaves exactly like
today's inline auto-save (PATCH title, POST/PATCH/DELETE ingredients).

### 5. Per-week navigation

- `app/page.tsx` reads `?week=YYYY-MM-DD` from search params, defaulting to
  `currentMondayISO()`. It validates the value is a Monday (else redirect to the
  current week), fetches that week's meals/ingredients/suggestions, and renders
  `WeekView` with a `weekOf` prop.
- `WeekView` renders a `‹ Prev | Week of <date> | Next ›` header. Prev/Next
  `router.push('/?week=<adjacent Monday>')`. Each week is a real, bookmarkable,
  refresh-safe URL.
- The page stays `force-dynamic`; navigation re-fetches server-side per week.

### 6. State lifting for Optimize

Today `page.tsx` passes the meal list to `WeeklyPlan` and `Suggestions`
independently. With drafts living in the browser, the Optimize button's
"all 5 complete" gate must read **live** client state. `WeekView` owns the 5
slots and renders both `WeeklyPlan` and `Suggestions`, passing live slot
summaries down. `mealsComplete` keeps its rule: 5 meals, each with a non-empty
title and ≥1 ingredient.

### 7. Per-week Optimize

`POST /api/optimize` accepts `{ weekOf }` in its body instead of hardcoding
`currentMondayISO()`. The Optimize button (in `Suggestions`, inside `WeekView`)
sends the viewed week. Suggestions are still stored with `meal_ids`; the
existing per-week filtering in `page.tsx` is unchanged.

### 8. Headcount with drafts

The headcount control PATCHes meals that already exist and holds the chosen
value in `WeekView` state. Slots created later pass that value into
`POST /api/meals`. No blank row is needed merely to store a headcount.

### 9. Clean up existing data

Out of scope for implementation — the user will delete the existing junk rows
manually. For reference, the rows that are junk under the new model are meals
with a blank/whitespace title **and** zero ingredients:

```sql
-- Reference only (user runs manually): blank meals with no ingredients
SELECT m.* FROM meals m
WHERE btrim(coalesce(m.title, '')) = ''
  AND NOT EXISTS (
    SELECT 1 FROM meal_ingredients mi WHERE mi.meal_id = m.id
  );
```

## Components touched

| File | Change |
|------|--------|
| `app/page.tsx` | Read `?week=`; fetch-only via `getWeekMeals`; render `WeekView`. |
| `app/WeekView.tsx` | **New.** Owns 5 slots + headcount + week nav; renders `WeeklyPlan` + `Suggestions`. |
| `app/WeeklyPlan.tsx` | Slots support draft state + `ensureMealId`; receive slot state from `WeekView`. |
| `app/Suggestions.tsx` | Receive live slot state + `weekOf`; POST week to Optimize. |
| `app/api/meals/route.ts` | **New.** `POST` creates one meal for a week. |
| `app/api/optimize/route.ts` | Accept `{ weekOf }` in body. |
| `app/_lib/weekOf.ts` | Add helpers: validate a Monday, step ±1 week. |

## Known limitations

- The shopping-list generator pulls accepted suggestions by `status` across all
  weeks, not scoped to a week. Pre-existing; out of scope here, noted for the
  future shopping-list-per-week task.
- No DB-level uniqueness on `meals`; the design prevents duplicates by removing
  read-triggered creation rather than by constraint (there is no natural unique
  key for 5 independent slots).

## Testing

- `app/_lib/weekOf` helpers: unit tests for Monday validation and ±1 week
  stepping across month/year boundaries.
- `POST /api/meals`: rejects a non-Monday `week_of`; returns the created row.
- Lazy-write: a slot left untouched issues no network calls; typing a title
  issues exactly one `POST /api/meals`; subsequent edits PATCH the same id.
- Manual: load a fresh week → 0 rows written; fill one meal → 1 row; refresh →
  no extra rows; navigate prev/next → correct week loads and is editable.
