'use client';

import { useCallback, useRef, useState } from 'react';
import type { MealIngredientRow, MealRow } from '@/types/database';
import { effectiveFactor, scaleQuantity } from '@/lib/recipe/scale';
import { sumWeight } from '@/lib/recipe/weight';

export interface MealWithIngredients extends MealRow {
  ingredients: MealIngredientRow[];
}

/** A slot is either a saved meal (`id` set) or a browser-only draft (`id` null). */
export interface Slot {
  key: string;            // stable React key, independent of DB id
  id: string | null;      // DB id; null until the row is created
  title: string;
  ingredients: MealIngredientRow[];
  serves: number | null;          // recipe's canonical yield
  scale_override: number | null;  // manual factor; null = auto (headcount/serves)
}

/** Live summary a slot reports up to WeekView for the completeness gate. */
export interface SlotSummary {
  id: string | null;
  title: string;
  ingredientCount: number;
}

// ─── Inline editable text ────────────────────────────────────────────────────

interface InlineEditProps {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

function InlineEdit({ value, onSave, placeholder, className = '', inputClassName = '' }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== value) onSave(trimmed || value);
  }, [draft, value, onSave]);

  if (!editing) {
    return (
      <span
        className={`cursor-text ${className}`}
        onClick={() => { setDraft(value); setEditing(true); }}
        title="Click to edit"
      >
        {value || <span className="text-gray-400">{placeholder}</span>}
      </span>
    );
  }

  return (
    <input
      autoFocus
      className={`border border-gray-300 rounded px-1 py-0 text-sm focus:outline-none focus:border-gray-500 ${inputClassName}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { setEditing(false); setDraft(value); }
      }}
    />
  );
}

// ─── Single meal slot ────────────────────────────────────────────────────────

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
  const [serves, setServes] = useState<number | null>(slot.serves);
  const [scaleOverride, setScaleOverride] = useState<number | null>(slot.scale_override);
  const [servesInput, setServesInput] = useState(slot.serves != null ? String(slot.serves) : '');
  const [overrideInput, setOverrideInput] = useState(
    slot.scale_override != null ? String(slot.scale_override) : '',
  );
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
            day_of_week: index,
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

  // ── PATCH serves / scale_override (create the meal first if needed) ────────
  async function patchMeal(patch: Record<string, unknown>) {
    const id = await ensureMealId();
    if (!id) return;
    await fetch(`/api/meals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }

  function saveServes(next: number | null) {
    setServes(next);
    void patchMeal({ serves: next });
  }

  function saveScaleOverride(next: number | null) {
    setScaleOverride(next);
    void patchMeal({ scale_override: next });
  }

  function commitServes() {
    const t = servesInput.trim();
    if (t === '') { if (serves !== null) saveServes(null); return; }
    const n = parseInt(t, 10);
    if (isNaN(n) || n < 1) { setServesInput(serves != null ? String(serves) : ''); return; }
    if (n !== serves) saveServes(n);
  }

  function commitOverride() {
    const t = overrideInput.trim();
    if (t === '') { if (scaleOverride !== null) saveScaleOverride(null); return; }
    const n = parseFloat(t);
    if (isNaN(n) || n <= 0) { setOverrideInput(scaleOverride != null ? String(scaleOverride) : ''); return; }
    if (n !== scaleOverride) saveScaleOverride(n);
  }

  function clearOverride() {
    setOverrideInput('');
    if (scaleOverride !== null) saveScaleOverride(null);
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
    const next = ingredients.filter((i) => i.id !== ingId);
    setIngredients(next);
    report({ ingredientCount: next.length });
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
      const next = [...ingredients, ing];
      setIngredients(next);
      report({ ingredientCount: next.length });
      setNewName('');
      setNewQty('');
      newNameRef.current?.focus();
    }
  }

  // ── Open the URL modal, creating the meal first if needed ───────────────────
  // Open the modal without creating a row; the meal is created on submit
  // (inside the modal) so cancelling never leaves a blank meal behind.
  function openUrlModal() {
    setShowUrlModal(true);
  }

  // ── URL extraction result ─────────────────────────────────────────────────
  function handleUrlSuccessWithMode(newIngredients: MealIngredientRow[], replaceMode: boolean) {
    let next: MealIngredientRow[];
    if (replaceMode) {
      next = newIngredients;
    } else {
      const existingIds = new Set(ingredients.map((i) => i.id));
      next = [...ingredients, ...newIngredients.filter((i) => !existingIds.has(i.id))];
    }
    setIngredients(next);
    report({ ingredientCount: next.length });
  }

  // ── Derived scaling values (recomputed each render) ────────────────────────
  const factor = effectiveFactor({ headcount, serves, scale_override: scaleOverride });
  const isScaled = factor !== 1;
  const fmtFactor = (f: number) => parseFloat(f.toFixed(2)).toString();
  const weight = sumWeight(ingredients, factor);
  const perPersonG =
    weight && headcount > 0 ? Math.round((weight.kg * 1000) / headcount) : null;

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
              className="text-sm "
              inputClassName="w-48"
            />
          </div>

          {/* Serves + scale */}
          <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
            <span className="w-10 shrink-0">Serves</span>
            <input
              type="number"
              min={1}
              value={servesInput}
              onChange={(e) => setServesInput(e.target.value)}
              onBlur={commitServes}
              onKeyDown={(e) => { if (e.key === 'Enter') commitServes(); }}
              placeholder="?"
              className="w-14 border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:border-gray-500"
              title="Recipe's canonical yield"
            />
            <span className="text-gray-300">·</span>
            <span>Scale ×</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={overrideInput}
              onChange={(e) => setOverrideInput(e.target.value)}
              onBlur={commitOverride}
              onKeyDown={(e) => { if (e.key === 'Enter') commitOverride(); }}
              placeholder={serves ? fmtFactor(factor) : 'auto'}
              className="w-14 border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:border-gray-500"
              title="Manual scale factor; leave blank to auto-scale from headcount ÷ serves"
            />
            <span className="text-gray-400">
              {scaleOverride != null
                ? `manual ×${fmtFactor(scaleOverride)}`
                : serves
                  ? `auto ×${fmtFactor(factor)} (${headcount} ÷ ${serves})`
                  : 'set serves to auto-scale'}
            </span>
            {scaleOverride != null && (
              <button
                type="button"
                onClick={clearOverride}
                className="underline underline-offset-2 hover:text-gray-900"
              >
                use auto
              </button>
            )}
          </div>

          {/* Ingredient list */}
          {ingredients.length > 0 && (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-gray-400 text-left">
                  <th className="font-normal pb-1 w-1/2">Ingredient</th>
                  <th className="font-normal pb-1">Qty / unit</th>
                  {isScaled && (
                    <th className="font-normal pb-1">Scaled ×{fmtFactor(factor)}</th>
                  )}
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
                    {isScaled && (
                      <td className="py-0.5 pr-2 text-sm text-gray-900">
                        {scaleQuantity(ing.quantity, factor) || '—'}
                      </td>
                    )}
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

          {/* Weight rollup (mass-unit ingredients only) */}
          {weight && (
            <p className="text-xs text-gray-500">
              ≈ <span className="font-medium text-gray-700">{weight.kg} kg</span> ({weight.lb} lb) of weighed ingredients
              {perPersonG != null && (
                <span className="text-gray-400"> · ≈ {perPersonG} g/person (weighed items only)</span>
              )}
            </p>
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
                onClick={openUrlModal}
                className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2"
              >
                Paste recipe URL
              </button>
            </div>
          )}
        </div>
      )}

      {showUrlModal && (
        <UrlModalWithMode
          ensureMealId={ensureMealId}
          existingCount={ingredients.length}
          onClose={() => setShowUrlModal(false)}
          onSuccess={handleUrlSuccessWithMode}
        />
      )}
    </li>
  );
}

