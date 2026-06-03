# Verify Dietary Restrictions per Meal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Verify" button to each meal slot that calls the LLM to check whether the meal accommodates the group's dietary restrictions, showing either a clean confirmation or a detailed list of adaptations in a modal.

**Architecture:** New LLM function `verifyMealDietary` → new API route `GET /api/meals/[id]/verify-dietary` → new `VerifyDietaryModal` client component → wired into `MealSlot` (show button when `mealId` is set and dietary restrictions are non-empty) via `WeekView` passing `effectiveRestrictions` down.

**Tech Stack:** Next.js App Router, Vercel AI SDK (`generateText`), Supabase, React, Tailwind CSS, Vitest

---

## File Map

| File | Action |
|---|---|
| `lib/llm/verifyMealDietary.ts` | Create — LLM function |
| `lib/llm/verifyMealDietary.test.ts` | Create — unit tests |
| `app/api/meals/[id]/verify-dietary/route.ts` | Create — GET API route |
| `app/VerifyDietaryModal.tsx` | Create — modal component |
| `app/WeeklyPlan.tsx` | Modify — add `dietaryRestrictions` prop to `MealSlot`, render Verify button |
| `app/WeekView.tsx` | Modify — pass `effectiveRestrictions` to each `MealSlot` |

---

## Task 1: LLM function `verifyMealDietary`

**Files:**
- Create: `lib/llm/verifyMealDietary.ts`
- Create: `lib/llm/verifyMealDietary.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/llm/verifyMealDietary.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./provider', () => ({
  getModel: vi.fn(() => ({ _tag: 'mock-model' })),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import { generateText } from 'ai';
import { verifyMealDietary } from './verifyMealDietary';
import { LLMParseError, LLMRequestError } from './types';

const mockGenerateText = vi.mocked(generateText);

const baseInput = {
  title: 'Pasta Bolognese',
  ingredients: [
    { name: 'pasta', quantity: '500g' },
    { name: 'beef mince', quantity: '400g' },
  ],
  dietaryRestrictions: 'vegetarian',
};

describe('verifyMealDietary', () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it('returns ok:true with empty adaptations when meal works as-is', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ ok: true, adaptations: [] }),
    } as never);
    const result = await verifyMealDietary(baseInput);
    expect(result).toEqual({ ok: true, adaptations: [] });
  });

  it('returns ok:false with adaptations when meal needs changes', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ ok: false, adaptations: ['swap beef mince for lentils', 'use vegetable stock'] }),
    } as never);
    const result = await verifyMealDietary(baseInput);
    expect(result).toEqual({
      ok: false,
      adaptations: ['swap beef mince for lentils', 'use vegetable stock'],
    });
  });

  it('filters out non-string and empty adaptations', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ ok: false, adaptations: ['use veggie stock', null, 42, ''] }),
    } as never);
    const result = await verifyMealDietary(baseInput);
    expect(result.adaptations).toEqual(['use veggie stock']);
  });

  it('includes meal title and restrictions in the prompt', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ ok: true, adaptations: [] }),
    } as never);
    await verifyMealDietary(baseInput);
    const call = mockGenerateText.mock.calls[0][0];
    const prompt = (call.messages as Array<{ content: string }>)[0].content;
    expect(prompt).toContain('Pasta Bolognese');
    expect(prompt).toContain('vegetarian');
  });

  it('throws LLMRequestError when generateText throws', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('network'));
    await expect(verifyMealDietary(baseInput)).rejects.toBeInstanceOf(LLMRequestError);
  });

  it('throws LLMParseError when response is not valid JSON', async () => {
    mockGenerateText.mockResolvedValueOnce({ text: 'not json' } as never);
    await expect(verifyMealDietary(baseInput)).rejects.toBeInstanceOf(LLMParseError);
  });

  it('throws LLMParseError when response has wrong shape (ok is not boolean)', async () => {
    mockGenerateText.mockResolvedValueOnce({ text: '{"ok":"yes","adaptations":[]}' } as never);
    await expect(verifyMealDietary(baseInput)).rejects.toBeInstanceOf(LLMParseError);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx vitest run lib/llm/verifyMealDietary.test.ts
```

