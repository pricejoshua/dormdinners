'use client';

import { useEffect, useState } from 'react';

interface VerifyDietaryModalProps {
  mealId: string;
  mealTitle: string;
  onClose: () => void;
}

export default function VerifyDietaryModal({ mealId, mealTitle, onClose }: VerifyDietaryModalProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<{ ok: boolean; adaptations: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/meals/${mealId}/verify-dietary`)
      .then(async (res) => {
        const json = (await res.json()) as { ok?: boolean; adaptations?: string[]; error?: string };
        if (!res.ok) {
          setError(json.error ?? 'Verification failed.');
        } else {
          setResult({ ok: json.ok ?? true, adaptations: json.adaptations ?? [] });
        }
      })
      .catch(() => setError('Network error. Please try again.'))
      .finally(() => setLoading(false));
  }, [mealId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white border border-gray-300 rounded p-4 w-full max-w-sm mx-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-3">Dietary check — {mealTitle}</h3>

        {loading && (
          <p className="text-sm text-gray-500">Checking restrictions…</p>
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
        )}

        {result && (
          result.ok ? (
            <p className="text-sm text-green-700">✓ Works as-is for everyone.</p>
          ) : (
            <div>
              <p className="text-sm text-gray-700 mb-2">Adaptations needed:</p>
              <ul className="space-y-1 list-disc list-inside">
                {result.adaptations.map((a, i) => (
                  <li key={i} className="text-sm text-gray-600">{a}</li>
                ))}
              </ul>
            </div>
          )
        )}

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
