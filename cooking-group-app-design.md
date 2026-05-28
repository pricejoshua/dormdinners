# Cooking Group App — Design Document
*Handoff doc for Claude Code*

---

## Overview

A shared web app for university students in a dorm cooking rotation. Each week, one cooking group plans and cooks 5 meals for the whole dorm. The app solves two core pain points:

1. **Pantry visibility** — each new group wastes money rebuying ingredients the previous group left behind
2. **Shopping optimization** — groups without planning instincts overspend because they don't coordinate meals, find ingredient overlaps, or know where to buy cheapest that week

The goal is to make the optimization workflow of a skilled meal planner accessible to everyone.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js (App Router) | React familiarity, API routes in one project, Vercel-native |
| Database | Supabase (PostgreSQL) | Free tier, real-time, easy to set up |
| Hosting | Vercel | Free tier, native Next.js support, cron jobs |
| LLM | Pluggable via Vercel AI SDK (Anthropic / Groq / OpenRouter) | Default Anthropic Claude Haiku 4.5; swap provider with one env var without code changes |
| Price data | Flipp API (unofficial) | `https://backflipp.wishabi.com/flipp/items/search?q=<query>&postal_code=<code>` |

---

## Core User Flow

```
1. Set headcount for the week
2. Add 5 meals (recipe URL or manual ingredient list)
3. View pantry — see what's already on hand
4. Run optimization pass (LLM button) — surfaces suggestions
5. Accept or dismiss suggestions
6. Generate shopping list — grouped by store, cross-referenced against pantry
7. Update pantry at end of week
```

---

## Features

### Pantry
- Shared list of items currently on hand
- Each item: `name`, `notes` (freeform text, e.g. "almost full", "half a bag"), `updated_by` (free text name field — no auth), `updated_at`
- Anyone can add, edit, or remove items
- Soft deletes only (`deleted_at` timestamp) — no hard deletes, supports recovery
- Displayed as a simple editable table

### Weekly Plan
- Headcount input (integer) — used to scale ingredient quantities across all meals
- 5 meal slots
- Each meal: title + ingredient list
- Recipe input: either paste a URL (best-effort scrape via LLM extraction) or manually type ingredients
- Ingredients stored with name + quantity + unit (all freeform)

### Optimization Pass (LLM)
- Triggered manually via a prominent "Optimize" button after all 5 meals are entered
- Single LLM call (Claude Haiku) with full context:
  - All 5 meals and their ingredient lists
  - Current pantry state
  - Current Flipp price data (from cache)
  - Headcount
- LLM returns structured list of suggestions, each with:
  - Type: `bulk_buy` | `ingredient_substitution` | `cross_meal_overlap` | `pantry_use`
  - Human-readable description (e.g. "Meals 1 and 3 both use chicken thighs — buy 2kg at once from Freshmart for $4.99/lb")
  - Estimated saving (if applicable)
- Each suggestion is a card the group can **Accept** or **Dismiss**
- Accepted suggestions update the shopping list automatically

### Shopping List
- Auto-generated from meal ingredient lists after optimization pass
- Ingredients deduplicated and consolidated across meals
- Each item cross-referenced against pantry — pantry matches flagged as "already have"
- Flipp price data surfaced per item: raw item name + store + price + unit (never hidden behind AI)
- Final list grouped by store
- Items can be manually checked off
- No archive/history — list is overwritten each week

### Price Data (Flipp Integration)
- Weekly cron job (Vercel cron, triggered Sunday night) fetches Flipp data for ~50 curated common ingredients
- Postal code hard-coded as environment variable (`NEXT_PUBLIC_POSTAL_CODE`)
- Results stored in `flipp_cache` table with `valid_from`, `valid_to`, `fetched_at`
- LLM handles unit matching and conversion during optimization pass (e.g. `/lb` vs `kg`) — never auto-converted in code
- Stale data shown with warning if `valid_to` has passed
- Graceful fallback: if no Flipp data exists for an ingredient, price column is empty — app never crashes

---

## Data Model

```sql
-- Shared pantry
pantry_items (
  id uuid primary key,
  name text not null,
  notes text,
  updated_by text,            -- free text, no auth
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz      -- soft delete
)

-- Weekly meal plan
meals (
  id uuid primary key,
  title text not null,
  week_of date,               -- Monday of the active week
  headcount int,
  created_at timestamptz
)

-- Ingredients per meal
meal_ingredients (
  id uuid primary key,
  meal_id uuid references meals,
  name text not null,
  quantity text,              -- freeform, e.g. "1.5kg", "2 cans"
  created_at timestamptz
)

-- Flipp price cache
flipp_cache (
  id uuid primary key,
  ingredient_query text,      -- the search term used
  merchant_name text,
  item_name text,
  current_price numeric,
  post_price_text text,       -- unit as returned by Flipp, e.g. "/lb", "/ea"
  valid_from timestamptz,
  valid_to timestamptz,
  fetched_at timestamptz
)

-- LLM optimization suggestions
optimization_suggestions (
  id uuid primary key,
  meal_ids uuid[],            -- which meals this suggestion applies to
  suggestion_type text,       -- bulk_buy | substitution | overlap | pantry_use
  description text,
  estimated_saving text,      -- freeform, e.g. "~$4"
  status text default 'pending', -- pending | accepted | dismissed
  created_at timestamptz
)

-- Final shopping list
shopping_list_items (
  id uuid primary key,
  week_of date,
  name text not null,
  quantity text,
  assigned_store text,
  flipp_cache_id uuid references flipp_cache,
  pantry_match boolean default false,
  checked_off boolean default false,
  created_at timestamptz
)
```

