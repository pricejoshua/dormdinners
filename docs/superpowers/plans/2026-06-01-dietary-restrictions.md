# Dietary Restrictions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent group-level dietary restrictions with per-week overrides, visible on the week view and injected into meal suggestions.

**Architecture:** Two Supabase tables (`app_settings` for the standing default, `week_settings` for per-week overrides) back two API route pairs. The week-settings GET resolves the effective value (week override > default) and returns all three values. The `suggestMeals` LLM function gains a `dietaryRestrictions` field injected as a hard-constraint line. `WeekView` fetches restrictions on mount and renders a display + modal.

**Tech Stack:** Next.js App Router API routes, Supabase (supabaseServerClient), React useState/useEffect, Tailwind CSS, Vitest

---

## File Map

| File | Action |
|------|--------|
| `supabase/migrations/0007_app_settings.sql` | Create |
| `supabase/migrations/0008_week_settings.sql` | Create |
| `types/database.ts` | Modify — add AppSettingsRow, WeekSettingsRow |
| `app/api/settings/dietary-restrictions/route.ts` | Create |
| `app/api/week-settings/[weekOf]/dietary-restrictions/route.ts` | Create |
| `lib/llm/suggestMeals.ts` | Modify — add dietaryRestrictions field |
| `lib/llm/suggestMeals.test.ts` | Create |
| `app/api/suggest-meals/route.ts` | Modify — fetch + pass restrictions |
| `app/DietaryRestrictionsModal.tsx` | Create |
| `app/WeekView.tsx` | Modify — display + modal wiring |

---

## Task 1: DB migrations

**Files:**
- Create: `supabase/migrations/0007_app_settings.sql`
- Create: `supabase/migrations/0008_week_settings.sql`
- Modify: `types/database.ts`

- [ ] **Step 1: Write migration 0007**

`supabase/migrations/0007_app_settings.sql`:
```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key   text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_anon_all"
  ON app_settings FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "app_settings_authenticated_all"
  ON app_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

INSERT INTO app_settings (key, value)
VALUES ('dietary_restrictions', '')
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Write migration 0008**

`supabase/migrations/0008_week_settings.sql`:
```sql
CREATE TABLE IF NOT EXISTS week_settings (
  week_of              date PRIMARY KEY,
  dietary_restrictions text NOT NULL DEFAULT ''
);

ALTER TABLE week_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "week_settings_anon_all"
  ON week_settings FOR ALL TO anon
  USING (true) WITH CHECK (true);

CREATE POLICY "week_settings_authenticated_all"
  ON week_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

- [ ] **Step 3: Apply migrations**

Run: `npx supabase db push`  
Expected: both migrations apply cleanly with no errors.

- [ ] **Step 4: Add types to `types/database.ts`**

After the existing `ReferencePriceUpdate` type, add:

```typescript
export interface AppSettingsRow {
  key: string;
  value: string;
}

export interface WeekSettingsRow {
  week_of: string;
  dietary_restrictions: string;
}
```

Also add to the `Database` interface inside `public.Tables`, after `reference_prices`:

```typescript
      app_settings: {
        Row: AppSettingsRow;
        Insert: Partial<AppSettingsRow> & { key: string };
        Update: Partial<AppSettingsRow>;
      };
      week_settings: {
        Row: WeekSettingsRow;
        Insert: Partial<WeekSettingsRow> & { week_of: string };
        Update: Partial<WeekSettingsRow>;
      };
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0007_app_settings.sql supabase/migrations/0008_week_settings.sql types/database.ts
git commit -m "feat: add app_settings and week_settings migrations"
```

---

## Task 2: API — app-level dietary restrictions

**Files:**
- Create: `app/api/settings/dietary-restrictions/route.ts`

- [ ] **Step 1: Create the route file**

