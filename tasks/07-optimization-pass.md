# Task 07 — Optimization pass

**Phase:** 3 (Cross-cutting)
**Depends on:** 03 (LLM client), 04 (pantry data), 05 (meals data), 06 (flipp cache)
**Blocks:** 08 (shopping list consumes accepted suggestions)

## Goal

A prominent "Optimize" button on the weekly plan that runs the single LLM
optimization call and renders dismissible suggestion rows. Accepted
suggestions influence the shopping list (Task 08).

## Deliverables

1. `app/page.tsx` (extend, do not replace Task 05's work):
   - Add a full-width "Optimize" CTA button below the 5 meal slots. Disabled
     until all 5 meals have a title and at least one ingredient.
   - Below the button: a list of pending/accepted/dismissed suggestions for
     the current week.
2. `app/api/optimize/route.ts`:
   - Loads current week's meals + ingredients, non-deleted pantry, current
     `flipp_cache` rows (where `valid_to >= now()`), headcount.
   - Calls `optimize(...)` from `lib/llm/optimize.ts`.
   - Inserts each returned suggestion into `optimization_suggestions` with
     `status = 'pending'` and `meal_ids` populated from `meal_indices`.
   - Returns the inserted suggestions.
3. `app/Suggestions.tsx` (client component):
   - One compact row per suggestion. Columns: type pill, description,
     estimated saving, Accept / Dismiss buttons.
   - Accepted and dismissed suggestions stay visible but greyed-out (no
     archiving — the design doc explicitly excludes archiving).
4. `app/api/suggestions/[id]/route.ts` — `PATCH` with `{ status: 'accepted' | 'dismissed' }`.

## Acceptance criteria

- "Optimize" disabled when meals are incomplete; enabled when all 5 have a
  title + ingredients.
- Clicking it shows a loading state and then renders the suggestion list.
- Accept / Dismiss persist across reloads.
- Re-running optimize creates a fresh batch; prior suggestions for the week
  remain visible (do not delete them — let the user keep history within the
  week).
- If `flipp_cache` is empty, optimize still runs (pass `flipp: []`).

## Notes / constraints

- One LLM call per click. Do not loop.
- Show the raw LLM output's `description` verbatim. Do not paraphrase.
- Suggestion list is not styled as cards — tight rows, per the design doc.
- If the LLM returns malformed JSON, surface a single-line error and let the
  user click Optimize again.
