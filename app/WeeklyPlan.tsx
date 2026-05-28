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

// Wrapper that threads mode through to the success handler
interface UrlModalWithModeProps {
  mealId: string;
  existingCount: number;
  onClose: () => void;
  onSuccess: (ingredients: MealIngredientRow[], replace: boolean) => void;
}

function UrlModalWithMode({ mealId, existingCount, onClose, onSuccess }: UrlModalWithModeProps) {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'replace' | 'append'>(existingCount > 0 ? 'append' : 'replace');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
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
