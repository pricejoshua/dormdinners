# Recipe scaling + partial weight rollup

**Date:** 2026-05-28
**Status:** Approved

## Problem

Recipes are written for a fixed yield, but the dorm group cooks for a variable
`headcount`. We want every recipe's ingredient quantities scaled to the actual
headcount, fed into the shopping list so purchased amounts match what's cooked,
plus a rough total weight of the ingredients that are already given by mass.

## Decisions

- **Scaling model: derived, not destructive.** Base `meal_ingredients.quantity`
  values are never mutated. The scale factor is computed and applied wherever
  scaled values are shown (meal view) or consumed (shopping list).
- **Scale factor (per meal):**
  `factor = scale_override ?? (serves > 0 && headcount ? headcount / serves : 1)`.
  No serves and no override → factor `1`.
- **`serves` auto-fills** from the recipe's yield on extraction but is editable.
- **Weight rollup is partial:** only ingredients already in mass units
  (g, kg, oz, lb) are summed. Volume/count units (cups, eggs, cans) are ignored.
  No cup→gram conversion.
- **Guidance = derived per-person weight** (weight total ÷ headcount), labeled
  "weighed items only". No new DB field, no LLM.

## Data model — migration `0002_recipe_scaling.sql`

- `ALTER TABLE meals ADD COLUMN serves int;`
- `ALTER TABLE meals ADD COLUMN scale_override numeric;`
- `headcount` already exists (week-level).
- Update `types/database.ts`: `MealRow`/`MealInsert` gain `serves: int | null`
  and `scale_override: number | null`.

## Pure modules (shared by client UI and server route — no `server-only`)

### `lib/recipe/scale.ts`
- `scaleQuantity(quantity: string | null, factor: number): string | null`
  - `null`, empty, or `factor === 1` → returned unchanged.
  - Parse with `parse-ingredient`. If `quantity` is `null` (unparseable number,
    e.g. "to taste") → return original unchanged.
  - Otherwise reconstruct `"<q*factor>[ <unitOfMeasure>][ <description>]"`,
    scaling `quantity` and `quantity2` (range upper bound) when present.
  - Number formatting: round to ≤2 decimals, strip trailing zeros
    (`6`, `1.5`, `0.25`). Ranges render `"<lo>-<hi> unit"`.
- `scaleIngredients(items, factor)` — maps `{name, quantity}` items through
  `scaleQuantity`.

### `lib/recipe/weight.ts`
- Mass unit → grams, keyed on `parse-ingredient`'s `unitOfMeasureID`:
  `gram: 1`, `kilogram: 1000`, `ounce: 28.3495`, `pound: 453.592`.
- `sumWeight(items: { quantity: string | null }[], factor: number): { kg: number; lb: number } | null`
  - For each item, parse; skip if `unitOfMeasureID` is not a known mass unit or
    quantity is null. Use `(quantity2 ?? quantity) * factor` (range upper bound,
    so we don't under-buy) × grams-per-unit; sum grams.
  - Return `null` when no mass-unit ingredients are found, else `{ kg, lb }`
    (`lb = grams / 453.592`), each rounded to 2 decimals.

Both modules are pure and unit-tested in isolation.

## Integration points

1. **Extraction (`lib/recipe/clipRecipe.ts` + route).** `clipRecipe` returns
   `{ ingredients: RecipeIngredient[]; serves: number | null }`. `serves` is the
   leading integer parsed from clipper's `yield` string (e.g. "Serves 4-6" → 4),
   else `null`. The `extract-from-url` route sets `meals.serves` from it when a
   value is found (LLM-fallback path leaves `serves` untouched). The existing
   meal-exists query also selects `serves` so we only overwrite on `replace`
   mode or when currently `null`.
2. **`PATCH /api/meals/[id]`.** Accept `serves` (int | null) and `scale_override`
   (number | null) with the same validation style as `headcount`.
3. **Shopping list (`/api/shopping-list/generate` route).** Before building
   `MealInput`s, scale each meal's ingredients by that meal's factor using
   `scaleIngredients`. `lib/shopping-list/generate.ts` stays string-based and
   unchanged. (Weight rollup on the shopping-list page is out of scope for now.)
4. **Meal UI (`app/WeeklyPlan.tsx` `MealSlot`).**
   - New **Serves** inline input (PATCHes `serves`).
   - **Scale control:** shows the auto factor ("×3 — 12 ÷ 4"); an override input
     PATCHes `scale_override` (clearing it returns to auto).
   - Ingredient table shows **scaled** quantities (computed client-side via
     `scaleQuantity`); the base value is still what inline-edit edits.
   - Footer line: `≈ <kg> kg (<lb> lb)` weighed total when `sumWeight` is
     non-null, plus `≈ <g>/person (weighed items only)` when headcount > 0.
   - `MealSlot` needs `serves`/`scale_override` in its slot data and the
     week `headcount` (already passed) to compute the factor.

## Testing

- `lib/recipe/scale.test.ts`: whole number, fraction, range, unit preserved,
  passthrough ("to taste"), `factor === 1` no-op, `null` quantity.
- `lib/recipe/weight.test.ts`: mixed units summed, kg/lb conversion, range uses
  upper bound, factor applied, no mass units → `null`.
- `lib/recipe/clipRecipe.test.ts`: updated for `{ ingredients, serves }`; yield
  parsing ("Serves 4-6" → 4, missing → null).
- `lib/shopping-list/generate.test.ts` (or route-level): scaled quantities flow
  through aggregation.

## Out of scope

- Volume/count → weight conversion (cups/eggs → grams).
- Destructive "bake-in" scaling (can layer on later).
- Per-meal headcount (headcount stays week-level).
- Weight rollup on the shopping-list page.
