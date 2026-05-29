# Meal Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Suggest meals" button that uses the LLM (Haiku) to recommend meal ideas based on the week's current meals+ingredients and pantry, with an optional preferences modal and per-suggestion slot picker to fill empty meal slots.

**Architecture:** New `lib/llm/suggestMeals.ts` calls `getModel()` (already defaults to Haiku) and returns `string[]`. A new `POST /api/suggest-meals` route fetches meals+ingredients and pantry from Supabase then calls that function. Client-side, `MealSuggestions.tsx` owns the modal + suggestion list; WeekView wires it up via a `pendingTitles` map that pushes accepted titles into MealSlot via a `pendingTitle` prop.

**Tech Stack:** Next.js 14 App Router, Vercel AI SDK (`ai`, `@ai-sdk/anthropic`), React 18, Vitest, Supabase JS, TypeScript, Tailwind CSS

---

### Task 1: LLM function — `lib/llm/suggestMeals.ts`

**Files:**
- Create: `lib/llm/suggestMeals.ts`

- [ ] **Step 1: Create `lib/llm/suggestMeals.ts`**

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
  const preferencesLine = input.preferences?.trim()
    ? `\nUser preferences: ${input.preferences.trim()}`
    : '';

  const prompt = `You are helping a university cooking group plan their week.

Pantry (already owned): ${formatPantry(input.pantry)}
Meals already planned this week:
${formatMeals(input.meals)}${preferencesLine}

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

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add lib/llm/suggestMeals.ts
git commit -m "feat: add suggestMeals LLM function"
```

---

### Task 2: API route — `app/api/suggest-meals/route.ts`

**Files:**
- Create: `app/api/suggest-meals/route.ts`