export { MealSlot };

// Wrapper that threads mode through to the success handler
interface UrlModalWithModeProps {
  /** Creates the meal row on demand (or returns the existing id). */
  ensureMealId: () => Promise<string | null>;
  existingCount: number;
  onClose: () => void;
  onSuccess: (ingredients: MealIngredientRow[], replace: boolean) => void;
}

function UrlModalWithMode({ ensureMealId, existingCount, onClose, onSuccess }: UrlModalWithModeProps) {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'replace' | 'append'>(existingCount > 0 ? 'append' : 'replace');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Create the meal only now that the user has committed to extracting.
      const mealId = await ensureMealId();
      if (!mealId) {
        setError('Could not create the meal. Please try again.');
        return;
      }
      const res = await fetch(`/api/meals/${mealId}/extract-from-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), mode }),
      });
      const json = await res.json() as { ingredients?: MealIngredientRow[]; error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Extraction failed. Please add ingredients manually.');
      } else {
        onSuccess(json.ingredients ?? [], mode === 'replace');
        onClose();
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white border border-gray-300 rounded p-4 w-full max-w-sm mx-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-3">Paste recipe URL</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            autoFocus
            type="url"
            required
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-500"
            placeholder="https://www.seriouseats.com/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          {existingCount > 0 && (
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="append"
                  checked={mode === 'append'}
                  onChange={() => setMode('append')}
                />
                Append to existing
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="replace"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                />
                Replace all
              </label>
            </div>
          )}
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="px-3 py-1 text-sm bg-gray-900 text-white rounded disabled:opacity-50 hover:bg-gray-700"
            >
              {loading ? 'Extracting…' : 'Extract ingredients'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