---

## LLM Usage

### Provider abstraction

LLM calls go through the **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/groq` + `@ai-sdk/openai`). A single helper at `lib/llm/provider.ts` resolves the active model from env vars:

| Env var | Values | Notes |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` (default) \| `groq` \| `openrouter` | Selects which provider client to instantiate |
| `LLM_MODEL` | provider-specific model id | Optional; defaults to a sensible per-provider model |
| `ANTHROPIC_API_KEY` | api key | Required if provider is `anthropic` |
| `GROQ_API_KEY` | api key | Required if provider is `groq` |
| `OPENROUTER_API_KEY` | api key | Required if provider is `openrouter`; uses OpenAI-compatible client with `baseURL=https://openrouter.ai/api/v1` |

Default models per provider: Anthropic → `claude-haiku-4-5-20251001`; Groq → `llama-3.3-70b-versatile`; OpenRouter → `anthropic/claude-haiku-4.5`.

The two call sites below stay identical regardless of provider; only the model object changes.

### 1. Recipe URL extraction
When user pastes a URL, fetch the page and pass HTML to Claude Haiku:
```
Extract a list of ingredients from this recipe page. 
Return JSON array: [{ name, quantity, unit }]
Return only JSON, no preamble.
```

### 2. Optimization pass (main LLM call)
Single call after all 5 meals entered. Prompt structure:
```
You are helping a university cooking group plan their week efficiently.

Headcount: {n}
Pantry: {pantry items with notes}
This week's Flipp deals: {flipp_cache items, formatted as "item name - $price/unit at store"}
Meals planned:
  1. {title}: {ingredients}
  2. ...

Identify opportunities to save money or reduce waste. Look for:
- Ingredients that appear in multiple meals (bulk buy opportunity)
- Cheaper ingredient substitutions based on this week's deals
- Pantry items that could replace something on the shopping list
- Bulk sizes that make sense given headcount

Return a JSON array of suggestions:
[{
  type: "bulk_buy" | "substitution" | "overlap" | "pantry_use",
  meal_indices: [0, 2],
  description: "human readable suggestion",
  estimated_saving: "$3-5"
}]
Return only JSON, no preamble.
```

### 3. Unit/match handling
Happens within the optimization pass — the LLM is responsible for reasoning about whether a Flipp item matches a shopping list ingredient and what the total cost would be at the required quantity. Raw Flipp data is always surfaced to the user alongside the interpretation.

---

## Cron Job

**Schedule:** Every Sunday at 8pm PT  
**Implementation:** Vercel cron triggers a Next.js API route which fires a Supabase Edge Function (avoids Vercel's 10s execution limit on free tier)

**Job steps:**
1. Loop through curated ingredient list (~50 items)
2. For each: `GET backflipp.wishabi.com/flipp/items/search?q={ingredient}&postal_code={env}`
3. Store `items` array results in `flipp_cache` (not `ecom_items` — flyer deals only)
4. Mark old records stale

**Curated ingredient list** (starting point, editable in a config file):
chicken thighs, chicken breast, ground beef, salmon, eggs, pasta, rice, lentils, onions, garlic, tomatoes, potatoes, carrots, broccoli, spinach, canned tomatoes, coconut milk, olive oil, butter, cheese, yogurt, bread, flour, sugar, canned chickpeas, canned beans, tofu, soy sauce, vegetable broth, chicken broth

---

## UI / Visual Design

- **Style:** Functional and utilitarian — dense, information-forward, no decorative elements. Prioritize data visibility over aesthetics. Think spreadsheet-adjacent, not marketing site.
- **Layout:** Single-page app feel with distinct sections: Pantry / This Week / Shopping List
- **Pantry:** Inline-editable table with soft add/remove
- **Weekly plan:** 5 meal slots as a compact list, each expandable to show/edit ingredients — not cards, not a grid
- **Optimization:** Full-width "Optimize" CTA button; results appear as a tight dismissible list below, not styled cards
- **Shopping list:** Grouped by store; each item shows name, quantity, Flipp price if available, pantry flag if applicable; checkbox to mark off. Compact rows, high density.
- **Mobile-first:** Groups will use this on their phones while shopping

---

## Environment Variables

```
NEXT_PUBLIC_POSTAL_CODE=V3A4S8
SUPABASE_URL=
SUPABASE_ANON_KEY=

# LLM provider — pick one of: anthropic (default) | groq | openrouter
LLM_PROVIDER=anthropic
LLM_MODEL=                # optional override; falls back to per-provider default
ANTHROPIC_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=

CRON_SECRET=
```

---

## Out of Scope (explicitly)

- User accounts / authentication
- Shopping list history or archiving
- Automatic flyer scraping (Instacart, store websites)
- Multi-dorm support
- Recipe rating or feedback
- Automatic unit conversion in code (LLM handles this)

---

## Known Risks

| Risk | Mitigation |
|---|---|
| Flipp endpoint breaks | Graceful fallback to empty price column; show "price data unavailable" |
| LLM match is wrong | Always show raw Flipp item name so user can sanity check |
| Pantry gets corrupted (no auth) | Soft deletes only; `updated_by` field for basic accountability |
| Cron exceeds Vercel 10s limit | Heavy work runs in Supabase Edge Function, not in Vercel function body |
| Recipe URL scrape fails | Fall back to manual ingredient entry; show clear error |
