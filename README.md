# Dorm Dinners

Shared meal-planning web app for university cooking groups. Plan 5 meals, track pantry inventory, and generate an optimized shopping list with weekly flyer deals.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Supabase** (PostgreSQL)
- **Tailwind CSS**
- **Anthropic Claude Haiku** (recipe extraction + optimization)
- **Vercel** (hosting + cron)

## Install

```bash
npm install
```

## Environment setup

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_POSTAL_CODE` | Postal code for Flipp price lookups (default `V3A4S8`) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude Haiku |
| `CRON_SECRET` | Secret token for authenticating Vercel cron requests |

## Dev server

```bash
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
npm start
```

## Deploy

Push to a Vercel-linked GitHub repo. Set all env vars in the Vercel dashboard under **Settings → Environment Variables**.

The weekly Flipp price cron job runs every Sunday at 8pm PT via Vercel Cron. Add the following to `vercel.json` after the cron route is implemented:

```json
{
  "crons": [
    {
      "path": "/api/cron/fetch-flipp",
      "schedule": "0 3 * * 1"
    }
  ]
}
```

(UTC Monday 03:00 = Sunday 20:00 PT.)

## Database

Run the SQL migrations in `supabase/migrations/` against your Supabase project to create all tables. See `tasks/02-database-schema.md` for details.
