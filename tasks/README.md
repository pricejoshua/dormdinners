# Cooking Group App — Task Plan

Tasks for parallel execution by subagents. Each file in this directory is one
self-contained unit of work. Read the source design doc at
`../cooking-group-app-design.md` before starting any task.

## Phases & dependencies

Tasks within a phase can run in parallel. A later phase must wait for the
phases it depends on.

### Phase 1 — Foundations (no dependencies)
- `01-project-scaffold.md` — Next.js App Router, env, Supabase client, base layout
- `02-database-schema.md` — Supabase SQL migrations for all tables
- `03-llm-client.md` — Anthropic Claude Haiku helper module

### Phase 2 — Features (depends on Phase 1)
- `04-pantry.md` — Shared pantry CRUD + table UI
- `05-weekly-plan.md` — 5 meal slots, ingredient editing, recipe URL extraction
- `06-flipp-cron.md` — Weekly Flipp price fetch via Vercel cron + Supabase Edge Function

### Phase 3 — Cross-cutting features (depends on Phase 2)
- `07-optimization-pass.md` — LLM optimization call + accept/dismiss UI
- `08-shopping-list.md` — Auto-generated shopping list grouped by store

### Phase 4 — Polish
- `09-ui-polish.md` — Mobile-first density pass and small fixes

## Conventions all agents must follow

- Tech stack is locked: Next.js (App Router) + Supabase + Vercel + Claude Haiku.
- No auth. `updated_by` and similar fields are free text.
- Soft deletes only (`deleted_at`), never hard delete.
- UI is utilitarian/spreadsheet-adjacent — no decorative styling, mobile-first.
- Raw Flipp data is always surfaced alongside any LLM interpretation.
- Graceful degradation: missing Flipp data, failed scrapes, etc. never crash.
- Do not auto-convert units in code. The LLM handles unit reasoning.

## How to use these files

When delegating, point the agent at one task file and the design doc. The task
file lists prerequisites; if those aren't done yet, the agent should stop and
report rather than fake the missing layer.
