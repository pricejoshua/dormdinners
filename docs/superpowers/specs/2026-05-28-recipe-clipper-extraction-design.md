# Recipe-clipper as primary URL extractor, LLM fallback

**Date:** 2026-05-28
**Status:** Approved

## Problem

`app/api/meals/[id]/extract-from-url/route.ts` currently extracts recipe
ingredients from a URL by fetching the page server-side and sending the HTML to
an LLM (`lib/llm/extractRecipe.ts`). The LLM call is the slow/costly part and
fires on every import, even for the many recipe sites that expose clean,
machine-readable markup.

[RecipeClipper](https://github.com/julianpoy/RecipeClipper)
(`@julianpoy/recipe-clipper`, AGPL-3.0) extracts recipes from most cooking sites
using CSS selectors over the page DOM, with an optional TensorFlow.js ML
fallback. We want it as the primary extractor and keep the LLM only as a
fallback for pages it can't parse.

## Decisions

- **Role:** recipe-clipper is primary; the existing LLM `extractRecipe` is the
  fallback when clipper yields zero ingredients.
- **Execution:** server-side, inside the existing API route, running clipper
  under JSDOM. Keeps the all-server architecture; no client bundle/changes.
- **ML:** disabled (`mlDisable: true`). No TensorFlow.js download or ~30s
  inference. JSDOM's weaker `innerText` support lowers clipper accuracy, but the
  LLM fallback absorbs the misses — which is the whole point of having it.
- **Line parsing:** clipper returns ingredients as raw text lines (e.g.
  `"2 cups flour"`). Parse each line into `{name, quantity, unit}` with the MIT
  library `parse-ingredient` so pantry matching / shopping-list keying stays
  clean. (Confirm the package license is MIT during implementation; if it is
  not, fall back to a minimal inline regex parser.)
- **Merge:** feature branch → PR → regular merge commit into `main` (preserve
  per-chunk commits).

## Pipeline (in the existing route)

1. Fetch + 1 MB-capped HTML server-side — **unchanged.**
2. **New:** run recipe-clipper under JSDOM with `mlDisable: true` → ingredient
   lines.
3. **New:** parse each line via `parse-ingredient` → `{name, quantity, unit}`.
4. **Fallback:** if step 2/3 produce zero ingredients, call the existing
   `extractRecipe()` LLM path on the cleaned HTML.
5. Insert into `meal_ingredients` — **unchanged** (`append`/`replace` modes,
   `quantity` = `[quantity, unit].filter(Boolean).join(' ') || null`).

## New module: `lib/recipe/clipRecipe.ts`

`server-only`. Single exported function:

```ts
clipRecipe(html: string, baseUrl: string): Promise<RecipeIngredient[]>
```

- Returns the **same shape** `extractRecipe` already returns
  (`{ name, quantity, unit }`), so the route handles both paths uniformly.
- Builds a JSDOM instance from `html` (with `url: baseUrl` so relative links
  resolve), passes `dom.window` to clipper's `clipRecipe({ window, mlDisable: true })`.
- Splits the returned `ingredients` string on newlines, drops blank lines, runs
  each through `parse-ingredient`, maps to `{ name, quantity, unit }`.
- Returns `[]` (does not throw) when clipper finds nothing, so the route can
  cleanly fall through to the LLM. Unexpected clipper/JSDOM errors are caught and
  also surfaced as `[]` (logged), since the LLM fallback is the safety net.

## Route changes

In `extract-from-url/route.ts`, after `cleanedHtml` is built:

```ts
let ingredients = await clipRecipe(cleanedHtml, raw.url.trim()); // may be []
if (ingredients.length === 0) {
  ingredients = await extractRecipe(cleanedHtml); // existing LLM path
}
```

The existing `try/catch` around `extractRecipe` and the existing
"no ingredients found" / "add manually" responses are preserved.

## Dependencies

- `@julianpoy/recipe-clipper` (AGPL-3.0) — runtime.
- `jsdom` + `@types/jsdom` — runtime / types.
- `parse-ingredient` (MIT, to confirm) — runtime.

## Testing

- `lib/recipe/clipRecipe.test.ts`: sample recipe HTML (with recognizable
  ingredient markup) → expected structured ingredients; empty/garbage HTML → `[]`.
- Line-parsing assertions: `"2 cups flour"` → `{name:'flour', quantity:'2', unit:'cup'}`
  (or whatever `parse-ingredient` yields; pin to its actual output).
- Route fallback branch: clipper `[]` → LLM is invoked (existing route test
  patterns / mocks).

## Edge cases

- Clipper throws or returns empty → fall through to LLM.
- LLM also empty → existing 422 "add ingredients manually" response.
- JSDOM lacking `innerText` → clipper degrades to `textContent`-based extraction;
  accuracy drop is covered by the fallback.

## Out of scope

- Client-side execution / iframe rendering.
- Enabling clipper's ML (TensorFlow.js).
- Extracting non-ingredient recipe fields (title, instructions, image, times).
