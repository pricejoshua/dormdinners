'use client';

import { useCallback, useRef, useState } from 'react';
import type { MealIngredientRow, MealRow } from '@/types/database';

export interface MealWithIngredients extends MealRow {
  ingredients: MealIngredientRow[];
}

interface WeeklyPlanProps {
  meals: MealWithIngredients[];
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
  meal: MealWithIngredients;
  index: number;
}

function MealSlot({ meal, index }: MealSlotProps) {
  const [title, setTitle] = useState(meal.title);
  const [ingredients, setIngredients] = useState<MealIngredientRow[]>(meal.ingredients);
  const [expanded, setExpanded] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const newNameRef = useRef<HTMLInputElement>(null);

  // ── PATCH meal title ──────────────────────────────────────────────────────
  async function saveTitle(next: string) {
    setTitle(next);
    await fetch(`/api/meals/${meal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: next }),
    });
  }

  // ── PATCH ingredient ──────────────────────────────────────────────────────
  async function saveIngredientName(ingId: string, name: string) {
    setIngredients((prev) =>
      prev.map((i) => (i.id === ingId ? { ...i, name } : i)),
    );
    await fetch(`/api/meal-ingredients/${ingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  }

  async function saveIngredientQty(ingId: string, quantity: string) {
    setIngredients((prev) =>
      prev.map((i) => (i.id === ingId ? { ...i, quantity } : i)),
    );
    await fetch(`/api/meal-ingredients/${ingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: quantity || null }),
    });
  }

  // ── DELETE ingredient ─────────────────────────────────────────────────────
  async function removeIngredient(ingId: string) {
    setIngredients((prev) => prev.filter((i) => i.id !== ingId));
    await fetch(`/api/meal-ingredients/${ingId}`, { method: 'DELETE' });
  }

  // ── POST new ingredient ───────────────────────────────────────────────────
  async function addIngredient() {
    const name = newName.trim();
    if (!name) return;
    const qty = newQty.trim();

    const res = await fetch(`/api/meals/${meal.id}/ingredients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, quantity: qty || null }),
    });
    if (res.ok) {
      const ing = await res.json() as MealIngredientRow;
      setIngredients((prev) => [...prev, ing]);
      setNewName('');
      setNewQty('');
      newNameRef.current?.focus();
    }
  }

  // ── URL extraction result ─────────────────────────────────────────────────
  function handleUrlSuccessWithMode(newIngredients: MealIngredientRow[], replaceMode: boolean) {
    if (replaceMode) {
      setIngredients(newIngredients);
    } else {
      setIngredients((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const truly_new = newIngredients.filter((i) => !existingIds.has(i.id));
        return [...prev, ...truly_new];
      });
    }
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
                onClick={() => setShowUrlModal(true)}
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
          mealId={meal.id}
          existingCount={ingredients.length}
          onClose={() => setShowUrlModal(false)}
          onSuccess={handleUrlSuccessWithMode}
        />
      )}
    </li>
  );
}

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

// ─── Main component ──────────────────────────────────────────────────────────

export default function WeeklyPlan({ meals: initialMeals }: WeeklyPlanProps) {
  const [headcount, setHeadcount] = useState<number>(initialMeals[0]?.headcount ?? 1);
  const [headcountInput, setHeadcountInput] = useState<string>(String(initialMeals[0]?.headcount ?? 1));
  const [saving, setSaving] = useState(false);

  async function saveHeadcount() {
    const parsed = parseInt(headcountInput, 10);
    if (isNaN(parsed) || parsed < 1) {
      setHeadcountInput(String(headcount));
      return;
    }
    if (parsed === headcount) return;
    setHeadcount(parsed);
    setSaving(true);
    // Update all 5 meals in parallel
    await Promise.all(
      initialMeals.map((m) =>
        fetch(`/api/meals/${m.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headcount: parsed }),
        }),
      ),
    );
    setSaving(false);
  }

  return (
    <div>
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
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
      </div>

      {/* Meal list */}
      <ul className="border border-gray-200 rounded divide-y divide-gray-200">
        {initialMeals.map((meal, i) => (
          <MealSlot key={meal.id} meal={meal} index={i} />
        ))}
      </ul>
    </div>
  );
}
