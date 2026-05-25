# Task 05 — Weekly plan + recipe URL extraction

**Phase:** 2 (Features)
**Depends on:** 01 (scaffold), 02 (schema), 03 (LLM client)
**Blocks:** 07 (optimization needs meals), 08 (shopping list needs meals)

## Goal

The main `/` page: set headcount, fill 5 meal slots, edit ingredients per
meal. Recipe input supports either pasting a URL (best-effort LLM extraction)
or manual entry.

## Deliverables

1. `app/page.tsx` (server component):
   - Loads or creates the "current week" `meals` row set. "Current week" means
     `week_of = Monday of this week` in the server's timezone. If fewer than 5
     rows exist for the current week, top up to 5 blank meal rows.
   - Loads `meal_ingredients` for each meal.
   - Renders the headcount editor + 5 meal slots.
2. `app/WeeklyPlan.tsx` (client component):
   - Headcount input (integer, min 1). Saves on blur to all 5 meals (denormalized).
   - 5 collapsible meal slots. Collapsed: title only. Expanded: title edit +
     ingredient list (name + quantity rows, add/remove row buttons) + a
     "Paste recipe URL" affordance.
3. Recipe URL flow:
   - User clicks "Paste recipe URL", enters a URL.
   - `POST /api/meals/[id]/extract-from-url` fetches the page server-side,
     passes HTML to `extractRecipe` from Task 03, replaces (or appends —
     prompt the user) the meal's ingredient list with the result.
   - On failure: show a clear inline error, leave existing ingredients
     untouched, and tell the user to add manually.
4. API routes:
   - `PATCH /api/meals/[id]` — update title, headcount.
   - `POST /api/meals/[id]/ingredients` — add ingredient row.
   - `PATCH /api/meal-ingredients/[id]` — update name / quantity.
   - `DELETE /api/meal-ingredients/[id]` — remove ingredient row.
   - `POST /api/meals/[id]/extract-from-url` — URL → ingredient list.

## Acceptance criteria

- On a fresh DB, visiting `/` lands you in 5 empty meal slots for the current
  week.
- Headcount edits persist across reloads.
- Adding/removing/editing ingredients persists.
- A real recipe URL (e.g. `seriouseats.com/...`) returns a usable ingredient
  list within ~10s.
- A garbage URL surfaces a non-fatal error.

## Notes / constraints

- Use `fetch(url, { headers: { 'User-Agent': '...' } })` server-side for the
  page fetch. Cap response size (e.g. 1MB) and strip `<script>`/`<style>` tags
  before handing HTML to the LLM to keep tokens down.
- Compact list UI, not cards (per design doc).
- No drag-and-drop reorder. Slots are positional and fixed at 5.
