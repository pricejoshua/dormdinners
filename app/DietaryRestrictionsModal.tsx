'use client';

import { useState } from 'react';

interface DietaryRestrictionsModalProps {
  weekOf: string;
  standing: string;
  weekOverride: string | null;
  onClose: () => void;
  onSaved: (standing: string, weekOverride: string | null) => void;
}

export default function DietaryRestrictionsModal({
  weekOf,
  standing,
  weekOverride,
  onClose,
  onSaved,
}: DietaryRestrictionsModalProps) {
  const [standingInput, setStandingInput] = useState(standing);
  const [weekInput, setWeekInput] = useState(weekOverride ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const promises: Promise<Response>[] = [];

      if (standingInput.trim() !== standing.trim()) {
        promises.push(
          fetch('/api/settings/dietary-restrictions', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: standingInput.trim() }),
          }),
        );
      }

      const trimmedWeek = weekInput.trim();
      const currentOverrideTrimmed = (weekOverride ?? '').trim();
      if (trimmedWeek !== currentOverrideTrimmed) {
        if (trimmedWeek === '' && weekOverride !== null) {
          promises.push(
            fetch(`/api/week-settings/${weekOf}/dietary-restrictions`, { method: 'DELETE' }),
          );
        } else if (trimmedWeek !== '') {
          promises.push(
            fetch(`/api/week-settings/${weekOf}/dietary-restrictions`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ value: trimmedWeek }),
            }),
          );
        }
      }

      const results = await Promise.all(promises);
      if (results.some((r) => !r.ok)) {
        setError('Failed to save. Please try again.');
        return;
      }

      onSaved(standingInput.trim(), trimmedWeek !== '' ? trimmedWeek : null);
      onClose();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white border border-gray-300 rounded p-4 w-full max-w-sm mx-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-4">Dietary restrictions</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Standing restrictions
              <span className="ml-1 text-gray-400">(applies every week unless overridden)</span>
            </label>
            <textarea
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-500 resize-none"
              rows={2}
              placeholder="e.g. no nuts, vegetarian"
              value={standingInput}
              onChange={(e) => setStandingInput(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              This week only
              <span className="ml-1 text-gray-400">(replaces standing restrictions for this week)</span>
            </label>
            <textarea
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gray-500 resize-none"
              rows={2}
              placeholder="Leave blank to use standing restrictions"
              value={weekInput}
              onChange={(e) => setWeekInput(e.target.value)}
            />
            {weekOverride !== null && weekOverride !== '' && (
              <button
                type="button"
                onClick={() => setWeekInput('')}
                className="mt-1 text-xs text-gray-500 underline underline-offset-2 hover:text-gray-900"
              >
                Clear override
              </button>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { void handleSave(); }}
            disabled={saving}
            className="px-3 py-1 text-sm bg-gray-900 text-white rounded disabled:opacity-50 hover:bg-gray-700"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
