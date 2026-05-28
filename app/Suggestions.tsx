'use client';

import { useState } from 'react';
import type { OptimizationSuggestionRow } from '@/types/database';
// ── Type pill ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  bulk_buy: 'Bulk buy',
  substitution: 'Substitution',
  overlap: 'Overlap',
  pantry_use: 'Pantry',
};

function TypePill({ type }: { type: string | null }) {
  const label = type ? (TYPE_LABELS[type] ?? type) : '—';
  return (
    <span className="inline-block text-xs border border-gray-300 rounded px-1.5 py-0.5 text-gray-600 shrink-0 whitespace-nowrap">
      {label}
    </span>
  );
}

// ── Single suggestion row ────────────────────────────────────────────────────

interface SuggestionRowProps {
  suggestion: OptimizationSuggestionRow;
}

function SuggestionRow({ suggestion }: SuggestionRowProps) {
  const [status, setStatus] = useState<string>(suggestion.status);
  const [updating, setUpdating] = useState(false);

  const isResolved = status === 'accepted' || status === 'dismissed';

  async function patch(nextStatus: 'accepted' | 'dismissed') {
    setUpdating(true);
    try {
      const res = await fetch(`/api/suggestions/${suggestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setStatus(nextStatus);
      }
    } finally {
      setUpdating(false);
    }
  }

  return (
    <li
      className={`flex items-start gap-2 py-1.5 border-b border-gray-100 last:border-b-0 text-sm${isResolved ? ' opacity-40' : ''}`}
    >
      <TypePill type={suggestion.suggestion_type} />

      <span className="flex-1 text-gray-800">{suggestion.description}</span>

      {suggestion.estimated_saving && (
        <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">
          {suggestion.estimated_saving}
        </span>
      )}

      {!isResolved ? (
        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            disabled={updating}
            onClick={() => void patch('accepted')}
            className="text-xs px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            disabled={updating}
            onClick={() => void patch('dismissed')}
            className="text-xs px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      ) : (
        <span className="text-xs text-gray-400 shrink-0 capitalize">{status}</span>
      )}
    </li>
  );
}

// ── Suggestions section (Optimize CTA + list) ─────────────────────────────────

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
      const json = (await res.json()) as {
        suggestions?: OptimizationSuggestionRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? 'Optimization failed.');
      } else {
        // Prepend fresh batch; keep prior suggestions visible below
        setSuggestions((prev) => [...(json.suggestions ?? []), ...prev]);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        disabled={!enabled}
        onClick={() => void runOptimize()}
        title={
          !complete
            ? 'All 5 meals need a title and at least one ingredient before optimizing.'
            : undefined
        }
        className="w-full py-2 text-sm font-medium bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Optimizing…' : 'Optimize'}
      </button>

      {error && (
        <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </p>
      )}

      {suggestions.length > 0 && (
        <ul className="mt-3 border border-gray-200 rounded">
          {suggestions.map((s) => (
            <SuggestionRow key={s.id} suggestion={s} />
          ))}
        </ul>
      )}
    </div>
  );
}
