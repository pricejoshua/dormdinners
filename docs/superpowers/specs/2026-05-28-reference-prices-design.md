# Reference prices (group-maintained source of truth) + surfacing

**Date:** 2026-05-28
**Status:** Approved

## Problem

The shopping list's price data comes only from Flipp, which is weekly *sale*
data: relevant (~93% of cached rows match their query) but **not
size-comparable** (units missing on ~60% of rows; intra-item price ranges like
yogurt $0.97–$199.99 because rows mix single-serving and case sizes) and with
**no Costco** (warehouse prices aren't published anywhere; scraping costco.ca
needs a member login and breaks ToS).

So no algorithm can make Flipp data "inform the user" on real price comparison,
and Costco — a key store for a bulk-buying group — is absent. The reliable
source of comparable, Costco-inclusive prices is the data the group already
has: a small set of **reference prices** they enter, size-normalized because a
human types the size.

This spec covers **Phase 1**: the reference-price source of truth and surfacing
it. Flipp overlay, the store-consolidation optimizer, Flipp unit cleanup, and
shopping-list integration are **Phase 2** (deferred — far more trustworthy once
real reference data exists).

## Decisions

- **Source of truth:** group-entered reference prices; one row per
  (staple, store). Multi-store per staple is first-class (compare Costco vs
  Real Canadian Superstore vs …).
- **Comparability:** `$/unit` computed from the human-entered size, within unit
  families (mass → `$/kg`, volume → `$/L`, count → `$/ea`).
- **Surfacing:** a dedicated **Prices page** (entry + side-by-side store
  comparison) **and** a compact per-ingredient **hint on the planner**.
- **Staple naming:** free-form with autocomplete suggestions (existing staples +
  curated ingredients). Grouping/matching rely on normalization.
- **Planner hint:** rate only — cheapest store + `$/unit` (no meal-cost
  estimate; avoids coupling to recipe quantity).
- Mirror the existing **pantry** CRUD pattern (REST routes, client table,
  soft-delete, free-text `updated_by`, no auth / permissive RLS).

## Data model — migration `0005_reference_prices.sql`

```
reference_prices (
  id          uuid pk default gen_random_uuid(),
  name        text not null,         -- staple, e.g. "chicken thighs"
  store       text not null,         -- e.g. "Costco", "Real Canadian Superstore"
  price       numeric not null,      -- pack price
  size_amount numeric,               -- pack size quantity, e.g. 2
  size_unit   text,                  -- e.g. "kg","g","L","ml","ea","pack"
  notes       text,
  updated_by  text,                  -- free text, no auth (mirrors pantry)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz            -- soft delete; NULL = active
)
```
- RLS enabled; anon + authenticated `USING (true) WITH CHECK (true)` (matches
  every other table).
- Partial index on `(deleted_at) WHERE deleted_at IS NULL`; index on `name`.
- `types/database.ts`: add `ReferencePriceRow` / `Insert` / `Update` + the
  `reference_prices` entry in `Database`.

## `lib/prices/unitPrice.ts` (pure)

- Canonical families & conversions to a base unit:
  - **mass:** g, kg, oz, lb → `$/kg`
  - **volume:** ml, l → `$/L`
  - **count:** ea, each, pack, ct → `$/ea`
- `unitPrice({ price, size_amount, size_unit }): { perValue: number; perUnit: 'kg' | 'L' | 'ea' } | null`
  - null when `size_unit` is unknown or `size_amount` is missing/≤0.
- `cheapestByFamily(rows)` helper: given reference rows for a staple, return the
  lowest `$/unit` per family (so the "cheapest" highlight never compares across
  families).

## `lib/prices/match.ts` (pure)

- `normalizeTokens(name)`: lowercase, strip punctuation, collapse spaces, drop
  non-discriminating modifiers (`fresh, organic, boneless, skinless, large,
  small, lean, extra, of, the, a, an`), light plural-insensitivity
  (strip trailing `s`).
- `matchesStaple(ingredientName, stapleName)`: true when every staple token is
  present in the ingredient's tokens (so "boneless chicken thighs" → "chicken
  thighs"; "chicken broth" ↛ "chicken thighs").
- `staplesForIngredient(ingredientName, staples)`: returns matching staples,
  best (most token overlap) first, for resolving the planner hint.

## API — mirror `/api/pantry`

- `GET /api/reference-prices` — active rows, newest-updated first.
- `POST /api/reference-prices` — requires `name`, `store`, `price` (number);
  `size_amount`/`size_unit`/`notes`/`updated_by` optional.
- `PATCH /api/reference-prices/[id]` — partial update.
- `DELETE /api/reference-prices/[id]` — soft delete (set `deleted_at`).

## Prices page — `app/prices/page.tsx` + `app/prices/PricesTable.tsx`

- Add **"Prices"** nav link in `app/layout.tsx`.
- `page.tsx` (server): fetch active reference prices, render the client table
  (mirrors `PantryPage` / `PantryTable`, including graceful fetch-error note).
- Entry form: staple name (free text + autocomplete from existing staples +
  curated ingredients), **store quick-pick** (Costco, Real Canadian Superstore,
  Save-On-Foods, No Frills, Walmart, + custom), price, size amount, size-unit
  dropdown (kg/g/L/ml/ea/pack), optional notes.
- Display: **grouped by normalized staple name**; within a group, one row per
  entry showing store, price, size, and computed `$/unit`; the cheapest
  `$/unit` **within each family** is highlighted. Show "updated X ago". Inline
  edit + delete.

## Planner hint — `app/WeeklyPlan.tsx` (`MealSlot`)

- `app/page.tsx` fetches active reference prices and threads them through
  `WeekView` → `MealSlot`.
- Per ingredient: `staplesForIngredient` → if matched, compute
  `cheapestByFamily` and render a quiet hint, e.g. **"~$6.50/kg · cheapest at
  Costco"**. Silent when there's no match. Rate only — no meal-cost estimate.

## Testing

- `unitPrice.test.ts`: each family conversion, `$/unit` math, cheapest-by-family
  selection, null cases (missing size / unknown unit).
- `match.test.ts`: subset hits, plural-insensitivity, modifier stripping,
  false-positive rejection ("chicken broth" ↛ "chicken thighs"),
  `staplesForIngredient` ranking.
- API route validation (name/store/price required) following pantry test style
  if present, else a light happy-path/validation test.

## Out of scope (Phase 2)

- Flipp sale overlay ("this week's deal beats your usual price").
- Store-consolidation optimizer.
- Flipp `post_price_text` unit cleanup.
- Shopping-list integration of reference prices.
- Importing/seeding reference prices automatically.
