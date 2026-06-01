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
  reason: string;
  emptySlots: SuggestionSlot[];
  onAccept: (slotKey: string) => void;
  onDismiss: () => void;
}

function SuggestionItem({ name, reason, emptySlots, onAccept, onDismiss }: SuggestionItemProps) {
  const [preferredKey, setPreferredKey] = useState<string>(
    emptySlots[0]?.key ?? '',
  );
  const [showReason, setShowReason] = useState(false);

  const validKey =
    emptySlots.find((s) => s.key === preferredKey)?.key ?? emptySlots[0]?.key ?? '';
  const canAccept = validKey !== '';

  return (
    <li className="py-1.5 border-b border-gray-100 last:border-b-0 text-sm">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowReason((v) => !v)}
          className="text-gray-400 hover:text-gray-600 text-xs shrink-0 w-3 text-left"
          aria-label={showReason ? 'Hide reason' : 'Show reason'}
        >
          {showReason ? '▾' : '▸'}
        </button>

        <span className="flex-1 text-gray-800">{name}</span>

        {canAccept && (
          <select
            value={validKey}
            onChange={(e) => setPreferredKey(e.target.value)}
            className="text-xs border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-gray-500 shrink-0"
          >
            {emptySlots.map((s) => (
              <option key={s.key} value={s.key}>
                {(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const)[s.index] ?? `Slot ${s.index + 1}`}
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
      </div>

      {showReason && (
        <p className="mt-1 ml-5 text-xs text-gray-500 leading-relaxed">{reason}</p>
      )}
    </li>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MealSuggestions({ weekOf, slots, onAccept }: MealSuggestionsProps) {
  const [showModal, setShowModal] = useState(false);
  const [suggestions, setSuggestions] = useState<{ name: string; reason: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

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
      const json = (await res.json()) as { suggestions?: { name: string; reason: string }[]; error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Suggestion failed.');
      } else {
        setSuggestions(json.suggestions ?? []);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }

  function handleAccept(name: string, slotKey: string) {
    onAccept(slotKey, name);
    setSuggestions((prev) => prev.filter((s) => s.name !== name));
  }

  function handleDismiss(name: string) {
    setSuggestions((prev) => prev.filter((s) => s.name !== name));
  }

  if (!hasEmptySlots && suggestions.length === 0 && !loading) return null;

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

      {!loading && hasFetched && suggestions.length === 0 && !error && (
        <p className="mt-2 text-xs text-gray-500">No suggestions generated. Try adding more meals or adjusting your preferences.</p>
      )}

      {suggestions.length > 0 && (
        <ul className="mt-3 border border-gray-200 rounded">
          {suggestions.map((suggestion, i) => (
            <SuggestionItem
              key={i}
              name={suggestion.name}
              reason={suggestion.reason}
              emptySlots={emptySlots}
              onAccept={(slotKey) => handleAccept(suggestion.name, slotKey)}
              onDismiss={() => handleDismiss(suggestion.name)}
            />
          ))}
        </ul>
      )}

      {!hasEmptySlots && suggestions.length > 0 && (
        <p className="mt-2 text-xs text-gray-500 text-center">All slots are filled.</p>
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
