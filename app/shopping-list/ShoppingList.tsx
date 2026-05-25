"use client";

/**
 * ShoppingList — client component
 *
 * Renders the shopping list grouped by assigned_store, with a "Store unknown"
 * bucket at the bottom for items with no store.
 *
 * Features:
 * - Large checkboxes for mobile one-handed use
 * - "have it" pill for pantry_match items
 * - Flipp price display if a Flipp row is available (with stale marker)
 * - Checked rows visually de-emphasised (not hidden)
 * - Regenerate button at top
 * - Notes derived from accepted bulk_buy / overlap suggestions
 */

import { useState, useTransition } from "react";
import type { ShoppingListItemRow, FlippCacheRow, OptimizationSuggestionRow } from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoreGroup {
  store: string | null; // null = "Store unknown"
  items: ShoppingListItemRow[];
}

interface Props {
  groups: StoreGroup[];
  flippById: Record<string, FlippCacheRow>;
  acceptedSuggestions: OptimizationSuggestionRow[];
}

// ---------------------------------------------------------------------------
// Helper: derive a note for an item from accepted suggestions
// ---------------------------------------------------------------------------

function deriveNote(
  itemName: string,
  suggestions: OptimizationSuggestionRow[]
): string | null {
  const normName = itemName.trim().toLowerCase();
  const notes: string[] = [];

  for (const s of suggestions) {
    if (
      (s.suggestion_type === "bulk_buy" || s.suggestion_type === "overlap") &&
      s.description &&
      s.description.toLowerCase().includes(normName)
    ) {
      notes.push(s.description);
    }
  }

  return notes.length > 0 ? notes.join("; ") : null;
}

// ---------------------------------------------------------------------------
// Sub-component: a single shopping list row
// ---------------------------------------------------------------------------

interface RowProps {
  item: ShoppingListItemRow;
  flipp: FlippCacheRow | null;
  note: string | null;
  onToggle: (id: string, checked: boolean) => void;
  isPending: boolean;
}

function ShoppingRow({ item, flipp, note, onToggle, isPending }: RowProps) {
  const isStale =
    flipp?.valid_to != null && new Date(flipp.valid_to) < new Date();

  return (
    <li
      className={[
        "flex items-start gap-3 py-2 border-b border-gray-100 last:border-0",
        item.checked_off ? "opacity-40" : "",
      ].join(" ")}
    >
      {/* Large checkbox for mobile */}
      <input
        type="checkbox"
        checked={item.checked_off}
        disabled={isPending}
        onChange={(e) => onToggle(item.id, e.target.checked)}
        className="mt-1 h-5 w-5 flex-shrink-0 cursor-pointer accent-green-600"
        aria-label={`Mark ${item.name} as ${item.checked_off ? "unchecked" : "checked"}`}
      />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {/* Name */}
          <span
            className={[
              "text-sm font-medium",
              item.checked_off ? "line-through text-gray-400" : "text-gray-900",
            ].join(" ")}
          >
            {item.name}
          </span>

          {/* Quantity */}
          {item.quantity && (
            <span className="text-xs text-gray-500">{item.quantity}</span>
          )}

          {/* Have it pill */}
          {item.pantry_match && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
              have it
            </span>
          )}
        </div>

        {/* Flipp price row */}
        {flipp && (
          <p
            className={[
              "text-xs mt-0.5",
              isStale ? "text-orange-500" : "text-blue-600",
            ].join(" ")}
          >
            {flipp.current_price != null && (
              <>
                ${flipp.current_price.toFixed(2)}
                {flipp.post_price_text ? ` ${flipp.post_price_text}` : ""}
                {flipp.merchant_name ? ` at ${flipp.merchant_name}` : ""}
              </>
            )}
            {isStale && (
              <span className="ml-1 text-orange-400" title="Flipp data may be outdated">
                (stale)
              </span>
            )}
          </p>
        )}

        {/* Note from bulk_buy / overlap suggestion */}
        {note && (
          <p className="text-xs text-gray-400 mt-0.5 italic">{note}</p>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ShoppingList({
  groups,
  flippById,
  acceptedSuggestions,
}: Props) {
  // Local state so toggling is instant (optimistic)
  const [checkedState, setCheckedState] = useState<Record<string, boolean>>(
    () => {
      const map: Record<string, boolean> = {};
      for (const g of groups) {
        for (const item of g.items) {
          map[item.id] = item.checked_off;
        }
      }
      return map;
    }
  );

  const [isRegenerating, startRegenerate] = useTransition();
  const [regenError, setRegenError] = useState<string | null>(null);

  // Toggle handler — optimistic update then PATCH
  async function handleToggle(id: string, checked: boolean) {
    setCheckedState((prev) => ({ ...prev, [id]: checked }));
    try {
      const res = await fetch(`/api/shopping-list/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked_off: checked }),
      });
      if (!res.ok) {
        // Revert on error
        setCheckedState((prev) => ({ ...prev, [id]: !checked }));
      }
    } catch {
      setCheckedState((prev) => ({ ...prev, [id]: !checked }));
    }
  }

  // Regenerate handler
  function handleRegenerate() {
    setRegenError(null);
    startRegenerate(async () => {
      try {
        const res = await fetch("/api/shopping-list/generate", {
          method: "POST",
        });
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          setRegenError(body.error ?? "Regeneration failed");
          return;
        }
        // Full page reload to show new data from server component
        window.location.reload();
      } catch (err) {
        setRegenError(err instanceof Error ? err.message : "Regeneration failed");
      }
    });
  }

  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);
  const checkedCount = Object.values(checkedState).filter(Boolean).length;

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Shopping List</h1>
          {totalItems > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {checkedCount}/{totalItems} checked off
            </p>
          )}
        </div>
        <button
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRegenerating ? "Regenerating…" : "Regenerate"}
        </button>
      </div>

      {/* Regen error */}
      {regenError && (
        <p className="text-xs text-red-600 mb-3 p-2 bg-red-50 rounded">
          {regenError}
        </p>
      )}

      {/* Empty state */}
      {groups.length === 0 && (
        <p className="text-sm text-gray-400">
          No items yet — add meals for this week and click Regenerate.
        </p>
      )}

      {/* Store groups */}
      {groups.map((group) => (
        <section key={group.store ?? "__unknown__"} className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1 pb-1 border-b border-gray-200">
            {group.store ?? "Store unknown"}
          </h2>
          <ul>
            {group.items.map((item) => {
              const flipp = item.flipp_cache_id
                ? (flippById[item.flipp_cache_id] ?? null)
                : null;
              const note = deriveNote(item.name, acceptedSuggestions);
              return (
                <ShoppingRow
                  key={item.id}
                  item={{ ...item, checked_off: checkedState[item.id] ?? item.checked_off }}
                  flipp={flipp}
                  note={note}
                  onToggle={handleToggle}
                  isPending={isRegenerating}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
