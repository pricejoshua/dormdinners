# Task 01 — Project scaffold

**Phase:** 1 (Foundations)
**Depends on:** nothing
**Blocks:** every other task

## Goal

Stand up a Next.js (App Router) project with the Supabase client wired in, env
vars declared, and a base layout that the feature pages can plug into.

## Deliverables

1. `package.json` with Next.js 14+ (App Router), React 18+, TypeScript,
   `@supabase/supabase-js`, `tailwindcss`, and the LLM stack:
   `ai`, `@ai-sdk/anthropic`, `@ai-sdk/groq`, `@ai-sdk/openai`,
   plus `zod` (used by AI SDK for structured outputs).
2. `tsconfig.json`, `next.config.js`, `tailwind.config.js`, `postcss.config.js`,
   `app/globals.css`.
3. `.env.example` with every variable the design doc lists:
   ```
   NEXT_PUBLIC_POSTAL_CODE=V3A4S8
   SUPABASE_URL=
   SUPABASE_ANON_KEY=

   # LLM provider — pick one of: anthropic (default) | groq | openrouter
   LLM_PROVIDER=anthropic
   LLM_MODEL=
   ANTHROPIC_API_KEY=
   GROQ_API_KEY=
   OPENROUTER_API_KEY=

   CRON_SECRET=
   ```
   `CRON_SECRET` is added so Task 06 can authenticate Vercel cron calls.
   Only the API key for the active `LLM_PROVIDER` needs to be filled in.
4. `lib/supabase/client.ts` (browser, anon key) and `lib/supabase/server.ts`
   (server, anon key — RLS is permissive). Export typed clients.
5. `app/layout.tsx` with a top nav linking to three routes: `/` (This Week),
   `/pantry`, `/shopping-list`. Mobile-first; nav collapses sensibly on narrow
   widths.
6. `app/page.tsx` placeholder for the weekly plan (Task 05 will fill it in).
7. `app/pantry/page.tsx` and `app/shopping-list/page.tsx` placeholders.
8. `README.md` (replace the existing stub) with: install, env setup, dev,
   deploy notes.

## Acceptance criteria

- `npm install && npm run dev` boots without errors.
- `npm run build` succeeds.
- All three routes render their placeholder.
- TypeScript strict mode is on.
- No feature logic — just the shell.

## Notes / constraints

- Use the App Router (`app/`), not the pages router.
- Tailwind for styling. Keep utility-class heavy; no component library.
- Do not commit a real `.env.local`.
