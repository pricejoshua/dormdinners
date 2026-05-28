# Supabase — Database setup

## Local development

Prerequisites: [Supabase CLI](https://supabase.com/docs/guides/cli) installed.

```bash
# Start a local Supabase stack (Docker required)
supabase start

# Apply all migrations to the local database
supabase db push

# (Optional) Load sample pantry data
supabase db seed
```

After `supabase start`, the local Studio UI is at `http://localhost:54323`.

## Hosted project (production)

1. Create a project at [supabase.com](https://supabase.com).
2. Copy the project URL and anon key into `.env.local`:
   ```
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_ANON_KEY=<anon-key>
   ```
3. Push the migration:
   ```bash
   supabase db push --linked
   ```
   Or paste `supabase/migrations/0001_init.sql` directly into the Supabase
   SQL editor in the dashboard.

## RLS note

Row Level Security is enabled on every table. All policies are permissive
(`USING (true) WITH CHECK (true)`) because this app has no authentication.
If auth is added in the future, replace these policies with user-scoped ones.

## Files

| File | Purpose |
|---|---|
| `migrations/0001_init.sql` | Full schema: all tables, indexes, RLS policies |
| `seed.sql` | Sample pantry items for a non-empty first run |
