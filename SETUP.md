# Setup

Step-by-step checklist for getting Dorm Dinners running locally and on Vercel.

## Prerequisites

- **Node.js 18+** and npm
- A **Supabase** account (free tier is enough) — https://supabase.com
- An **API key** for one LLM provider:
  - Anthropic (default) — https://console.anthropic.com
  - Groq — https://console.groq.com
  - OpenRouter — https://openrouter.ai
- The **Supabase CLI** for migrations and the edge function — https://supabase.com/docs/guides/local-development/cli/getting-started

## One-time local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

Sign in at supabase.com → **New project**. Pick a region close to you. Once it's provisioned:

- **Settings → API** — copy `Project URL` and the `anon` `public` key.

### 3. Apply the database schema

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

`<your-project-ref>` is the slug in your project URL (e.g. `abcd1234` from `https://abcd1234.supabase.co`).

Optional sample data:

```bash
# Run supabase/seed.sql via the SQL editor in the Supabase dashboard,
# or via psql:
psql "$DATABASE_URL" -f supabase/seed.sql
```

### 4. Generate a cron secret

```bash
# Any random string works. Example:
openssl rand -hex 32
```

Save the output — you'll use it as `CRON_SECRET` in `.env.local` and in Vercel.

### 5. Create `.env.local`

```bash
cp .env.example .env.local
```

Fill in:

| Variable | What goes here |
|---|---|
| `NEXT_PUBLIC_POSTAL_CODE` | Already defaults to `V3A4S8`. Change if needed. |
| `SUPABASE_URL` | From step 2 |
| `SUPABASE_ANON_KEY` | From step 2 |
| `LLM_PROVIDER` | `anthropic` (default), `groq`, or `openrouter` |
| `LLM_MODEL` | Leave empty for the per-provider default, or pin a specific model |
| `ANTHROPIC_API_KEY` | Required if `LLM_PROVIDER=anthropic` |
| `GROQ_API_KEY` | Required if `LLM_PROVIDER=groq` |
| `OPENROUTER_API_KEY` | Required if `LLM_PROVIDER=openrouter` |
| `CRON_SECRET` | From step 4 |

You only need the API key for the active provider.

### 6. Smoke-test it

```bash
npm run dev
```

Open http://localhost:3000:
- Visit `/pantry`, add an item, refresh — it should persist.
- Visit `/`, set headcount, add a meal title and an ingredient.

If pages render but data fails to save, double-check the Supabase keys.

## Deploy to Vercel

### 7. Push to GitHub and link in Vercel

Create a Vercel project pointing at the repo. Framework preset: Next.js (auto-detected).

### 8. Set environment variables in Vercel

**Settings → Environment Variables** — add every variable from `.env.local`. Don't forget `CRON_SECRET`.

The weekly Flipp cron job runs automatically once `vercel.json` is committed and the project is deployed — schedule is **Monday 04:00 UTC** (= Sunday 8pm PT).

### 9. Deploy the Supabase edge function

The cron route delegates the heavy Flipp scraping to a Supabase edge function so it doesn't hit Vercel's 10-second free-tier limit.

```bash
supabase functions deploy refresh-flipp
```

Then set the edge function's secrets in the Supabase dashboard: **Edge Functions → refresh-flipp → Secrets**:

| Secret | Value |
|---|---|
| `SUPABASE_ANON_KEY` | Same value as the env var |
| `NEXT_PUBLIC_POSTAL_CODE` | Same value as the env var |

See `supabase/functions/refresh-flipp/README.md` for more.

## Useful commands

```bash
npm run dev          # dev server
npm run build        # production build
npm start            # production server (after build)
npm test             # vitest suite
npx tsc --noEmit     # type check
```

## Troubleshooting

- **`createClient` errors at build time** — `.env.local` is missing or `SUPABASE_URL` is blank. The clients fall back to a placeholder URL so the build doesn't crash, but real requests will fail with `fetch failed` until you fill in the env vars.
- **Pages load slowly in dev** — without real Supabase credentials, server components wait for the placeholder URL fetch to time out (~7s). Fill in the env vars to fix.
- **LLM call returns an error about missing API key** — verify `LLM_PROVIDER` matches whichever API key you filled in.
- **Cron endpoint returns 401** — check the Vercel `CRON_SECRET` matches the one Vercel uses when invoking the cron route. Vercel automatically injects an `Authorization: Bearer <secret>` header on cron triggers.