`app/api/settings/dietary-restrictions/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const { data, error } = await supabaseServerClient
    .from('app_settings')
    .select('value')
    .eq('key', 'dietary_restrictions')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ value: data?.value ?? '' });
}

export async function PUT(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof (body as Record<string, unknown>)?.value !== 'string') {
    return NextResponse.json({ error: 'value must be a string' }, { status: 400 });
  }

  const value = ((body as Record<string, unknown>).value as string).trim();

  const { error } = await supabaseServerClient
    .from('app_settings')
    .upsert({ key: 'dietary_restrictions', value });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ value });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/settings/dietary-restrictions/route.ts
git commit -m "feat: GET/PUT /api/settings/dietary-restrictions"
```

---

## Task 3: API — week-level dietary restrictions

**Files:**
- Create: `app/api/week-settings/[weekOf]/dietary-restrictions/route.ts`

- [ ] **Step 1: Create the route file**

`app/api/week-settings/[weekOf]/dietary-restrictions/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase/server';
import { isMondayISO } from '@/app/_lib/weekOf';

export const dynamic = 'force-dynamic';

type RouteContext = { params: { weekOf: string } };

export async function GET(_req: Request, { params }: RouteContext): Promise<NextResponse> {
  const { weekOf } = params;
  if (!isMondayISO(weekOf)) {
    return NextResponse.json({ error: 'weekOf must be a Monday YYYY-MM-DD' }, { status: 400 });
  }

  const [settingsResult, weekResult] = await Promise.all([
    supabaseServerClient
      .from('app_settings')
      .select('value')
      .eq('key', 'dietary_restrictions')
      .single(),
    supabaseServerClient
      .from('week_settings')
      .select('dietary_restrictions')
      .eq('week_of', weekOf)
      .maybeSingle(),
  ]);

  const standing = settingsResult.data?.value ?? '';
  const weekOverride = weekResult.data ? weekResult.data.dietary_restrictions : null;
  const effective = weekOverride !== null ? weekOverride : standing;

  return NextResponse.json({ standing, weekOverride, effective });
}

export async function PUT(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const { weekOf } = params;
  if (!isMondayISO(weekOf)) {
    return NextResponse.json({ error: 'weekOf must be a Monday YYYY-MM-DD' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof (body as Record<string, unknown>)?.value !== 'string') {
    return NextResponse.json({ error: 'value must be a string' }, { status: 400 });
  }

  const value = ((body as Record<string, unknown>).value as string).trim();

  const { error } = await supabaseServerClient
    .from('week_settings')
    .upsert({ week_of: weekOf, dietary_restrictions: value });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ weekOf, value });
}

export async function DELETE(_req: Request, { params }: RouteContext): Promise<NextResponse> {
  const { weekOf } = params;
  if (!isMondayISO(weekOf)) {
    return NextResponse.json({ error: 'weekOf must be a Monday YYYY-MM-DD' }, { status: 400 });
  }

  const { error } = await supabaseServerClient
    .from('week_settings')
    .delete()
    .eq('week_of', weekOf);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/api/week-settings/[weekOf]/dietary-restrictions/route.ts"
git commit -m "feat: GET/PUT/DELETE /api/week-settings/[weekOf]/dietary-restrictions"
```

---

## Task 4: LLM — dietaryRestrictions in suggestMeals (TDD)

**Files:**
- Create: `lib/llm/suggestMeals.test.ts`
- Modify: `lib/llm/suggestMeals.ts`

- [ ] **Step 1: Write the failing tests**

