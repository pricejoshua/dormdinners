# Task 08 — Shopping list

**Phase:** 3 (Cross-cutting)
**Depends on:** 04 (pantry), 05 (meals), 06 (flipp), 07 (suggestions)

## Goal

Auto-generated shopping list at `/shopping-list`. Deduplicated across meals,
cross-referenced against the pantry, grouped by store, with raw Flipp prices
surfaced per item.

## Deliverables

1. `lib/shopping-list/generate.ts` — pure function:
   ```ts
   generateShoppingList(input: {
     meals: { ingredients: { name: string; quantity: string }[] }[];
     pantry: { name: string }[];
     flipp: FlippItem[];
     acceptedSuggestions: Suggestion[];
   }): ShoppingListItem[];
   ```
   - Deduplication is a simple case-insensitive normalised name match. Do not
     try to fuzzy-merge — that is the LLM's job during optimization.
   - For each item: set `pantry_match = true` if a non-deleted pantry item's
     normalised name matches.
   - For each item: attach the freshest matching `flipp_cache_id` and use that
     row's `merchant_name` as `assigned_store`. If no match, leave both null.
   - Accepted suggestions of type `substitution` rewrite an ingredient name;
     `pantry_use` sets `pantry_match = true` for that item; `bulk_buy` and
     `overlap` do not alter the row set, but should be visible in a "Notes"
     column on affected rows.
2. `app/api/shopping-list/generate/route.ts` — `POST` triggers regeneration:
   wipes the current week's rows in `shopping_list_items` and inserts fresh
   rows. The design doc says "no archive/history — overwritten each week".
3. `app/shopping-list/page.tsx`:
   - Server component loads current week's `shopping_list_items` grouped by
     `assigned_store` (with a "Store unknown" bucket at the bottom).
   - "Regenerate" button at top calls the POST route.
4. `app/shopping-list/ShoppingList.tsx` (client component):
   - Per group: store header.
   - Per row: checkbox (toggles `checked_off`), name, quantity, Flipp price
     ("$X.XX <post_price_text> at <merchant>"), "have it" pill if
     `pantry_match`.
   - Checked rows visually de-emphasised but not hidden.
5. `app/api/shopping-list/[id]/route.ts` — `PATCH` to toggle `checked_off`.

## Acceptance criteria

- Regenerating after meal edits reflects the new ingredient set.
- Items present in the pantry show the "have it" pill.
- Items with a Flipp match show price + store and link to the store group.
- Items without a Flipp match still appear (in the "Store unknown" bucket).
- Checking off persists across reloads.

## Notes / constraints

- Do not auto-convert units. Display the quantity exactly as entered on the
  meal; display the Flipp `post_price_text` exactly as fetched.
- Generation is deterministic — no LLM call in this task. The optimization
  pass (Task 07) is the only LLM step in this flow.
- Mobile-first: rows must be one-handed-tap friendly; checkboxes large.
