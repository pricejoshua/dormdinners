# Lazy Meal Creation + Per-Week Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the app from writing blank/duplicate meal rows on page load, and let the user view and edit any past or future week.

**Architecture:** The "This Week" page stops creating rows on read. It fetches the selected week's meals (0–5) and a new client component `WeekView` pads the UI to 5 slots with browser-only *draft* slots. A draft writes nothing until the user acts on it, at which point a new `POST /api/meals` endpoint creates exactly one row. `WeekView` owns the week navigation (`?week=` URL), the shared headcount, and the live completeness state that gates the per-week Optimize button.

**Tech Stack:** Next.js 14 (App Router, server + client components), React 18, Supabase JS, TypeScript, Vitest (node environment).

**Testing approach:** This repo unit-tests pure functions only (see `lib/**/*.test.ts`); there is no jsdom/route harness. So: the pure week-math helpers get TDD unit tests, and every other task is verified with `npm run build` + `npm run lint` plus explicit manual dev-server checks (including inspecting the meals row count in Supabase). Do not introduce a React/route test harness.

**Reference design:** `docs/superpowers/specs/2026-05-28-lazy-meals-week-nav-design.md`

---

## File structure

| File | Responsibility |
|------|----------------|
| `app/_lib/weekOf.ts` (modify) | Week-date math: `currentMondayISO` (exists), new `toISODate`, `isMondayISO`, `addWeeksISO`. |
| `app/_lib/weekOf.test.ts` (create) | Unit tests for the new helpers. |
| `app/api/meals/route.ts` (create) | `POST` — create one meal for a given week. |
| `app/api/optimize/route.ts` (modify) | Accept optional `{ weekOf }`; default to current week. |
| `app/WeeklyPlan.tsx` (modify) | `MealSlot` gains draft support, `ensureMealId`, and summary reporting. Outer list logic moves to `WeekView`. Exports `MealSlot`, `Slot`, `SlotSummary`, `MealWithIngredients`. |
| `app/WeekView.tsx` (create) | Owns 5 slots, headcount, prev/next week nav; renders `MealSlot`s + `Suggestions`. |
| `app/Suggestions.tsx` (modify) | Receives `complete` + `weekOf`; posts `weekOf` to `/api/optimize`. |
| `app/page.tsx` (modify) | Reads `?week=`; fetch-only `getWeekMeals`; renders `WeekView`. |

---

## Task 1: Week-date helpers (TDD)

**Files:**
- Modify: `app/_lib/weekOf.ts`
- Test: `app/_lib/weekOf.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `app/_lib/weekOf.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isMondayISO, addWeeksISO } from './weekOf';

describe('isMondayISO', () => {
  it('accepts a real Monday', () => {
    expect(isMondayISO('2026-05-25')).toBe(true); // Mon
  });
  it('rejects a non-Monday weekday', () => {
    expect(isMondayISO('2026-05-26')).toBe(false); // Tue
    expect(isMondayISO('2026-05-24')).toBe(false); // Sun
  });
  it('rejects malformed strings', () => {
    expect(isMondayISO('2026-5-25')).toBe(false);
    expect(isMondayISO('not-a-date')).toBe(false);
    expect(isMondayISO('')).toBe(false);
  });
  it('rejects impossible calendar dates', () => {
    expect(isMondayISO('2026-02-30')).toBe(false);
  });
});

