# Dorm Dinners

Shared meal-planning web app for university cooking groups. Plan 5 meals per week, track pantry inventory, and generate an optimized shopping list with weekly flyer deals — all without accounts.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Supabase** (PostgreSQL + edge functions)
- **Tailwind CSS**
- **Vercel AI SDK** with pluggable provider — Anthropic / Groq / OpenRouter, swap with one env var
- **Vercel** (hosting + weekly cron)
- **Flipp** (unofficial flyer API)

## Setup

Full step-by-step in [SETUP.md](./SETUP.md). Short version:

```bash
npm install
cp .env.example .env.local   # then fill in Supabase + LLM API keys
npm run dev
```

You also need to run the SQL migration in `supabase/migrations/` against your Supabase project — see SETUP.md step 3.

## Useful commands

```bash
npm run dev          # dev server at http://localhost:3000
npm run build        # production build
npm start            # production server
npm test             # vitest suite
npx tsc --noEmit     # type check
```

## Architecture

- `app/` — Next.js App Router pages and API routes
- `lib/llm/` — provider-agnostic LLM helpers (see `lib/llm/provider.ts` for the backend selector)
- `lib/supabase/` — server + browser Supabase clients
- `lib/flipp.ts` and `lib/shopping-list/` — Flipp price cache helper, shopping-list generator
- `supabase/migrations/` — database schema
- `supabase/functions/refresh-flipp/` — weekly Flipp-scraping edge function
- `config/curated-ingredients.ts` — the ~30 ingredients the cron job tracks
- `types/database.ts` — typed Row/Insert/Update for every table

## Design doc

`cooking-group-app-design.md` is the source of truth for the data model, LLM prompts, and product decisions.
