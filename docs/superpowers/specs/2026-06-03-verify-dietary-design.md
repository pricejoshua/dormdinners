# Verify Dietary Restrictions per Meal

**Date:** 2026-06-03  
**Status:** Approved

## Summary

Add a "Verify" button to each meal slot that checks whether the meal accommodates the group's dietary restrictions. When restrictions are set and the slot has a real meal, the button opens a modal showing either a clean "Works as-is" confirmation or a detailed list of adaptations and side dish suggestions.

## Data Flow

1. User clicks "Verify" on a meal slot.
2. Client opens `VerifyDietaryModal`, which immediately fetches `GET /api/meals/[id]/verify-dietary`.
3. API route fetches the meal + ingredients from Supabase, then loads effective dietary restrictions using the same standing/week-override logic as `suggest-meals` (checks `app_settings` then `week_settings`).
4. API calls `verifyMealDietary` LLM function, returns `{ ok: boolean; adaptations: string[] }`.
5. Modal displays the result.

## New Files

### `lib/llm/verifyMealDietary.ts`

- Input: `{ title: string, ingredients: { name: string, quantity: string | null }[], dietaryRestrictions: string }`
- Calls `generateText` with a prompt asking whether the meal works as-is for everyone given the restrictions, and if not, to list specific adaptations (e.g. "swap chicken broth for vegetable broth", "serve cheese on the side for dairy-free eaters").
- Returns parsed JSON: `{ ok: boolean, adaptations: string[] }`.
- Throws `LLMRequestError` / `LLMParseError` matching existing patterns.

### `app/api/meals/[id]/verify-dietary/route.ts`

- `GET` handler (no body needed — meal ID comes from the route param).
- Fetches meal row + `meal_ingredients` from Supabase.
- Loads effective restrictions via `app_settings` + `week_settings` (same as `suggest-meals` route).
- Returns `{ ok: boolean; adaptations: string[] }` or `{ error: string }` with appropriate status.

### `app/VerifyDietaryModal.tsx`

- Props: `mealId: string`, `mealTitle: string`, `onClose: () => void`
- Fetches on mount. States: loading → result | error.
- Result display:
  - `ok === true`: "✓ Works as-is" confirmation message.
  - `ok === false`: bulleted list of `adaptations` strings.
- Error state mirrors existing modal error pattern (red bordered box).
- Dismiss via backdrop click or Cancel button, matching `DietaryRestrictionsModal` style.

## Modified Files

### `app/WeeklyPlan.tsx` (`MealSlot`)

- Add `dietaryRestrictions: string` prop.
- When `dietaryRestrictions` is non-empty and `slot.id !== null`, render a small "Verify" button alongside the meal title.
- Button click sets local state to show `VerifyDietaryModal`.

### `app/WeekView.tsx`

- Pass `effectiveRestrictions` (already in state) as `dietaryRestrictions` prop to each `MealSlot`.

## Error Handling

- If the meal has no ingredients yet, the API still calls the LLM — the LLM can still assess based on the title alone.
- If restrictions are empty string at call time (race condition between UI and API), the API returns `{ ok: true, adaptations: [] }` without calling the LLM.
- LLM errors surface as a dismissable error message in the modal, matching existing patterns.

## Out of Scope

- No caching of verify results — each button click makes a fresh LLM call.
- No saving verify results to the database.
- No bulk "verify all meals" action.