- [ ] **Step 1: Create the route**

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

  // ── 4. Call LLM ────────────────────────────────────────────────────────────
  const input = {
    pantry: (pantryData ?? []).map((p) => ({ name: p.name, notes: p.notes })),
    meals: mealRows.map((meal) => ({
      title: meal.title,
      ingredients: ingredientsByMeal.get(meal.id) ?? [],
    })),
    preferences,
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

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/api/suggest-meals/route.ts
git commit -m "feat: add POST /api/suggest-meals route"
```

---

### Task 3: Add `pendingTitle` prop to MealSlot

**Files:**
- Modify: `app/WeeklyPlan.tsx`

This allows WeekView to push an accepted suggestion title into a specific slot from outside.

- [ ] **Step 1: Add `pendingTitle` and `onPendingTitleConsumed` to `MealSlotProps`**

In `app/WeeklyPlan.tsx`, find the `MealSlotProps` interface (around line 79) and add the two new optional props:

```typescript
interface MealSlotProps {
  slot: Slot;
  index: number;
  weekOf: string;
  headcount: number;
  referencePrices: PriceRow[];
  onSummaryChange: (key: string, patch: Partial<SlotSummary>) => void;
  pendingTitle?: string;
  onPendingTitleConsumed?: () => void;
}
```

- [ ] **Step 2: Destructure the new props in `MealSlot`**

Find the `function MealSlot({` destructuring (around line 88) and add the two new props:

```typescript
function MealSlot({ slot, index, weekOf, headcount, referencePrices, onSummaryChange, pendingTitle, onPendingTitleConsumed }: MealSlotProps) {
```

- [ ] **Step 3: Add a stable ref to saveTitle and a useEffect to apply it**

Add these lines directly after the `const report = useCallback(...)` block (around line 110), before the `// ── Lazy creation` comment:

```typescript
  // Ref keeps the effect dep array stable while always calling the latest saveTitle.
  const saveTitleRef = useRef(saveTitle);
  saveTitleRef.current = saveTitle;
  const consumedRef = useRef(onPendingTitleConsumed);
  consumedRef.current = onPendingTitleConsumed;

  useEffect(() => {
    if (pendingTitle) {
      void saveTitleRef.current(pendingTitle);
      consumedRef.current?.();
    }
  }, [pendingTitle]);
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add app/WeeklyPlan.tsx
git commit -m "feat: add pendingTitle prop to MealSlot for external title injection"
```

---

### Task 4: `app/MealSuggestions.tsx` component

**Files:**
- Create: `app/MealSuggestions.tsx`

- [ ] **Step 1: Create `app/MealSuggestions.tsx`**

```typescript
'use client';

import { useState } from 'react';

export interface SuggestionSlot {
  key: string;
  index: number;   // 0-based, displayed as index+1
  title: string;   // empty string = available
}

interface MealSuggestionsProps {
  weekOf: string;
  slots: SuggestionSlot[];
  onAccept: (slotKey: string, title: string) => void;
}

// ── Pre-flight modal ──────────────────────────────────────────────────────────

interface PreflightModalProps {
  onGenerate: (preferences: string) => void;
  onClose: () => void;
}

function PreflightModal({ onGenerate, onClose }: PreflightModalProps) {
  const [preferences, setPreferences] = useState('');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white border border-gray-300 rounded p-4 w-full max-w-sm mx-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-1">Suggest meals</h3>
        <p className="text-xs text-gray-500 mb-3">
          Optionally add any preferences, or skip to generate based on your pantry and current meals.
        </p>
        <input
          autoFocus
          type="text"
          placeholder="e.g. vegetarian, spicy, quick to make…"
          value={preferences}
          onChange={(e) => setPreferences(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onGenerate(preferences);
            if (e.key === 'Escape') onClose();
          }}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-500 mb-3"
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onGenerate(preferences)}
            className="px-3 py-1 text-sm bg-gray-900 text-white rounded hover:bg-gray-700"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Single suggestion row ─────────────────────────────────────────────────────

interface SuggestionItemProps {
  name: string;
  emptySlots: SuggestionSlot[];
  onAccept: (slotKey: string) => void;
  onDismiss: () => void;
}

function SuggestionItem({ name, emptySlots, onAccept, onDismiss }: SuggestionItemProps) {
  const [selectedSlotKey, setSelectedSlotKey] = useState<string>(
    emptySlots[0]?.key ?? '',
  );

  // Keep selection valid if emptySlots changes (e.g. another suggestion was accepted).
  const validKey =
    emptySlots.find((s) => s.key === selectedSlotKey)?.key ?? emptySlots[0]?.key ?? '';

  const canAccept = validKey !== '';

  return (
    <li className="flex items-center gap-2 py-1.5 border-b border-gray-100 last:border-b-0 text-sm">
      <span className="flex-1 text-gray-800">{name}</span>

      {canAccept && (
        <select
          value={validKey}
          onChange={(e) => setSelectedSlotKey(e.target.value)}
          className="text-xs border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-gray-500 shrink-0"
        >
          {emptySlots.map((s) => (
            <option key={s.key} value={s.key}>
              Slot {s.index + 1}
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        disabled={!canAccept}
        onClick={() => onAccept(validKey)}
        className="text-xs px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      >
        Accept
      </button>

      <button
        type="button"
        onClick={onDismiss}
        className="text-gray-400 hover:text-red-500 text-xs shrink-0"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </li>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MealSuggestions({ weekOf, slots, onAccept }: MealSuggestionsProps) {
  const [showModal, setShowModal] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emptySlots = slots.filter((s) => s.title.trim() === '');
  const hasEmptySlots = emptySlots.length > 0;

  async function generate(preferences: string) {
    setShowModal(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/suggest-meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekOf, preferences: preferences.trim() || undefined }),
      });
      const json = (await res.json()) as { suggestions?: string[]; error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Suggestion failed.');
      } else {
        setSuggestions(json.suggestions ?? []);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleAccept(name: string, slotKey: string) {
    onAccept(slotKey, name);
    setSuggestions((prev) => prev.filter((s) => s !== name));
  }

  function handleDismiss(name: string) {
    setSuggestions((prev) => prev.filter((s) => s !== name));
  }

  if (!hasEmptySlots) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={loading}
        onClick={() => setShowModal(true)}
        className="w-full py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Suggesting…' : 'Suggest meals'}
      </button>

      {error && (
        <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </p>
      )}

      {suggestions.length > 0 && (
        <ul className="mt-3 border border-gray-200 rounded">
          {suggestions.map((name) => (
            <SuggestionItem
              key={name}
              name={name}
              emptySlots={emptySlots}
              onAccept={(slotKey) => handleAccept(name, slotKey)}
              onDismiss={() => handleDismiss(name)}
            />
          ))}
        </ul>
      )}

      {showModal && (
        <PreflightModal
          onGenerate={(prefs) => void generate(prefs)}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/MealSuggestions.tsx
git commit -m "feat: add MealSuggestions component with pre-flight modal and slot picker"
```

---

### Task 5: Wire up in `app/WeekView.tsx`

**Files:**
- Modify: `app/WeekView.tsx`

- [ ] **Step 1: Import `MealSuggestions` and its `SuggestionSlot` type**

At the top of `app/WeekView.tsx`, add the import after the existing imports:

```typescript
import MealSuggestions, { type SuggestionSlot } from '@/app/MealSuggestions';
```

- [ ] **Step 2: Add `pendingTitles` state to `WeekView`**

After the `const [savingHeadcount, setSavingHeadcount] = useState(false);` line (around line 69), add:

```typescript
  const [pendingTitles, setPendingTitles] = useState<Map<string, string>>(new Map());
```

- [ ] **Step 3: Add the two handler functions**

Add these two functions after `handleSummaryChange` (around line 87):

```typescript
  function handleSuggestionAccept(slotKey: string, title: string) {
    setPendingTitles((prev) => new Map(prev).set(slotKey, title));
  }

  function handlePendingTitleConsumed(slotKey: string) {
    setPendingTitles((prev) => {
      const next = new Map(prev);
      next.delete(slotKey);
      return next;
    });
  }
```

- [ ] **Step 4: Derive `suggestionSlots` from the live summaries**

Add this derived value after the `complete` declaration (around line 94):

```typescript
  const suggestionSlots: SuggestionSlot[] = slots.map((s, i) => ({
    key: s.key,
    index: i,
    title: summaries.get(s.key)?.title ?? '',
  }));
```

- [ ] **Step 5: Pass `pendingTitle` and `onPendingTitleConsumed` to each `MealSlot`**

In the JSX where `MealSlot` is rendered (around line 169), add the two new props:

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
          />
```

- [ ] **Step 6: Render `<MealSuggestions>` above `<Suggestions>`**

Find `<Suggestions initial={suggestions} complete={complete} weekOf={weekOf} />` (around line 175) and add `MealSuggestions` directly above it:

```tsx
      <MealSuggestions
        weekOf={weekOf}
        slots={suggestionSlots}
        onAccept={handleSuggestionAccept}
      />
      <Suggestions initial={suggestions} complete={complete} weekOf={weekOf} />
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Run the dev server and manually verify the full flow**

Run: `npm run dev`

Verify:
1. The "Suggest meals" button appears below the meal list when at least one slot is empty
2. Clicking it opens the pre-flight modal
3. Pressing "Generate" (with or without preferences text) closes the modal and shows a loading state
4. A list of 6 meal names appears with slot dropdowns and Accept/✕ buttons
5. Accepting a suggestion fills the correct slot's title and removes that suggestion from the list
6. The slot dropdown updates across remaining suggestions as slots get filled
7. The "Suggest meals" button disappears when all 5 slots are filled
8. Dismissing a suggestion removes it from the list without filling any slot

- [ ] **Step 9: Commit**

```bash
git add app/WeekView.tsx
git commit -m "feat: wire up MealSuggestions in WeekView"
```