`lib/llm/suggestMeals.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./provider', () => ({
  getModel: vi.fn(() => ({ _tag: 'mock-model' })),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import { generateText } from 'ai';
import { suggestMeals } from './suggestMeals';
import { LLMParseError, LLMRequestError } from './types';

const mockGenerateText = vi.mocked(generateText);

const baseInput = {
  pantry: [{ name: 'olive oil', notes: null }],
  meals: [{ title: 'Pasta', ingredients: [{ name: 'pasta', quantity: '500g' }] }],
};

describe('suggestMeals', () => {
  beforeEach(() => { mockGenerateText.mockReset(); });

  it('returns parsed meal names', async () => {
    mockGenerateText.mockResolvedValueOnce({ text: '["Fried Rice", "Lentil Soup"]' } as never);
    const result = await suggestMeals(baseInput);
    expect(result).toEqual(['Fried Rice', 'Lentil Soup']);
  });

  it('includes dietary restrictions as a hard constraint in the prompt', async () => {
    mockGenerateText.mockResolvedValueOnce({ text: '["Fried Rice"]' } as never);
    await suggestMeals({ ...baseInput, dietaryRestrictions: 'no nuts' });
    const call = mockGenerateText.mock.calls[0][0];
    const prompt = (call.messages as Array<{ content: string }>)[0].content;
    expect(prompt).toContain('Dietary restrictions: no nuts');
  });

  it('omits dietary restrictions line when not provided', async () => {
    mockGenerateText.mockResolvedValueOnce({ text: '["Fried Rice"]' } as never);
    await suggestMeals(baseInput);
    const call = mockGenerateText.mock.calls[0][0];
    const prompt = (call.messages as Array<{ content: string }>)[0].content;
    expect(prompt).not.toContain('Dietary restrictions');
  });

  it('throws LLMRequestError when generateText throws', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('network'));
    await expect(suggestMeals(baseInput)).rejects.toBeInstanceOf(LLMRequestError);
  });

  it('throws LLMParseError when response is not valid JSON', async () => {
    mockGenerateText.mockResolvedValueOnce({ text: 'not json' } as never);
    await expect(suggestMeals(baseInput)).rejects.toBeInstanceOf(LLMParseError);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run lib/llm/suggestMeals.test.ts`  
Expected: FAIL — "cannot find module" or test failures on the `dietaryRestrictions` cases.

- [ ] **Step 3: Update `lib/llm/suggestMeals.ts`**

Add `dietaryRestrictions?: string` to the interface and inject it into the prompt. Replace the entire file content:

```typescript
import 'server-only';

import { generateText } from 'ai';
import { getModel } from './client';
import { LLMParseError, LLMRequestError } from './types';

export interface SuggestMealsInput {
  pantry: { name: string; notes: string | null }[];
  meals: {
    title: string;
    ingredients: { name: string; quantity: string | null }[];
  }[];
  preferences?: string;
  dietaryRestrictions?: string;
}

function formatPantry(pantry: SuggestMealsInput['pantry']): string {
  if (pantry.length === 0) return '(none)';
  return pantry.map((p) => (p.notes ? `${p.name} (${p.notes})` : p.name)).join(', ');
}

function formatMeals(meals: SuggestMealsInput['meals']): string {
  if (meals.length === 0) return '(none planned yet)';
  return meals
    .map((meal, i) => {
      const ings = meal.ingredients
        .map((ing) => (ing.quantity ? `${ing.name} ${ing.quantity}` : ing.name))
        .join(', ');
      return `  ${i + 1}. ${meal.title}${ings ? `: ${ings}` : ''}`;
    })
    .join('\n');
}

export async function suggestMeals(input: SuggestMealsInput): Promise<string[]> {
  const restrictionsLine = input.dietaryRestrictions?.trim()
    ? `\nDietary restrictions: ${input.dietaryRestrictions.trim()}`
    : '';

  const preferencesLine = input.preferences?.trim()
    ? `\nUser preferences: ${input.preferences.trim()}`
    : '';

  const prompt = `You are helping a university cooking group plan their week.

Pantry (already owned): ${formatPantry(input.pantry)}
Meals already planned this week:
${formatMeals(input.meals)}${restrictionsLine}${preferencesLine}

Suggest 6 meal ideas that would work well alongside the existing meals. Favour meals that:
- Reuse ingredients already appearing in the planned meals (reducing shopping)
- Draw on pantry items where possible
- Are practical for a group cooking setting

