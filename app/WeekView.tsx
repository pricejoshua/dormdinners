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

/** Builds exactly MEAL_COUNT slots, placing each meal in its day_of_week slot.
 *  Meals without day_of_week fill empty slots in created_at order (legacy data). */
function buildSlots(meals: MealWithIngredients[]): Slot[] {
  const slots: (Slot | null)[] = Array(MEAL_COUNT).fill(null);

  const unplaced: MealWithIngredients[] = [];
  for (const m of meals) {
    if (m.day_of_week != null && m.day_of_week >= 0 && m.day_of_week < MEAL_COUNT) {
      slots[m.day_of_week] = { key: m.id, id: m.id, title: m.title, ingredients: m.ingredients };
    } else {
      unplaced.push(m);
    }
  }

  for (let i = 0; i < MEAL_COUNT; i++) {
    if (slots[i] === null) {
      const m = unplaced.shift();
      slots[i] = m
        ? { key: m.id, id: m.id, title: m.title, ingredients: m.ingredients }
        : { key: crypto.randomUUID(), id: null, title: '', ingredients: [] };
    }
  }

  return slots as Slot[];
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
