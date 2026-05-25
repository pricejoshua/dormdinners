# refresh-flipp — Supabase Edge Function

Fetches weekly Flipp price data for the curated ingredient list and upserts
results into the `flipp_cache` table.  Invoked by the Vercel cron route
`/api/cron/refresh-flipp` every Sunday at 8 pm PT (Monday 04:00 UTC).

## Deploy

```bash
# Log in and link the project first if you haven't already:
supabase login
supabase link --project-ref <your-project-ref>

# Deploy the function:
supabase functions deploy refresh-flipp
```

## Environment variables

Set the following secrets on the function so it can connect to Supabase and
call the Flipp API with the correct postal code.

```bash
supabase secrets set \
  SUPABASE_URL=https://<project-ref>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  NEXT_PUBLIC_POSTAL_CODE=V3A4S8
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically injected by
Supabase in most environments, but setting them explicitly is safer for
Edge Functions that run outside the standard Supabase runtime.

## Manual invocation (testing)

```bash
curl -X POST \
  "https://<project-ref>.supabase.co/functions/v1/refresh-flipp" \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{"ingredients":["chicken thighs","eggs","rice"]}'
```

## Notes

- Uses the `items` array from the Flipp response (flyer deals only, not `ecom_items`).
- Processes up to 5 ingredients in parallel; a single failing query does not
  abort the whole batch.
- Old rows for the same `ingredient_query` are marked stale (`valid_to = now()`)
  before new rows are inserted.
- New rows are valid for 7 days from the time of insertion.
- Non-200 responses, HTML error pages, and empty `items` arrays are logged and
  skipped gracefully.
