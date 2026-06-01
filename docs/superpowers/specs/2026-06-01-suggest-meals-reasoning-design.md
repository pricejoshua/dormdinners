# Suggest Meals — Reasoning Design

**Date:** 2026-06-01

## Overview

Add a brief reasoning string to each meal suggestion so users can see why the LLM recommended it. Reasoning is hidden by default and revealed on demand via an inline expand/collapse toggle.

## Data Shape

`suggestMeals` changes its return type from `string[]` to `{ name: string; reason: string }[]`.

The LLM prompt is updated to request this JSON shape:

```json
[
  { "name": "Pasta Primavera", "reason": "Uses the pasta and canned tomatoes already in your pantry" },
  ...
]
```

`maxTokens` is bumped from 1024 to 2048 to accommodate the extra tokens per suggestion.

## Backend Changes

**`lib/llm/suggestMeals.ts`**
- Return type: `Promise<{ name: string; reason: string }[]>`
- Prompt updated to request object array with `name` and `reason` fields
- `maxTokens` increased to 2048
- Parse/validation updated: each item must have non-empty `name` and `reason` strings; items missing either field are filtered out

**`app/api/suggest-meals/route.ts`**
- `suggestions` response field type changes to `{ name: string; reason: string }[]`
- No other logic changes

## Frontend Changes

**`app/MealSuggestions.tsx`**
- `suggestions` state type changes from `string[]` to `{ name: string; reason: string }[]`
- `SuggestionItem` receives a `reason` prop
- A small toggle button (`▸` / `▾`) sits next to the meal name; clicking expands an inline block beneath showing the reason text
- Accept/dismiss logic updated to match on `name` instead of the whole string

## Tests

**`lib/llm/suggestMeals.test.ts`**
- Mock LLM response updated to the new object shape
- Assertions updated to check `{ name, reason }` objects
