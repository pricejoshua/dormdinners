# Task 02 — Database schema

**Phase:** 1 (Foundations)
**Depends on:** nothing (can run in parallel with 01)
**Blocks:** 04, 05, 06, 07, 08

## Goal

Create Supabase SQL migrations matching the data model in the design doc, plus
typed TypeScript definitions the rest of the app can import.

## Deliverables

1. `supabase/migrations/0001_init.sql` containing every table from the design
   doc:
   - `pantry_items`
   - `meals`
   - `meal_ingredients`
   - `flipp_cache`
   - `optimization_suggestions`
   - `shopping_list_items`
   Use the exact column names and types from the doc. Use `gen_random_uuid()`
   defaults for `id` and `now()` defaults for `created_at` / `updated_at`.
2. Indexes:
   - `pantry_items(deleted_at)` partial index where `deleted_at IS NULL`.
   - `meals(week_of)`.
   - `meal_ingredients(meal_id)`.
   - `flipp_cache(ingredient_query)` and `(valid_to)`.
   - `shopping_list_items(week_of)`.
3. RLS: enable RLS on every table, then add a permissive `using (true) with check (true)` policy for both `anon` and `authenticated` — no auth in this app, so policies must let all reads/writes through. Document this trade-off in a comment at the top of the migration.
4. `types/database.ts` — hand-written TypeScript types mirroring each table
   (camelCase or snake_case — pick one and document it; recommend snake_case to
   match Supabase output). Re-export a `Database` interface for typing the
   Supabase client.
5. `supabase/seed.sql` (optional but encouraged): a few sample pantry items so
   the UI isn't empty on first run.
6. A short `supabase/README.md` explaining how to run migrations locally (`supabase db push`) and on the hosted project.

## Acceptance criteria

- Migration applies cleanly to a fresh Supabase project.
- `types/database.ts` compiles under strict TS.
- Every table from the design doc exists with every column from the doc.

## Notes / constraints

- Soft deletes only — never add `ON DELETE CASCADE` to anything except joins
  where the parent row is truly meaningless without children (e.g.
  `meal_ingredients.meal_id` can cascade).
- `flipp_cache.current_price` is `numeric`, not `float`.
- Keep `quantity` as `text` (freeform per the design doc).
