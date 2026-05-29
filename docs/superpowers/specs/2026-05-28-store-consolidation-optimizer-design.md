# Store-Consolidation Optimizer (Phase 2 — Reference Prices)

**Date:** 2026-05-28
**Status:** Approved

## Problem

The shopping list currently assigns each ingredient to whatever store had a Flipp match, spreading items across potentially many stores. The goal is to consolidate to a fixed number of stores (default 3) that minimizes total cost, using reference prices as the primary signal and Flipp deals as a complement.

## Decisions

- **Fixed store limit:** always pick exactly N stores (default 3), not a soft cap.
- **Price matrix:** per `(ingredient, store)`, use `min(reference_price, flipp_current_price)` — Flipp deals beat reference prices when cheaper.
- **Source priority for display:** track which source won per item (`reference_price_id` vs `flipp_cache_id`) so the UI shows the right price.
- **Items with no price signal in winning stores:** `assigned_store = null` → "Unknown" bucket (existing behavior).
- **Algorithm:** exhaustive combination search over all known stores — C(~10, 3) ≈ 120 combos, negligible compute.

## Data flow

1. `POST /api/shopping-list/generate` loads active `reference_prices` rows (added alongside existing meals, pantry, Flipp, suggestions loads).
2. `generateShoppingList` receives `referencePrices: ReferencePriceRow[]` as new input.
3. After ingredient deduplication, build a price matrix: `Map<normIngredientKey, Map<store, { price: number; source: 'reference' | 'flipp'; flipp_cache_id?: string; reference_price_id?: string }>>`.
   - Reference prices: `matchesStaple` (from `lib/prices/match.ts`) to find matching rows; lowest `price` per store wins.
   - Flipp: scan all Flipp rows matching normKey (not just the freshest-overall); group by `merchant_name` and take the lowest `current_price` per store. For a given store, take `min(reference_price, best_flipp_price)` — whichever is lower wins, and its source + ID is recorded.
4. Call `optimizeStores(priceMatrix, limit)` → `{ selectedStores, assignments }`.
5. Assemble `GeneratedItem[]` using optimizer assignments for `assigned_store`, `flipp_cache_id`, and `reference_price_id`.

## `lib/shopping-list/optimize-stores.ts` (new, pure)

```ts
export interface PriceEntry {
  price: number;
  source: 'reference' | 'flipp';
  flipp_cache_id?: string;
  reference_price_id?: string;
}

export interface StoreAssignment {
  store: string;
  entry: PriceEntry;
}

export function optimizeStores(
  priceMatrix: Map<string, Map<string, PriceEntry>>,
  limit: number
): {
  selectedStores: string[];
  assignments: Map<string, StoreAssignment | null>;
}
```

**Algorithm:**
1. Collect all distinct stores from the matrix.
2. Enumerate every combination of `limit` stores.
3. For each combo: score = sum of `min price` per ingredient across the combo's stores (ingredients with no match contribute 0).
4. Pick the combo with the lowest score.
5. For each ingredient: assign to the cheapest store in the winning combo, or `null` if no match.

## Schema — migration `0006_shopping_list_reference_price.sql`

```sql
ALTER TABLE shopping_list_items
  ADD COLUMN reference_price_id uuid REFERENCES reference_prices(id);
```

At most one of `flipp_cache_id` or `reference_price_id` is set per row:

| `flipp_cache_id` | `reference_price_id` | meaning |
|---|---|---|
| set | null | Flipp deal won (possibly beating reference price) |
| null | set | Reference price won |
| null | null | No price data (Unknown bucket or pantry match) |

## Changes to `lib/shopping-list/generate.ts`

- Add `referencePrices: ReferencePriceRow[]` to `GenerateInput`.
- Add `reference_price_id: string | null` to `GeneratedItem`.
- After ingredient deduplication, build the price matrix using `matchesStaple` + `findFlippMatch`.
- Call `optimizeStores` and derive `assigned_store`, `flipp_cache_id`, `reference_price_id` from assignments.

## Changes to `app/api/shopping-list/generate/route.ts`

- Load active `reference_prices` rows.
- Pass them to `generateShoppingList`.
- Include `reference_price_id` in the `ShoppingListItemInsert`.

## Type changes — `types/database.ts`

- Add `reference_price_id: string | null` to `ShoppingListItemRow`, `ShoppingListItemInsert`, and `ShoppingListItemUpdate`.

## UI — `app/shopping-list/page.tsx` + `ShoppingList.tsx`

- Store grouping is unchanged: at most N groups + "Unknown" bucket.
- Page server component joins `shopping_list_items` with both `flipp_cache` (via `flipp_cache_id`) and `reference_prices` (via `reference_price_id`) to get display prices.
- Per-row price display:
  - `flipp_cache_id` set → `$X.XX <post_price_text>` with sale badge (existing behavior)
  - `reference_price_id` set → `$X.XX` (reference price, no badge)
  - Neither → no price shown

## Testing

- `optimize-stores.test.ts`: combo enumeration, lowest-cost selection, min(reference, flipp) price rule, all-Unknown fallback when no price data.
- `generate.test.ts`: extend existing tests to pass `referencePrices`, verify `reference_price_id` and `assigned_store` are set correctly.
- Migration: verify FK constraint; existing rows have `reference_price_id = null` (no-op upgrade).

## Out of scope

- Letting the user configure N (always 3 for now).
- Flipp `post_price_text` unit cleanup.
- Importing/seeding reference prices automatically.