Expected: FAIL with "Cannot find module './verifyMealDietary'"

- [ ] **Step 3: Write the implementation**

Create `lib/llm/verifyMealDietary.ts`:

```ts
import 'server-only';

import { generateText } from 'ai';
import { getModel } from './client';
import { LLMParseError, LLMRequestError } from './types';

export interface VerifyMealDietaryInput {
  title: string;
  ingredients: { name: string; quantity: string | null }[];
  dietaryRestrictions: string;
}

export interface VerifyMealDietaryResult {
  ok: boolean;
  adaptations: string[];
}

function formatIngredients(ingredients: VerifyMealDietaryInput['ingredients']): string {
  if (ingredients.length === 0) return '(none listed)';
  return ingredients.map((i) => (i.quantity ? `${i.name} ${i.quantity}` : i.name)).join(', ');
}

export async function verifyMealDietary(input: VerifyMealDietaryInput): Promise<VerifyMealDietaryResult> {
  const prompt = `You are helping a university cooking group check if a meal accommodates dietary restrictions.

Meal: ${input.title}
Ingredients: ${formatIngredients(input.ingredients)}
Dietary restrictions in the group: ${input.dietaryRestrictions}

Does this meal work as-is for everyone given the restrictions? If not, list specific adaptations or side dishes so everyone can eat (e.g. "swap chicken broth for vegetable broth", "serve cheese on the side for dairy-free eaters", "cook a plain portion without the meat sauce").

Return JSON only — no preamble, no markdown fences.
If the meal works as-is: {"ok":true,"adaptations":[]}
If adaptations are needed: {"ok":false,"adaptations":["adaptation 1","adaptation 2"]}`;

  let text: string;
  try {
    const result = await generateText({
      model: getModel(),
      maxTokens: 1024,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });
    text = result.text;
  } catch (err) {
    throw new LLMRequestError('LLM request failed during dietary verification', err);
  }

  let parsed: unknown;
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    throw new LLMParseError('Failed to parse JSON from dietary verification response', text);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).ok !== 'boolean' ||
    !Array.isArray((parsed as Record<string, unknown>).adaptations)
  ) {
    throw new LLMParseError('Unexpected shape in dietary verification response', text);
  }

  const obj = parsed as { ok: boolean; adaptations: unknown[] };
  return {
    ok: obj.ok,
    adaptations: obj.adaptations.filter((a): a is string => typeof a === 'string' && a.trim() !== ''),
  };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npx vitest run lib/llm/verifyMealDietary.test.ts
```

Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```
git add lib/llm/verifyMealDietary.ts lib/llm/verifyMealDietary.test.ts
git commit -m "feat: add verifyMealDietary LLM function"
```

---

## Task 2: API route `GET /api/meals/[id]/verify-dietary`

**Files:**
- Create: `app/api/meals/[id]/verify-dietary/route.ts`

Note: the `[id]` directory already exists at `app/api/meals/[id]/` (there are existing routes like `extract-from-url` and `ingredients` there). Just add the new `verify-dietary` subdirectory.

- [ ] **Step 1: Create the route**

