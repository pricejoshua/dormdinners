# Task 06 — Flipp price cache + weekly cron

**Phase:** 2 (Features)
**Depends on:** 01 (scaffold), 02 (schema)
**Blocks:** 07, 08 (both read `flipp_cache`)

## Goal

Populate `flipp_cache` weekly with the ~50 curated ingredient queries. Use
Vercel cron to trigger a Next.js API route, which in turn invokes a Supabase
Edge Function (because the work exceeds Vercel's 10s free-tier limit).

## Deliverables

1. `config/curated-ingredients.ts` — exported `CURATED_INGREDIENTS: string[]`
   with the list from the design doc. Easy to edit.
2. `vercel.json` — cron config:
   ```json
   {
     "crons": [
       { "path": "/api/cron/refresh-flipp", "schedule": "0 4 * * 1" }
     ]
   }
   ```
   (Sunday 8pm PT == Monday 04:00 UTC.)
3. `app/api/cron/refresh-flipp/route.ts`:
   - Verifies `Authorization: Bearer ${process.env.CRON_SECRET}`.
   - Invokes the Supabase Edge Function `refresh-flipp` with the curated list.
   - Returns 202 immediately; does not wait for the function to finish.
4. `supabase/functions/refresh-flipp/index.ts`:
   - Receives the curated list.
   - For each ingredient: `GET https://backflipp.wishabi.com/flipp/items/search?q=<ingredient>&postal_code=<env>`.
   - Parses the `items` array (not `ecom_items`).
   - Upserts into `flipp_cache` with `valid_from = now()`, `valid_to = now() + 7 days`, `fetched_at = now()`.
   - Marks any prior rows for the same `ingredient_query` as stale by setting their `valid_to` to `now()` if not already past.
   - Concurrency: process 5 ingredients in parallel, log failures, do not abort the whole job on one bad request.
5. `lib/flipp.ts` (shared) — typed shape of a Flipp item, plus a `getCached(name: string): Promise<FlippItem[]>` helper that ranks by freshness.
6. `supabase/functions/refresh-flipp/README.md` — how to deploy
   (`supabase functions deploy refresh-flipp`) and how to set the function's
   env vars (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_POSTAL_CODE`).

## Acceptance criteria

- Hitting `/api/cron/refresh-flipp` with the secret triggers the edge function.
- After a successful run, `flipp_cache` contains rows for the curated list.
- A single failing query does not poison the whole batch.
- Re-running does not pile up duplicate active rows for the same query.

## Notes / constraints

- Flipp is unofficial — handle non-200, HTML responses, and empty `items`
  gracefully. Log and continue.
- Postal code comes from `NEXT_PUBLIC_POSTAL_CODE` env var (yes, it has the
  `NEXT_PUBLIC_` prefix per the design doc; the edge function reads its own
  env var of the same name).
- No retries beyond one. The job runs weekly; transient flake is acceptable.
