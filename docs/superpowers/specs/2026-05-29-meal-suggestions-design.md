# Meal Suggestions Feature — Design Spec

**Date:** 2026-05-29  
**Status:** Approved

---

## Overview

Add a "Suggest meals" button to the weekly planner that uses the LLM to recommend meal ideas based on what's already planned for the week (including ingredients) and what's in the pantry. The user can optionally provide preferences before generating, then accept individual suggestions into specific empty slots (title-only fill).

---

## User Flow

1. A **"Suggest meals"** button appears below the meal list, above the existing "Optimize" button.
2. Clicking opens a small **pre-flight modal** with:
   - A free-text preferences field ("Any preferences? e.g. 'vegetarian', 'spicy', 'quick to make'")
   - A "Skip" link and a "Generate" button
3. On submit, the modal closes and a loading state shows while the LLM call is in flight.
4. Results appear as a list of **5–8 meal name suggestions** below the button.
5. Each suggestion row contains:
   - The suggested meal name
   - A dropdown listing empty slots by number ("Slot 1 (empty)", "Slot 3 (empty)")
   - An **Accept** button — fills the selected slot's title, removes the suggestion from the list
   - A **Dismiss (×)** button — removes the suggestion from the list
6. The slot dropdown updates live as slots get filled via Accept.
7. Suggestions are client-side only — they disappear on page refresh.

---

## Architecture

### `lib/llm/suggestMeals.ts` (new)

LLM function mirroring the structure of `lib/llm/optimize.ts`.

**Input:**
```ts
interface SuggestMealsInput {
  pantry: { name: string; notes: string | null }[];
  meals: {
    title: string;
    ingredients: { name: string; quantity: string | null }[];
  }[];
  preferences?: string;
}
```

**Output:** `string[]` — list of meal name suggestions.

The prompt instructs the LLM to suggest meals that:
- Reuse ingredients already appearing in the week's meals (reducing shopping)
- Draw on pantry items where possible
- Respect any preferences the user provided

Returns a JSON array of strings. Uses the same `getModel()` / `generateText` pattern as `optimize.ts`.

---

### `POST /api/suggest-meals` (new)

**Request body:** `{ weekOf: string; preferences?: string }`

**Server logic:**
1. Fetch meals for `weekOf` with their ingredients (same join as the optimize route).
2. Fetch all non-deleted pantry items.
3. Call `suggestMeals({ pantry, meals, preferences })`.
4. Return `{ suggestions: string[] }`.

No writes to the database.

---

### `app/MealSuggestions.tsx` (new)

Client component. Placed in `WeekView.tsx` just above `<Suggestions />`.

**Props:**
```ts
interface MealSuggestionsProps {
  weekOf: string;
  /** Live slot summaries from WeekView — used to populate the slot picker. */
  slots: { key: string; index: number; title: string }[];
  /** Called when the user accepts a suggestion into a slot. */
  onAccept: (slotKey: string, title: string) => void;
}
```

**Internal state:**
- `showModal: boolean` — controls the pre-flight modal
- `preferences: string` — the free-text input value
- `suggestions: string[]` — results from the API
- `loading: boolean`
- `error: string | null`
- Per-suggestion selected slot key (defaulting to the first empty slot)

**Accept logic:** calls `onAccept(slotKey, mealName)`, which WeekView routes to the appropriate `MealSlot` to set its title (via the existing `onSummaryChange` / slot title update path). Also removes the suggestion from local state.

---

### `WeekView.tsx` (modified)

- Import and render `<MealSuggestions>` above `<Suggestions>`.
- Pass the live `slots` array (derived from `summaries` map) as a prop.
- Implement `handleSuggestionAccept(slotKey, title)` — stores a `pendingTitles: Map<string, string>` in state, keyed by slot key. Each `MealSlot` receives an optional `pendingTitle` prop; a `useEffect` inside `MealSlot` applies it once (calls `saveTitle`) when it changes from `undefined` to a string, then WeekView clears the pending entry. This avoids refs/imperative handles and keeps data flow unidirectional.

---

## Slot Picker Behaviour

- Only empty slots (title is blank) appear as selectable options.
- If all slots are filled, the Accept button is disabled with a tooltip "All slots are already filled."
- The dropdown defaults to the first empty slot.
- After accepting, the accepted slot is removed from all suggestion dropdowns immediately.

---

## Out of Scope

- Persisting suggestions to the database.
- Auto-generating ingredients for accepted meals (user uses existing "Paste recipe URL" flow).
- Suggesting meals when all 5 slots are already filled (the button is hidden in that case).