Return a JSON array of meal name strings only — no descriptions, no explanations.
Example: ["Pasta Primavera", "Fried Rice", "Chicken Stir Fry", "Lentil Soup", "Veggie Tacos", "Shakshuka"]
Return only JSON, no preamble.`;

  let text: string;
  try {
    const result = await generateText({
      model: getModel(),
      maxTokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    text = result.text;
    console.log('[suggestMeals] raw LLM response:', text);
  } catch (err) {
    throw new LLMRequestError('LLM request failed during meal suggestion', err);
  }

  let parsed: unknown;
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    throw new LLMParseError('Failed to parse JSON from meal suggestion response', text);
  }

  if (!Array.isArray(parsed)) {
    throw new LLMParseError('Expected JSON array from meal suggestion response', text);
  }

  return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run lib/llm/suggestMeals.test.ts`  
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/llm/suggestMeals.ts lib/llm/suggestMeals.test.ts
git commit -m "feat: add dietaryRestrictions field to suggestMeals"
```

---

## Task 5: Wire dietary restrictions into suggest-meals route

**Files:**
- Modify: `app/api/suggest-meals/route.ts`

- [ ] **Step 1: Update the route to fetch and pass restrictions**

Replace the full file content of `app/api/suggest-meals/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase/server';
import { suggestMeals } from '@/lib/llm/suggestMeals';
import { currentMondayISO, isMondayISO } from '@/app/_lib/weekOf';
import { LLMParseError, LLMRequestError } from '@/lib/llm/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  let weekOf = currentMondayISO();
  let preferences: string | undefined;

  try {
    const body = (await request.json()) as { weekOf?: unknown; preferences?: unknown };
    if (typeof body?.weekOf === 'string' && isMondayISO(body.weekOf)) {
      weekOf = body.weekOf;
    }
    if (typeof body?.preferences === 'string' && body.preferences.trim()) {
      preferences = body.preferences.trim();
    }
  } catch {
    // No/invalid body → use defaults
  }

  // ── 1. Load this week's meals ──────────────────────────────────────────────
  const { data: meals, error: mealsError } = await supabaseServerClient
    .from('meals')
    .select('*')
    .eq('week_of', weekOf)
    .order('created_at', { ascending: true });

  if (mealsError) {
    return NextResponse.json({ error: mealsError.message }, { status: 500 });
  }

  const mealRows = meals ?? [];
  const mealIds = mealRows.map((m) => m.id);

  if (mealRows.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  // ── 2. Load ingredients ────────────────────────────────────────────────────
  const { data: ingredients, error: ingError } =
    mealIds.length > 0
      ? await supabaseServerClient
          .from('meal_ingredients')
          .select('*')
          .in('meal_id', mealIds)
          .order('created_at', { ascending: true })
      : { data: [], error: null };

  if (ingError) {
    return NextResponse.json({ error: ingError.message }, { status: 500 });
  }

  const ingredientsByMeal = new Map<string, { name: string; quantity: string | null }[]>();
  for (const ing of ingredients ?? []) {
    if (!ing.meal_id) continue;
    const list = ingredientsByMeal.get(ing.meal_id) ?? [];
    list.push({ name: ing.name, quantity: ing.quantity ?? null });
    ingredientsByMeal.set(ing.meal_id, list);
  }

  // ── 3. Load pantry ─────────────────────────────────────────────────────────
  const { data: pantryData, error: pantryError } = await supabaseServerClient
    .from('pantry_items')
    .select('name, notes')
    .is('deleted_at', null);

  if (pantryError) {
    return NextResponse.json({ error: pantryError.message }, { status: 500 });
  }

  // ── 4. Load effective dietary restrictions ─────────────────────────────────
  const [settingsResult, weekSettingsResult] = await Promise.all([
    supabaseServerClient
      .from('app_settings')
      .select('value')
      .eq('key', 'dietary_restrictions')
      .single(),
    supabaseServerClient
      .from('week_settings')
      .select('dietary_restrictions')
      .eq('week_of', weekOf)
      .maybeSingle(),
  ]);

  const standingRestrictions = settingsResult.data?.value ?? '';
  const weekOverride = weekSettingsResult.data?.dietary_restrictions ?? null;
  const dietaryRestrictions = (weekOverride !== null ? weekOverride : standingRestrictions) || undefined;

  // ── 5. Call LLM ────────────────────────────────────────────────────────────
  const input = {
    pantry: (pantryData ?? []).map((p) => ({ name: p.name, notes: p.notes })),
    meals: mealRows.map((meal) => ({
      title: meal.title,
      ingredients: ingredientsByMeal.get(meal.id) ?? [],
    })),
    preferences,
    dietaryRestrictions,
  };

  let suggestions: string[];
  try {
    suggestions = await suggestMeals(input);
  } catch (err) {
    if (err instanceof LLMParseError) {
      console.error('[suggest-meals] LLM parse error:', err.raw);
      return NextResponse.json({ error: `LLM returned malformed JSON: ${err.message}` }, { status: 502 });
    }
    if (err instanceof LLMRequestError) {
      console.error('[suggest-meals] LLM request error:', err.cause);
      return NextResponse.json({ error: `LLM request failed: ${err.message}` }, { status: 502 });
    }
    return NextResponse.json({ error: 'Unexpected error during meal suggestion.' }, { status: 500 });
  }

  return NextResponse.json({ suggestions });
}
```

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`  
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/suggest-meals/route.ts
git commit -m "feat: inject dietary restrictions into meal suggestions"
```

---

## Task 6: DietaryRestrictionsModal component

**Files:**
- Create: `app/DietaryRestrictionsModal.tsx`

- [ ] **Step 1: Create the modal component**

`app/DietaryRestrictionsModal.tsx`:
```typescript
'use client';