describe('addWeeksISO', () => {
  it('steps forward one week', () => {
    expect(addWeeksISO('2026-05-25', 1)).toBe('2026-06-01');
  });
  it('steps back one week', () => {
    expect(addWeeksISO('2026-05-25', -1)).toBe('2026-05-18');
  });
  it('crosses a year boundary', () => {
    expect(addWeeksISO('2026-12-28', 1)).toBe('2027-01-04');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/_lib/weekOf.test.ts`
Expected: FAIL — `isMondayISO`/`addWeeksISO` are not exported.

- [ ] **Step 3: Implement the helpers**

In `app/_lib/weekOf.ts`, add a shared formatter and the two new functions, and refactor `currentMondayISO` to reuse the formatter. Replace the existing file body with:

```ts
/**
 * Returns the ISO date string (YYYY-MM-DD) for a Date in local time.
 */
export function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

/**
 * Returns the ISO date string (YYYY-MM-DD) for Monday of the current week
 * in the server's local timezone.
 */
export function currentMondayISO(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  return toISODate(monday);
}

/**
 * True when `value` is a YYYY-MM-DD string naming a real calendar date
 * that falls on a Monday.
 */
export function isMondayISO(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  // Round-trip guard rejects rolled-over dates like 2026-02-30.
  if (toISODate(d) !== value) return false;
  return d.getDay() === 1;
}

/**
 * Returns the ISO date `weeks` weeks away from `weekOf` (negative = earlier).
 */
export function addWeeksISO(weekOf: string, weeks: number): string {
  const d = new Date(`${weekOf}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return toISODate(d);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/_lib/weekOf.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/weekOf.ts app/_lib/weekOf.test.ts
git commit -m "Add isMondayISO and addWeeksISO week-date helpers"
```

---

## Task 2: `POST /api/meals` endpoint

**Files:**
- Create: `app/api/meals/route.ts`

- [ ] **Step 1: Create the route**

Create `app/api/meals/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase/server';
import { isMondayISO } from '@/app/_lib/weekOf';
import type { MealInsert, MealRow } from '@/types/database';

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  if (typeof raw.week_of !== 'string' || !isMondayISO(raw.week_of)) {
    return NextResponse.json(
      { error: 'week_of must be a Monday in YYYY-MM-DD form' },
      { status: 400 },
    );
  }

  const title = typeof raw.title === 'string' ? raw.title : '';

  let headcount: number | null;
  if (raw.headcount === null || raw.headcount === undefined) {
    headcount = null;
  } else if (typeof raw.headcount === 'number') {
    headcount = raw.headcount;
  } else {
    return NextResponse.json(
      { error: 'headcount must be a number or null' },
      { status: 400 },
    );
  }

  const insert: MealInsert = { title, week_of: raw.week_of, headcount };

  const { data, error } = await supabaseServerClient
    .from('meals')
    .insert(insert)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as MealRow, { status: 201 });
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `npm run lint`
Expected: no errors for `app/api/meals/route.ts`.

- [ ] **Step 3: Manual verification against the running app**

Start the dev server (`npm run dev`) in a separate terminal, then:

```bash
# Valid: creates a meal for the week of Mon 2026-05-25
curl -s -X POST http://localhost:3000/api/meals \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test meal","week_of":"2026-05-25","headcount":4}'
# Expected: 201 with a JSON meal row (id, title "Test meal", week_of, headcount 4)

# Invalid week_of (a Tuesday) is rejected
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/meals \
  -H 'Content-Type: application/json' \
  -d '{"title":"x","week_of":"2026-05-26"}'
# Expected: 400
```

Delete the test row afterward (Supabase dashboard or SQL) so it does not pollute data.

- [ ] **Step 4: Commit**

```bash
git add app/api/meals/route.ts
git commit -m "Add POST /api/meals to create one meal for a week"
```

---

## Task 3: Make `/api/optimize` week-aware

**Files:**
- Modify: `app/api/optimize/route.ts`

- [ ] **Step 1: Read `weekOf` from the request body**

In `app/api/optimize/route.ts`, add the import and replace the handler signature + first line.

Add to the imports at the top:

```ts
import { currentMondayISO, isMondayISO } from '@/app/_lib/weekOf';
```

(Replace the existing `import { currentMondayISO } from '@/app/_lib/weekOf';` line.)

Replace:

```ts
export async function POST(): Promise<NextResponse> {
  const weekOf = currentMondayISO();
```

with:

```ts
export async function POST(request: Request): Promise<NextResponse> {
  // Default to the current week; accept an optional { weekOf } override.
  let weekOf = currentMondayISO();
  try {
    const body = (await request.json()) as { weekOf?: unknown };
    if (typeof body?.weekOf === 'string' && isMondayISO(body.weekOf)) {
      weekOf = body.weekOf;
    }
  } catch {
    // No/invalid body → keep the current-week default.
  }
```

Leave the rest of the handler unchanged.

- [ ] **Step 2: Verify it compiles and lints**

Run: `npm run lint`
Expected: no errors for `app/api/optimize/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/optimize/route.ts
git commit -m "Make /api/optimize accept an optional weekOf"
```

---

## Task 4: Draft support in `MealSlot`

This makes `MealSlot` work for both saved meals and browser-only drafts, routes every write through `ensureMealId`, and reports a live summary upward. After this task the app still behaves the same (page.tsx still supplies saved meals, so `ensureMealId` short-circuits), so it remains runnable.

**Files:**
- Modify: `app/WeeklyPlan.tsx`

- [ ] **Step 1: Replace the top of the file (types) and remove the old default export**

Replace lines 1–12 (the imports, `MealWithIngredients`, `WeeklyPlanProps`) with:

```tsx
'use client';

import { useCallback, useRef, useState } from 'react';
import type { MealIngredientRow, MealRow } from '@/types/database';

export interface MealWithIngredients extends MealRow {
  ingredients: MealIngredientRow[];
}

/** A slot is either a saved meal (`id` set) or a browser-only draft (`id` null). */
export interface Slot {
  key: string;            // stable React key, independent of DB id
  id: string | null;      // DB id; null until the row is created
  title: string;
  ingredients: MealIngredientRow[];
}

/** Live summary a slot reports up to WeekView for the completeness gate. */
export interface SlotSummary {
  id: string | null;
  title: string;
  ingredientCount: number;
}
```

Keep the `InlineEdit` component (lines 14–59) exactly as-is.

- [ ] **Step 2: Replace `MealSlot` (props + body)**

Replace the entire `MealSlot` definition (from `interface MealSlotProps` through the end of the `MealSlot` function, original lines 63–306) with:

```tsx
interface MealSlotProps {
  slot: Slot;
  index: number;
  weekOf: string;
  headcount: number;
  onSummaryChange: (key: string, patch: Partial<SlotSummary>) => void;
}

function MealSlot({ slot, index, weekOf, headcount, onSummaryChange }: MealSlotProps) {
  const [mealId, setMealId] = useState<string | null>(slot.id);
  const [title, setTitle] = useState(slot.title);
  const [ingredients, setIngredients] = useState<MealIngredientRow[]>(slot.ingredients);
  const [expanded, setExpanded] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const newNameRef = useRef<HTMLInputElement>(null);
  // Guards against double-creating the meal when two actions race.
  const createPromise = useRef<Promise<string | null> | null>(null);

  const report = useCallback(
    (patch: Partial<SlotSummary>) => onSummaryChange(slot.key, patch),
    [onSummaryChange, slot.key],
  );

  // ── Lazy creation ───────────────────────────────────────────────────────────
  // Returns the meal id, creating the row on first need. Null on failure.
  async function ensureMealId(titleForCreate?: string): Promise<string | null> {
    if (mealId) return mealId;
    if (!createPromise.current) {
      createPromise.current = (async () => {
        const res = await fetch('/api/meals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: titleForCreate ?? title,
            week_of: weekOf,
            headcount,
          }),
        });
        if (!res.ok) {
          createPromise.current = null; // allow a retry
          return null;
        }
        const meal = (await res.json()) as MealRow;
        setMealId(meal.id);
        report({ id: meal.id });
        return meal.id;
      })();
    }
    return createPromise.current;
  }

  // ── PATCH / create on title commit ────────────────────────────────────────
  async function saveTitle(next: string) {
    setTitle(next);
    report({ title: next });
    if (mealId) {
      await fetch(`/api/meals/${mealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: next }),
      });
    } else if (next.trim() !== '') {
      // First real content → create the row (title goes in the create call).
      await ensureMealId(next);
    }
    // Empty title on a draft writes nothing — slot stays a draft.
  }

  // ── PATCH ingredient ──────────────────────────────────────────────────────
  async function saveIngredientName(ingId: string, name: string) {
    setIngredients((prev) => prev.map((i) => (i.id === ingId ? { ...i, name } : i)));
    await fetch(`/api/meal-ingredients/${ingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  async function saveIngredientQty(ingId: string, quantity: string) {
    setIngredients((prev) => prev.map((i) => (i.id === ingId ? { ...i, quantity } : i)));
    await fetch(`/api/meal-ingredients/${ingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: quantity || null }),
    });
  }

  // ── DELETE ingredient ─────────────────────────────────────────────────────
  async function removeIngredient(ingId: string) {
    setIngredients((prev) => {
      const next = prev.filter((i) => i.id !== ingId);
      report({ ingredientCount: next.length });
      return next;
    });
    await fetch(`/api/meal-ingredients/${ingId}`, { method: 'DELETE' });
  }

  // ── POST new ingredient (creates the meal first if needed) ──────────────────
  async function addIngredient() {
    const name = newName.trim();
    if (!name) return;
    const qty = newQty.trim();

    const id = await ensureMealId();
    if (!id) return;

    const res = await fetch(`/api/meals/${id}/ingredients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, quantity: qty || null }),
    });
    if (res.ok) {
      const ing = (await res.json()) as MealIngredientRow;
      setIngredients((prev) => {
        const next = [...prev, ing];
        report({ ingredientCount: next.length });
        return next;
      });
      setNewName('');
      setNewQty('');
      newNameRef.current?.focus();
    }
  }

  // ── Open the URL modal, creating the meal first if needed ───────────────────
  async function openUrlModal() {
    const id = await ensureMealId();
    if (id) setShowUrlModal(true);
  }

  // ── URL extraction result ─────────────────────────────────────────────────
  function handleUrlSuccessWithMode(newIngredients: MealIngredientRow[], replaceMode: boolean) {
    setIngredients((prev) => {
      let next: MealIngredientRow[];
      if (replaceMode) {
        next = newIngredients;
      } else {
        const existingIds = new Set(prev.map((i) => i.id));
        next = [...prev, ...newIngredients.filter((i) => !existingIds.has(i.id))];
      }
      report({ ingredientCount: next.length });
      return next;
    });
  }

  return (
    <li className="border-b border-gray-200 last:border-b-0">
      {/* Collapsed header */}
      <button
        type="button"
        className="w-full flex items-center gap-2 py-2 px-0 text-left hover:bg-gray-50 group"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="text-xs text-gray-400 w-5 shrink-0 text-right">{index + 1}.</span>
        <span className="flex-1 text-sm font-medium truncate">
          {title || <span className="text-gray-400 font-normal">Untitled meal</span>}
        </span>
        {ingredients.length > 0 && (
          <span className="text-xs text-gray-400 shrink-0">{ingredients.length} ingredients</span>
        )}
        <span className="text-gray-400 text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="pb-3 pl-7 pr-0 space-y-2">
          {/* Title edit */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-10 shrink-0">Title</span>
            <InlineEdit
              value={title}
              onSave={saveTitle}
              placeholder="e.g. Pasta Primavera"
              className="text-sm font-medium"
              inputClassName="w-48"
            />
          </div>

          {/* Ingredient list */}
          {ingredients.length > 0 && (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-gray-400 text-left">
                  <th className="font-normal pb-1 w-1/2">Ingredient</th>
                  <th className="font-normal pb-1">Qty / unit</th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ing) => (
                  <tr key={ing.id} className="group/row">
                    <td className="py-0.5 pr-2">
                      <InlineEdit
                        value={ing.name}
                        onSave={(v) => saveIngredientName(ing.id, v)}
                        placeholder="ingredient"
                        className="text-sm"
                        inputClassName="w-full"
                      />
                    </td>
                    <td className="py-0.5 pr-2">
                      <InlineEdit
                        value={ing.quantity ?? ''}
                        onSave={(v) => saveIngredientQty(ing.id, v)}
                        placeholder="—"
                        className="text-sm text-gray-600"
                        inputClassName="w-24"
                      />
                    </td>
                    <td className="py-0.5">
                      <button
                        type="button"
                        onClick={() => removeIngredient(ing.id)}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover/row:opacity-100 transition-opacity text-xs"
                        title="Remove"
                        aria-label="Remove ingredient"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Add ingredient row */}
          {addingIngredient ? (
            <div className="flex items-center gap-1">
              <input
                ref={newNameRef}
                autoFocus
                type="text"
                placeholder="ingredient name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { void addIngredient(); }
                  if (e.key === 'Escape') { setAddingIngredient(false); setNewName(''); setNewQty(''); }
                }}
                className="border border-gray-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:border-gray-500 w-36"
              />
              <input
                type="text"
                placeholder="qty"
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { void addIngredient(); }
                  if (e.key === 'Escape') { setAddingIngredient(false); setNewName(''); setNewQty(''); }
                }}
                className="border border-gray-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:border-gray-500 w-20"
              />
              <button
                type="button"
                onClick={() => { void addIngredient(); }}
                className="px-2 py-0.5 text-xs bg-gray-900 text-white rounded hover:bg-gray-700"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => { setAddingIngredient(false); setNewName(''); setNewQty(''); }}
                className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          ) : (
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
                onClick={() => { void openUrlModal(); }}
                className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2"
              >
                Paste recipe URL
              </button>
            </div>
          )}
        </div>
      )}

      {showUrlModal && mealId && (
        <UrlModalWithMode
          mealId={mealId}
          existingCount={ingredients.length}
          onClose={() => setShowUrlModal(false)}
          onSuccess={handleUrlSuccessWithMode}
        />
      )}
    </li>
  );
}

export { MealSlot };
```

- [ ] **Step 3: Keep `UrlModalWithMode`, delete the old `WeeklyPlan` default export**

Leave `UrlModalWithModeProps` and `UrlModalWithMode` (original lines 308–410) unchanged. Delete the entire `// ─── Main component ───` section and the `export default function WeeklyPlan(...)` (original lines 412–469) — that logic moves to `WeekView` in Task 5.

- [ ] **Step 4: Verify it compiles and lints**

Run: `npm run lint`
Expected: `WeeklyPlan.tsx` has no errors. (`app/page.tsx` will report an error about the missing default export — that is expected and fixed in Task 6. Do not "fix" it here.)

- [ ] **Step 5: Commit**

```bash
git add app/WeeklyPlan.tsx
git commit -m "Add draft support and lazy meal creation to MealSlot"
```

---

## Task 5: `WeekView` component + week-aware `Suggestions`

**Files:**
- Create: `app/WeekView.tsx`
- Modify: `app/Suggestions.tsx`

- [ ] **Step 1: Update `Suggestions` to take `complete` + `weekOf`**

In `app/Suggestions.tsx`, replace the `SuggestionsProps` interface, the `mealsComplete` helper, and the component signature/body down through `runOptimize`.

Replace (original lines 95–134):

```tsx
interface SuggestionsProps {
  /** Server-loaded suggestions for this week (all statuses). */
  initial: OptimizationSuggestionRow[];
  /** All 5 meals for the current week — used to decide if the button is enabled. */
  meals: MealWithIngredients[];
}

function mealsComplete(meals: MealWithIngredients[]): boolean {
  if (meals.length < 5) return false;
  return meals.every((m) => m.title.trim().length > 0 && m.ingredients.length > 0);
}

export default function Suggestions({ initial, meals }: SuggestionsProps) {
  const [suggestions, setSuggestions] = useState<OptimizationSuggestionRow[]>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = !loading && mealsComplete(meals);

  async function runOptimize() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/optimize', { method: 'POST' });
```

with:

```tsx
interface SuggestionsProps {
  /** Server-loaded suggestions for this week (all statuses). */
  initial: OptimizationSuggestionRow[];
  /** Whether all 5 slots are complete (live state from WeekView). */
  complete: boolean;
  /** Monday (YYYY-MM-DD) of the week being viewed. */
  weekOf: string;
}

export default function Suggestions({ initial, complete, weekOf }: SuggestionsProps) {
  const [suggestions, setSuggestions] = useState<OptimizationSuggestionRow[]>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = !loading && complete;

  async function runOptimize() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekOf }),
      });
```

Then update the two remaining references to `mealsComplete(meals)` in the JSX `title` attribute (original lines 143–144). Replace:

```tsx
        title={
          !mealsComplete(meals)
            ? 'All 5 meals need a title and at least one ingredient before optimizing.'
            : undefined
        }
```

with:

```tsx
        title={
          !complete
            ? 'All 5 meals need a title and at least one ingredient before optimizing.'
            : undefined
        }
```

Finally, remove the now-unused import of `MealWithIngredients` at the top of the file (original line 5: `import type { MealWithIngredients } from '@/app/WeeklyPlan';`).

- [ ] **Step 2: Create `WeekView`**

Create `app/WeekView.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addWeeksISO } from '@/app/_lib/weekOf';
import {
  MealSlot,
  type MealWithIngredients,
  type Slot,
  type SlotSummary,
} from '@/app/WeeklyPlan';
import Suggestions from '@/app/Suggestions';
import type { OptimizationSuggestionRow } from '@/types/database';

const MEAL_COUNT = 5;

interface WeekViewProps {
  weekOf: string;
  meals: MealWithIngredients[];
  suggestions: OptimizationSuggestionRow[];
}

/** Pads the fetched meals to exactly MEAL_COUNT slots with browser-only drafts. */
function buildSlots(meals: MealWithIngredients[]): Slot[] {
  const slots: Slot[] = meals.slice(0, MEAL_COUNT).map((m) => ({
    key: m.id,
    id: m.id,
    title: m.title,
    ingredients: m.ingredients,
  }));
  while (slots.length < MEAL_COUNT) {
    slots.push({ key: crypto.randomUUID(), id: null, title: '', ingredients: [] });
  }
  return slots;
}

export default function WeekView({ weekOf, meals, suggestions }: WeekViewProps) {
  const router = useRouter();

  // Slots are rebuilt whenever the server hands us a new week's meals.
  const slots = useMemo(() => buildSlots(meals), [meals]);

  const initialHeadcount = meals.find((m) => m.headcount != null)?.headcount ?? 1;
  const [headcount, setHeadcount] = useState<number>(initialHeadcount);
  const [headcountInput, setHeadcountInput] = useState<string>(String(initialHeadcount));
  const [savingHeadcount, setSavingHeadcount] = useState(false);

  // Live per-slot summaries, keyed by stable slot key, for the completeness gate.
  const [summaries, setSummaries] = useState<Map<string, SlotSummary>>(() => {
    const m = new Map<string, SlotSummary>();
    for (const s of slots) {
      m.set(s.key, { id: s.id, title: s.title, ingredientCount: s.ingredients.length });
    }
    return m;
  });

  function handleSummaryChange(key: string, patch: Partial<SlotSummary>) {
    setSummaries((prev) => {
      const next = new Map(prev);
      const existing = next.get(key) ?? { id: null, title: '', ingredientCount: 0 };
      next.set(key, { ...existing, ...patch });
      return next;
    });
  }

  const complete =
    slots.length === MEAL_COUNT &&
    slots.every((s) => {
      const sum = summaries.get(s.key);
      return !!sum && sum.title.trim().length > 0 && sum.ingredientCount > 0;
    });

  async function saveHeadcount() {
    const parsed = parseInt(headcountInput, 10);
    if (isNaN(parsed) || parsed < 1) {
      setHeadcountInput(String(headcount));
      return;
    }
    if (parsed === headcount) return;
    setHeadcount(parsed);
    setSavingHeadcount(true);
    // PATCH only meals that already exist (ids come from live summaries).
    const ids = [...summaries.values()].map((s) => s.id).filter((x): x is string => !!x);
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/meals/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headcount: parsed }),
        }),
      ),
    );
    setSavingHeadcount(false);
  }

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => router.push(`/?week=${addWeeksISO(weekOf, -1)}`)}
          className="text-sm text-gray-500 hover:text-gray-900 px-2 py-1"
          aria-label="Previous week"
        >
          ‹ Prev
        </button>
        <span className="text-xs text-gray-400">Week of {weekOf}</span>
        <button
          type="button"
          onClick={() => router.push(`/?week=${addWeeksISO(weekOf, 1)}`)}
          className="text-sm text-gray-500 hover:text-gray-900 px-2 py-1"
          aria-label="Next week"
        >
          Next ›
        </button>
      </div>

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

      {/* Meal list */}
      <ul className="border border-gray-200 rounded divide-y divide-gray-200">
        {slots.map((slot, i) => (
          <MealSlot
            key={slot.key}
            slot={slot}
            index={i}
            weekOf={weekOf}
            headcount={headcount}
            onSummaryChange={handleSummaryChange}
          />
        ))}
      </ul>

      <Suggestions initial={suggestions} complete={complete} weekOf={weekOf} />
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles and lints**

Run: `npm run lint`
Expected: `WeekView.tsx` and `Suggestions.tsx` have no errors. (`app/page.tsx` may still error on its `WeeklyPlan` default import — fixed in Task 6.)

- [ ] **Step 4: Commit**

```bash
git add app/WeekView.tsx app/Suggestions.tsx
git commit -m "Add WeekView with week nav; make Suggestions take live completeness"
```

---

## Task 6: Convert `page.tsx` to fetch-only + render `WeekView`

This is the flip that stops eager row creation and activates per-week viewing.

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Rewrite `page.tsx`**

Replace the entire contents of `app/page.tsx` with:

```tsx
import { supabaseServerClient } from '@/lib/supabase/server';
import { currentMondayISO, isMondayISO } from '@/app/_lib/weekOf';
import WeekView from '@/app/WeekView';
import type { MealWithIngredients } from '@/app/WeeklyPlan';
import type { MealRow, MealIngredientRow, OptimizationSuggestionRow } from '@/types/database';

export const dynamic = 'force-dynamic';

/**
 * Fetches (without creating) the meals for a given week, ordered oldest-first.
 */
async function getWeekMeals(weekOf: string): Promise<MealRow[]> {
  const { data, error } = await supabaseServerClient
    .from('meals')
    .select('*')
    .eq('week_of', weekOf)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch meals: ${error.message}`);
  }
  return data ?? [];
}

interface PageProps {
  searchParams: { week?: string };
}

export default async function ThisWeekPage({ searchParams }: PageProps) {
  const weekOf =
    typeof searchParams.week === 'string' && isMondayISO(searchParams.week)
      ? searchParams.week
      : currentMondayISO();

  let meals: MealRow[];
  try {
    meals = await getWeekMeals(weekOf);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return (
      <div>
        <h1 className="text-lg font-semibold mb-4">This Week</h1>
        <p className="text-sm text-red-600">Failed to load meals: {message}</p>
      </div>
    );
  }

  // Fetch ingredients for the fetched meals (skip the query when there are none).
  const mealIds = meals.map((m) => m.id);
  const { data: allIngredients } =
    mealIds.length > 0
      ? await supabaseServerClient
          .from('meal_ingredients')
          .select('*')
          .in('meal_id', mealIds)
          .order('created_at', { ascending: true })
      : { data: [] as MealIngredientRow[] };

  const ingredientsByMeal = new Map<string, MealIngredientRow[]>();
  for (const ing of allIngredients ?? []) {
    if (!ing.meal_id) continue;
    const existing = ingredientsByMeal.get(ing.meal_id) ?? [];
    existing.push(ing);
    ingredientsByMeal.set(ing.meal_id, existing);
  }

  const mealsWithIngredients: MealWithIngredients[] = meals.map((meal) => ({
    ...meal,
    ingredients: ingredientsByMeal.get(meal.id) ?? [],
  }));

  // Load optimization suggestions that reference this week's meals.
  // The Supabase JS client has no uuid[] overlap operator, so we fetch all
  // suggestions and filter client-side (the table stays small).
  const weekMealSet = new Set(mealIds);
  const { data: suggestionsData } = await supabaseServerClient
    .from('optimization_suggestions')
    .select('*')
    .order('created_at', { ascending: false });

  const existingSuggestions: OptimizationSuggestionRow[] = (suggestionsData ?? []).filter((s) => {
    if (!Array.isArray(s.meal_ids)) return false;
    return (s.meal_ids as string[]).some((id) => weekMealSet.has(id));
  });

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">This Week</h1>
      <WeekView weekOf={weekOf} meals={mealsWithIngredients} suggestions={existingSuggestions} />
    </div>
  );
}
```

- [ ] **Step 2: Verify the whole project compiles, lints, and builds**

Run: `npm run lint && npm run build`
Expected: no errors. (The unused `MEAL_COUNT`/`getOrCreateWeekMeals` are gone; the `WeeklyPlan` default-export error from earlier tasks is resolved because nothing imports it anymore.)

- [ ] **Step 3: Run the full unit-test suite**

Run: `npx vitest run`
Expected: PASS (existing suites + the new `weekOf` suite).

- [ ] **Step 4: Manual verification (the core acceptance check)**

With `npm run dev` running and the Supabase meals table open in another window:

1. Note the current row count for this week (after the user's manual cleanup it should be 0 for an untouched fresh week — pick a future week with no data, e.g. navigate Next a few times).
2. Load that empty week → **0 new rows** should appear (this is the core fix). Five empty slots render.
3. Refresh the page 3–4 times → still **0 rows** (no read-triggered creation, no duplicates).
4. Expand slot 1, type a title, press Enter → exactly **1 row** appears for that week.
5. Add an ingredient to slot 2 (which has no title yet) → exactly **1 more row** appears (created on the ingredient action), with an ingredient attached.
6. Clear slot 1's title back to empty and blur → no error; the row remains (it already exists) but no new rows.
7. Click **‹ Prev** / **Next ›** → URL changes to `/?week=YYYY-MM-DD`; the correct week loads and is editable. Refreshing on that URL stays on that week.
8. Fill all 5 slots (title + ≥1 ingredient) → the **Optimize** button enables; click it and confirm suggestions return for that week.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "Fetch-only page with per-week navigation via WeekView"
```

---

## Self-review notes (already applied)

- **Spec coverage:** read-no-write (Task 6) · client drafts (Tasks 4–5) · `POST /api/meals` (Task 2) · lazy first write on title/ingredient/URL (Task 4) · per-week nav with `?week=` (Tasks 5–6) · state lifting for Optimize (Task 5) · per-week Optimize (Tasks 3, 5) · headcount with drafts (Task 5). Cleanup migration intentionally omitted — the user deletes junk rows manually (spec §9).
- **Type consistency:** `Slot`, `SlotSummary`, `MealWithIngredients` are defined in `WeeklyPlan.tsx` (Task 4) and consumed in `WeekView.tsx` (Task 5). `ensureMealId`, `onSummaryChange`, `handleSummaryChange` names match across tasks. `Suggestions` prop set (`initial`, `complete`, `weekOf`) is consistent between Task 5 step 1 and the `WeekView` render.
- **No placeholders:** every code step contains complete code; manual-verification steps list exact commands and expected results.
