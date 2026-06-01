# Dietary Restrictions — Design Spec

**Date:** 2026-06-01  
**Status:** Approved

## Overview

Add persistent, group-level dietary restrictions to Dorm Dinners. Restrictions apply across all weeks by default, with an optional per-week override (which fully replaces the default for that week). Restrictions are displayed on the week view and automatically injected into meal suggestions.

---

## Data Model

### Migration: `app_settings`

A key-value table for app-wide settings. Starts with a single row for dietary restrictions.

```sql
CREATE TABLE app_settings (
  key   text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);
-- Seed the dietary restrictions row
INSERT INTO app_settings (key, value) VALUES ('dietary_restrictions', '');
```

RLS: permissive anon + authenticated policies, matching the rest of the schema.

### Migration: `week_settings`

One optional row per week. If a row exists for a given `week_of`, its value fully replaces the app-level default for that week. If no row exists, the app-level default applies.

```sql
CREATE TABLE week_settings (
  week_of              date PRIMARY KEY,
  dietary_restrictions text NOT NULL DEFAULT ''
);
```

RLS: same permissive policies.

### Effective restrictions logic

```
if week_settings row exists for weekOf → use week_settings.dietary_restrictions
else → use app_settings WHERE key = 'dietary_restrictions'
```

An empty string in either table means "no restrictions" — this lets a per-week override explicitly clear standing restrictions.

---

## API Routes

### `GET /api/settings/dietary-restrictions`

Returns the app-level default.

```json
{ "value": "no nuts, vegetarian" }
```

### `PUT /api/settings/dietary-restrictions`

Body: `{ "value": string }`  
Upserts the `app_settings` row.

### `GET /api/week-settings/[weekOf]/dietary-restrictions`

Returns the per-week override if it exists, plus the resolved effective value.

```json
{ "weekOverride": "no gluten", "effective": "no gluten" }
// or, when no override exists:
{ "weekOverride": null, "effective": "no nuts, vegetarian" }
```

### `PUT /api/week-settings/[weekOf]/dietary-restrictions`

Body: `{ "value": string }`  
Upserts the `week_settings` row. Passing an empty string is valid (explicitly clears restrictions for that week).

### `DELETE /api/week-settings/[weekOf]/dietary-restrictions`

Removes the per-week override, reverting to the app-level default.

---

## UI

### Week view display

Below (or beside) the headcount control in `WeekView.tsx`, add a dietary restrictions row:

```
Dietary restrictions   no nuts, vegetarian   [pencil icon]
                                             (this week only) ← shown only when a week override is active
```

- Fetches effective restrictions on load via `GET /api/week-settings/[weekOf]/dietary-restrictions`
- Shows `"None"` in muted text when empty
- Shows `"(this week only)"` badge when a per-week override is active
- Pencil button opens `DietaryRestrictionsModal`

### `DietaryRestrictionsModal`

A modal following the existing `UrlModalWithMode` visual pattern (white card, `bg-black/40` backdrop, max-w-sm).

Two sections:

**Standing restrictions** (always shown)  
- Textarea pre-filled with the app-level default  
- Label: "Applies every week unless overridden"

**This week only** (always shown)  
- Textarea pre-filled with the week override (or empty)  
- Label: "Leave blank to use standing restrictions"  
- If currently overridden: a "Clear override" button that calls `DELETE /api/week-settings/[weekOf]/dietary-restrictions`

**Save** button: calls PUT on both endpoints (only if values changed), then closes modal and refreshes the display.  
**Cancel** button: closes without saving.

---

## Meal Suggestions Integration

### `lib/llm/suggestMeals.ts`

Add `dietaryRestrictions?: string` to `SuggestMealsInput`. Inject as a dedicated line in the prompt, before `User preferences`:

```
Dietary restrictions: no nuts, vegetarian
```

This is separate from `preferences` so the LLM treats it as a hard constraint rather than a soft preference.

### `app/api/suggest-meals/route.ts`

Before calling `suggestMeals`, fetch the effective dietary restrictions for the week:

```ts
// Fetch effective dietary restrictions
const effective = await getEffectiveDietaryRestrictions(weekOf); // helper or inline query
```

Pass to `suggestMeals` as `dietaryRestrictions: effective || undefined`.

---

## File Checklist

| File | Change |
|------|--------|
| `supabase/migrations/0007_app_settings.sql` | New `app_settings` table |
| `supabase/migrations/0008_week_settings.sql` | New `week_settings` table |
| `app/api/settings/dietary-restrictions/route.ts` | GET + PUT |
| `app/api/week-settings/[weekOf]/dietary-restrictions/route.ts` | GET + PUT + DELETE |
| `app/WeekView.tsx` | Add restrictions display + open modal |
| `app/DietaryRestrictionsModal.tsx` | New modal component |
| `lib/llm/suggestMeals.ts` | Add `dietaryRestrictions` field + prompt line |
| `app/api/suggest-meals/route.ts` | Fetch effective restrictions + pass to LLM |