Create `app/api/meals/[id]/verify-dietary/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase/server';
import { verifyMealDietary } from '@/lib/llm/verifyMealDietary';
import { LLMParseError, LLMRequestError } from '@/lib/llm/types';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const mealId = params.id;

  // 1. Load meal
  const { data: meal, error: mealError } = await supabaseServerClient
    .from('meals')
    .select('id, title, week_of')
    .eq('id', mealId)
    .maybeSingle();

  if (mealError) {
    return NextResponse.json({ error: mealError.message }, { status: 500 });
  }
  if (!meal) {
    return NextResponse.json({ error: 'Meal not found' }, { status: 404 });
  }

  // 2. Load ingredients
  const { data: ingredients, error: ingError } = await supabaseServerClient
    .from('meal_ingredients')
    .select('name, quantity')
    .eq('meal_id', mealId)
    .order('created_at', { ascending: true });

  if (ingError) {
    return NextResponse.json({ error: ingError.message }, { status: 500 });
  }

  // 3. Load effective dietary restrictions (same logic as suggest-meals)
  const [settingsResult, weekSettingsResult] = await Promise.all([
    supabaseServerClient
      .from('app_settings')
      .select('value')
      .eq('key', 'dietary_restrictions')
      .maybeSingle(),
    supabaseServerClient
      .from('week_settings')
      .select('dietary_restrictions')
      .eq('week_of', meal.week_of)
      .maybeSingle(),
  ]);

  const standingRestrictions = settingsResult.data?.value ?? '';
  const weekOverride = weekSettingsResult.data ? weekSettingsResult.data.dietary_restrictions : null;
  const dietaryRestrictions = (weekOverride !== null ? weekOverride : standingRestrictions) || '';

  // 4. Short-circuit if no restrictions are set
  if (!dietaryRestrictions.trim()) {
    return NextResponse.json({ ok: true, adaptations: [] });
  }

  // 5. Call LLM
  let result: { ok: boolean; adaptations: string[] };
  try {
    result = await verifyMealDietary({
      title: meal.title,
      ingredients: (ingredients ?? []).map((i) => ({ name: i.name, quantity: i.quantity ?? null })),
      dietaryRestrictions,
    });
  } catch (err) {
    if (err instanceof LLMParseError) {
      console.error('[verify-dietary] LLM parse error:', err.raw);
      return NextResponse.json({ error: `LLM returned malformed JSON: ${err.message}` }, { status: 502 });
    }
    if (err instanceof LLMRequestError) {
      console.error('[verify-dietary] LLM request error:', err.cause);
      return NextResponse.json({ error: `LLM request failed: ${err.message}` }, { status: 502 });
    }
    return NextResponse.json({ error: 'Unexpected error during dietary verification.' }, { status: 500 });
  }

  return NextResponse.json(result);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```
git add app/api/meals/[id]/verify-dietary/route.ts
git commit -m "feat: add GET /api/meals/[id]/verify-dietary route"
```

---

## Task 3: `VerifyDietaryModal` component

**Files:**
- Create: `app/VerifyDietaryModal.tsx`

- [ ] **Step 1: Create the component**

Create `app/VerifyDietaryModal.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

interface VerifyDietaryModalProps {
  mealId: string;
  mealTitle: string;
  onClose: () => void;
}