import { useState } from 'react';

interface DietaryRestrictionsModalProps {
  weekOf: string;
  standing: string;
  weekOverride: string | null;
  onClose: () => void;
  onSaved: (standing: string, weekOverride: string | null) => void;
}

export default function DietaryRestrictionsModal({
  weekOf,
  standing,
  weekOverride,
  onClose,
  onSaved,
}: DietaryRestrictionsModalProps) {
  const [standingInput, setStandingInput] = useState(standing);
  const [weekInput, setWeekInput] = useState(weekOverride ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const promises: Promise<Response>[] = [];

      if (standingInput.trim() !== standing.trim()) {
        promises.push(
          fetch('/api/settings/dietary-restrictions', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: standingInput.trim() }),
          }),
        );
      }

      const trimmedWeek = weekInput.trim();
      const currentOverrideTrimmed = (weekOverride ?? '').trim();
      if (trimmedWeek !== currentOverrideTrimmed) {
        if (trimmedWeek === '' && weekOverride !== null) {
          promises.push(
            fetch(`/api/week-settings/${weekOf}/dietary-restrictions`, { method: 'DELETE' }),
          );
        } else if (trimmedWeek !== '') {
          promises.push(
            fetch(`/api/week-settings/${weekOf}/dietary-restrictions`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ value: trimmedWeek }),
            }),
          );
        }
      }

      const results = await Promise.all(promises);
      if (results.some((r) => !r.ok)) {
        setError('Failed to save. Please try again.');
        return;
      }

      onSaved(standingInput.trim(), trimmedWeek !== '' ? trimmedWeek : null);
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white border border-gray-300 rounded p-4 w-full max-w-sm mx-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-4">Dietary restrictions</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Standing restrictions
              <span className="ml-1 text-gray-400">(applies every week unless overridden)</span>
            </label>
            <textarea
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-500 resize-none"
              rows={2}
              placeholder="e.g. no nuts, vegetarian"
              value={standingInput}
              onChange={(e) => setStandingInput(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              This week only
              <span className="ml-1 text-gray-400">(replaces standing restrictions for this week)</span>
            </label>
            <textarea
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-500 resize-none"
              rows={2}
              placeholder="Leave blank to use standing restrictions"
              value={weekInput}
              onChange={(e) => setWeekInput(e.target.value)}
            />
            {weekOverride !== null && weekOverride !== '' && (
              <button
                type="button"
                onClick={() => setWeekInput('')}
                className="mt-1 text-xs text-gray-500 underline underline-offset-2 hover:text-gray-900"
              >
                Clear override
              </button>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { void handleSave(); }}
            disabled={saving}
            className="px-3 py-1 text-sm bg-gray-900 text-white rounded disabled:opacity-50 hover:bg-gray-700"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/DietaryRestrictionsModal.tsx
git commit -m "feat: DietaryRestrictionsModal component"
```

---

## Task 7: WeekView — display and modal wiring

**Files:**
- Modify: `app/WeekView.tsx`

- [ ] **Step 1: Add imports and state to WeekView**

At the top of `app/WeekView.tsx`, add the import after the existing imports:

```typescript
import { useEffect, useMemo, useState } from 'react';
import DietaryRestrictionsModal from '@/app/DietaryRestrictionsModal';
```

Note: `useEffect` needs to be added to the existing React import. Replace:
```typescript
import { useMemo, useState } from 'react';
```
with:
```typescript
import { useEffect, useMemo, useState } from 'react';
```

Add import after the existing imports block:
```typescript
import DietaryRestrictionsModal from '@/app/DietaryRestrictionsModal';
```

- [ ] **Step 2: Add dietary restrictions state inside WeekView**

After the existing `const [savingHeadcount, setSavingHeadcount] = useState(false);` line, add:

```typescript
const [standing, setStanding] = useState('');
const [weekOverride, setWeekOverride] = useState<string | null>(null);
const [showDietaryModal, setShowDietaryModal] = useState(false);

useEffect(() => {
  fetch(`/api/week-settings/${weekOf}/dietary-restrictions`)
    .then((r) => r.json())
    .then((data: { standing: string; weekOverride: string | null }) => {
      setStanding(data.standing ?? '');
      setWeekOverride(data.weekOverride ?? null);
    })
    .catch(() => {});
}, [weekOf]);

const effectiveRestrictions = weekOverride !== null ? weekOverride : standing;
```

- [ ] **Step 3: Add dietary restrictions display to the JSX**

Replace the headcount `<div>`:
```tsx
{/* Headcount */}
<div className="flex items-center gap-2 mb-4">
  <label htmlFor="headcount" className="text-sm text-gray-700 font-medium">
    Headcount
  </label>
  <input
    id="headcount"
    type="number"
    min={1}
    value={headcountInput}
    onChange={(e) => setHeadcountInput(e.target.value)}
    onBlur={() => { void saveHeadcount(); }}
    onKeyDown={(e) => { if (e.key === 'Enter') { void saveHeadcount(); } }}
    className="w-16 border border-gray-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:border-gray-500"
  />
  {savingHeadcount && <span className="text-xs text-gray-400">Saving…</span>}
</div>
```

with:
```tsx
{/* Headcount + Dietary restrictions */}
<div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
  <div className="flex items-center gap-2">
    <label htmlFor="headcount" className="text-sm text-gray-700 font-medium">
      Headcount
    </label>
    <input
      id="headcount"
      type="number"
      min={1}
      value={headcountInput}
      onChange={(e) => setHeadcountInput(e.target.value)}
      onBlur={() => { void saveHeadcount(); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { void saveHeadcount(); } }}
      className="w-16 border border-gray-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:border-gray-500"
    />
    {savingHeadcount && <span className="text-xs text-gray-400">Saving…</span>}
  </div>

  <div className="flex items-center gap-2">
    <span className="text-sm text-gray-700 font-medium shrink-0">Dietary restrictions</span>
    <span className="text-sm text-gray-600 max-w-[200px] truncate">
      {effectiveRestrictions || <span className="text-gray-400">None</span>}
    </span>
    {weekOverride !== null && weekOverride !== '' && (
      <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 shrink-0">this week</span>
    )}
    <button
      type="button"
      onClick={() => setShowDietaryModal(true)}
      className="text-gray-400 hover:text-gray-700 shrink-0"
      aria-label="Edit dietary restrictions"
      title="Edit dietary restrictions"
    >
      ✎
    </button>
  </div>
</div>
```

- [ ] **Step 4: Add the modal to the JSX**

After the closing `</div>` of the main return block (just before the final `</div>`), add:

```tsx
{showDietaryModal && (
  <DietaryRestrictionsModal
    weekOf={weekOf}
    standing={standing}
    weekOverride={weekOverride}
    onClose={() => setShowDietaryModal(false)}
    onSaved={(newStanding, newWeekOverride) => {
      setStanding(newStanding);
      setWeekOverride(newWeekOverride);
    }}
  />
)}
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`  
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/WeekView.tsx
git commit -m "feat: dietary restrictions display and modal in WeekView"
```
