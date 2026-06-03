'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addWeeksISO } from '@/app/_lib/weekOf';
import {
  MealSlot,
  type MealWithIngredients,
  type Slot,
  type SlotSummary,
} from '@/app/WeeklyPlan';
import Suggestions from '@/app/Suggestions';
import MealSuggestions, { type SuggestionSlot } from '@/app/MealSuggestions';
import type { OptimizationSuggestionRow } from '@/types/database';
import type { PriceRow } from '@/lib/prices/lookup';
import DietaryRestrictionsModal from '@/app/DietaryRestrictionsModal';

const MEAL_COUNT = 5;

interface WeekViewProps {
  weekOf: string;
  meals: MealWithIngredients[];
  suggestions: OptimizationSuggestionRow[];
  referencePrices: PriceRow[];
}

/** Builds exactly MEAL_COUNT slots, placing each meal in its day_of_week slot.
 *  Meals without day_of_week fill empty slots in created_at order (legacy data). */
function buildSlots(meals: MealWithIngredients[]): Slot[] {
  const slots: (Slot | null)[] = Array(MEAL_COUNT).fill(null);

  const toSlot = (m: MealWithIngredients): Slot => ({
    key: m.id,
    id: m.id,
    title: m.title,
    ingredients: m.ingredients,
    serves: m.serves,
    scale_override: m.scale_override,
  });

  const unplaced: MealWithIngredients[] = [];
  for (const m of meals) {
    if (m.day_of_week != null && m.day_of_week >= 0 && m.day_of_week < MEAL_COUNT) {
      slots[m.day_of_week] = toSlot(m);
    } else {
      unplaced.push(m);
    }
  }

  for (let i = 0; i < MEAL_COUNT; i++) {
    if (slots[i] === null) {
      const m = unplaced.shift();
      slots[i] = m
        ? toSlot(m)
        : { key: crypto.randomUUID(), id: null, title: '', ingredients: [], serves: null, scale_override: null };
    }
  }

  return slots as Slot[];
}

export default function WeekView({ weekOf, meals, suggestions, referencePrices }: WeekViewProps) {
  const router = useRouter();

  // Slots are rebuilt whenever the server hands us a new week's meals.
  const slots = useMemo(() => buildSlots(meals), [meals]);

  const initialHeadcount = meals.find((m) => m.headcount != null)?.headcount ?? 1;
  const [headcount, setHeadcount] = useState<number>(initialHeadcount);
  const [headcountInput, setHeadcountInput] = useState<string>(String(initialHeadcount));
  const [savingHeadcount, setSavingHeadcount] = useState(false);
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
  const [pendingTitles, setPendingTitles] = useState<Map<string, string>>(new Map());

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

  const complete =
    slots.length === MEAL_COUNT &&
    slots.every((s) => {
      const sum = summaries.get(s.key);
      return !!sum && sum.title.trim().length > 0 && sum.ingredientCount > 0;
    });

  const suggestionSlots: SuggestionSlot[] = slots.map((s, i) => ({
    key: s.key,
    index: i,
    title: summaries.get(s.key)?.title ?? '',
  }));

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

      {/* Meal list */}
      <ul className="border border-gray-200 rounded divide-y divide-gray-200">
        {slots.map((slot, i) => (
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
        ))}
      </ul>

      <MealSuggestions
        weekOf={weekOf}
        slots={suggestionSlots}
        onAccept={handleSuggestionAccept}
      />
      <Suggestions initial={suggestions} complete={complete} weekOf={weekOf} />
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
    </div>
  );
}