export default function VerifyDietaryModal({ mealId, mealTitle, onClose }: VerifyDietaryModalProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<{ ok: boolean; adaptations: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/meals/${mealId}/verify-dietary`)
      .then(async (res) => {
        const json = (await res.json()) as { ok?: boolean; adaptations?: string[]; error?: string };
        if (!res.ok) {
          setError(json.error ?? 'Verification failed.');
        } else {
          setResult({ ok: json.ok ?? true, adaptations: json.adaptations ?? [] });
        }
      })
      .catch(() => setError('Network error. Please try again.'))
      .finally(() => setLoading(false));
  }, [mealId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white border border-gray-300 rounded p-4 w-full max-w-sm mx-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-3">Dietary check — {mealTitle}</h3>

        {loading && (
          <p className="text-sm text-gray-500">Checking restrictions…</p>
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
        )}

        {result && (
          result.ok ? (
            <p className="text-sm text-green-700">✓ Works as-is for everyone.</p>
          ) : (
            <div>
              <p className="text-sm text-gray-700 mb-2">Adaptations needed:</p>
              <ul className="space-y-1 list-disc list-inside">
                {result.adaptations.map((a, i) => (
                  <li key={i} className="text-sm text-gray-600">{a}</li>
                ))}
              </ul>
            </div>
          )
        )}

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```
git add app/VerifyDietaryModal.tsx
git commit -m "feat: add VerifyDietaryModal component"
```

---

## Task 4: Wire up `MealSlot` and `WeekView`

**Files:**
- Modify: `app/WeeklyPlan.tsx`
- Modify: `app/WeekView.tsx`

### 4a — `MealSlot` in `app/WeeklyPlan.tsx`

- [ ] **Step 1: Add `dietaryRestrictions` prop and Verify button to `MealSlot`**

Add `dietaryRestrictions: string` to `MealSlotProps`, add `showVerifyModal` state, import `VerifyDietaryModal`, and render the button + modal.

In `app/WeeklyPlan.tsx`:

Add the import at the top of the file (after the existing imports):

```ts
import VerifyDietaryModal from '@/app/VerifyDietaryModal';
```

Add `dietaryRestrictions: string` to the `MealSlotProps` interface:

```ts
interface MealSlotProps {
  slot: Slot;
  index: number;
  weekOf: string;
  headcount: number;
  referencePrices: PriceRow[];
  onSummaryChange: (key: string, patch: Partial<SlotSummary>) => void;
  pendingTitle?: string;
  onPendingTitleConsumed?: () => void;
  dietaryRestrictions: string;
}
```

Add `dietaryRestrictions` to the destructured props in the `MealSlot` function signature:

```ts
function MealSlot({ slot, index, weekOf, headcount, referencePrices, onSummaryChange, pendingTitle, onPendingTitleConsumed, dietaryRestrictions }: MealSlotProps) {
```

Add `showVerifyModal` state inside `MealSlot` (alongside the existing state declarations such as `showUrlModal`):

```ts
const [showVerifyModal, setShowVerifyModal] = useState(false);
```

In the expanded body of `MealSlot`, add the Verify button inside the `<div className="flex items-center gap-2">` that already contains `+ Add ingredient` and `Paste recipe URL`. Add it as a third item after the existing dot separator:

```tsx
{mealId !== null && dietaryRestrictions.trim() !== '' && (
  <>
    <span className="text-gray-300 text-xs">·</span>
    <button
      type="button"
      onClick={() => setShowVerifyModal(true)}
      className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2"
    >
      Verify dietary
    </button>
  </>
)}
```

The full updated button row (replacing the existing one at the bottom of the expanded body) should look like:

```tsx
<div className="flex items-center gap-2">
  <button
    type="button"
    onClick={() => setAddingIngredient(true)}
    className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2"
  >
    + Add ingredient
  </button>
  <span className="text-gray-300 text-xs">·</span>
  <button
    type="button"
    onClick={openUrlModal}
    className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2"
  >
    Paste recipe URL
  </button>
  {mealId !== null && dietaryRestrictions.trim() !== '' && (
    <>
      <span className="text-gray-300 text-xs">·</span>
      <button
        type="button"
        onClick={() => setShowVerifyModal(true)}
        className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2"
      >
        Verify dietary
      </button>
    </>
  )}
</div>
```

Add the modal render below the existing `{showUrlModal && <UrlModalWithMode ... />}` block (just before the closing `</li>`):

```tsx
{showVerifyModal && mealId !== null && (
  <VerifyDietaryModal
    mealId={mealId}
    mealTitle={title}
    onClose={() => setShowVerifyModal(false)}
  />
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: one or more errors about `dietaryRestrictions` being missing from `MealSlot` call sites in `WeekView.tsx` — that's expected and will be fixed in the next step.

### 4b — `WeekView` in `app/WeekView.tsx`

- [ ] **Step 3: Pass `effectiveRestrictions` to each `MealSlot`**

In `app/WeekView.tsx`, find the `<MealSlot ... />` JSX (around line 220) and add the `dietaryRestrictions` prop:

```tsx
<MealSlot
  key={slot.key}
  slot={slot}
  index={i}
  weekOf={weekOf}
  headcount={headcount}
  referencePrices={referencePrices}
  onSummaryChange={handleSummaryChange}
  pendingTitle={pendingTitles.get(slot.key)}
  onPendingTitleConsumed={() => handlePendingTitleConsumed(slot.key)}
  dietaryRestrictions={effectiveRestrictions}
/>
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Run full test suite**

```
npx vitest run
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```
git add app/WeeklyPlan.tsx app/WeekView.tsx
git commit -m "feat: add Verify dietary button to meal slots"
```
