"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReferencePriceRow } from "@/types/database";
import { unitPrice } from "@/lib/prices/unitPrice";
import { CURATED_INGREDIENTS } from "@/config/curated-ingredients";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORE_SUGGESTIONS = [
  "Costco",
  "Real Canadian Superstore",
  "Save-On-Foods",
  "No Frills",
  "Walmart",
  "Safeway",
  "T&T Supermarket",
  "Wholesale Club",
];

const SIZE_UNITS = ["kg", "g", "lb", "oz", "L", "ml", "ea", "pack"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RowState {
  tempId?: string; // set = unsaved local row awaiting POST
  item: ReferencePriceRow;
  priceInput: string; // editable string buffer for the numeric price
  sizeInput: string; // editable string buffer for size_amount
  error: string | null;
  saving: boolean;
  dirty: boolean;
}

interface PricesTableProps {
  initialItems: ReferencePriceRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normStaple(name: string): string {
  return name.trim().toLowerCase();
}

function rowUnitPrice(r: RowState) {
  const price = parseFloat(r.priceInput);
  const size = r.sizeInput.trim() === "" ? null : parseFloat(r.sizeInput);
  if (!Number.isFinite(price)) return null;
  return unitPrice({ price, size_amount: size, size_unit: r.item.size_unit });
}

function formatAgo(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const days = Math.floor((Date.now() - then) / 86_400_000);
    if (days <= 0) return "today";
    if (days === 1) return "1 day ago";
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    return months === 1 ? "1 month ago" : `${months} months ago`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PricesTable({ initialItems }: PricesTableProps) {
  // ---- editor identity (localStorage, mirrors pantry) ----------------------
  const [editorName, setEditorName] = useState("");
  useEffect(() => {
    setEditorName(localStorage.getItem("reference_prices_updated_by") ?? "");
  }, []);
  const rememberEditor = useCallback((name: string) => {
    const t = name.trim();
    if (t) localStorage.setItem("reference_prices_updated_by", t);
  }, []);

  // ---- rows ----------------------------------------------------------------
  const [rows, setRows] = useState<RowState[]>(() =>
    initialItems.map((item) => ({
      item,
      priceInput: String(item.price),
      sizeInput: item.size_amount != null ? String(item.size_amount) : "",
      error: null,
      saving: false,
      dirty: false,
    }))
  );
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  });

  const rowKey = (r: RowState) => r.tempId ?? r.item.id;

  const patchRow = useCallback((key: string, updates: Partial<RowState>) => {
    setRows((prev) => prev.map((r) => (rowKey(r) === key ? { ...r, ...updates } : r)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = useCallback(
    (key: string, patch: Partial<Omit<RowState, "item">> & { item?: Partial<ReferencePriceRow> }) => {
      setRows((prev) =>
        prev.map((r) => {
          if (rowKey(r) !== key) return r;
          const { item, ...rest } = patch;
          return { ...r, ...rest, item: item ? { ...r.item, ...item } : r.item, dirty: true };
        })
      );
    },
    []
  );

  // ---- save (POST new / PATCH existing) ------------------------------------
  const saveRow = useCallback(
    async (key: string) => {
      const row = rowsRef.current.find((r) => rowKey(r) === key);
      if (!row || row.saving) return;
      if (!row.item.name.trim() || !row.item.store.trim()) {
        patchRow(key, { error: "Staple and store are required" });
        return;
      }
      const price = parseFloat(row.priceInput);
      if (!Number.isFinite(price) || price < 0) {
        patchRow(key, { error: "Enter a valid price" });
        return;
      }
      const size = row.sizeInput.trim() === "" ? null : parseFloat(row.sizeInput);
      if (size != null && (!Number.isFinite(size) || size <= 0)) {
        patchRow(key, { error: "Size must be a positive number or blank" });
        return;
      }

      patchRow(key, { saving: true, error: null });
      if (editorName.trim()) rememberEditor(editorName);

      const isNew = !!row.tempId;
      const url = isNew ? "/api/reference-prices" : `/api/reference-prices/${row.item.id}`;
      const body = {
        name: row.item.name,
        store: row.item.store,
        price,
        size_amount: size,
        size_unit: row.item.size_unit,
        notes: row.item.notes,
        updated_by: editorName.trim() || null,
      };

      try {
        const res = await fetch(url, {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          patchRow(key, { saving: false, error: json.error ?? "Save failed" });
          return;
        }
        const saved = (await res.json()) as ReferencePriceRow;
        setRows((prev) =>
          prev.map((r) =>
            rowKey(r) === key
              ? {
                  item: saved,
                  priceInput: String(saved.price),
                  sizeInput: saved.size_amount != null ? String(saved.size_amount) : "",
                  error: null,
                  saving: false,
                  dirty: false,
                }
              : r
          )
        );
      } catch {
        patchRow(key, { saving: false, error: "Network error" });
      }
    },
    [editorName, patchRow, rememberEditor]
  );

  const handleAddRow = useCallback(() => {
    const tempId = `temp-${Date.now()}`;
    const now = new Date().toISOString();
    setRows((prev) => [
      ...prev,
      {
        tempId,
        item: {
          id: "",
          name: "",
          store: "",
          price: 0,
          size_amount: null,
          size_unit: "kg",
          notes: null,
          updated_by: editorName.trim() || null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
        priceInput: "",
        sizeInput: "",
        error: null,
        saving: false,
        dirty: true,
      },
    ]);
  }, [editorName]);

  const handleCancelNew = useCallback((tempId: string) => {
    setRows((prev) => prev.filter((r) => r.tempId !== tempId));
  }, []);

  const handleDelete = useCallback((key: string, id: string) => {
    const snapshot = rowsRef.current.find((r) => rowKey(r) === key);
    setRows((prev) => prev.filter((r) => rowKey(r) !== key));
    void (async () => {
      try {
        const res = await fetch(`/api/reference-prices/${id}`, { method: "DELETE" });
        if (!res.ok && res.status !== 204 && snapshot) {
          setRows((prev) => [...prev, { ...snapshot, error: "Delete failed — restored" }]);
        }
      } catch {
        if (snapshot) setRows((prev) => [...prev, { ...snapshot, error: "Network error — restored" }]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- derived: sort by staple then $/unit; mark cheapest per (staple,family)
  const { sorted, cheapestKeys } = useMemo(() => {
    const cheapest = new Map<string, { key: string; perValue: number }>();
    for (const r of rows) {
      const up = rowUnitPrice(r);
      if (!up) continue;
      const groupKey = `${normStaple(r.item.name)}|${up.perUnit}`;
      const cur = cheapest.get(groupKey);
      if (!cur || up.perValue < cur.perValue) {
        cheapest.set(groupKey, { key: rowKey(r), perValue: up.perValue });
      }
    }
    const cheapestKeys = new Set([...cheapest.values()].map((v) => v.key));

    const sorted = [...rows].sort((a, b) => {
      const sa = normStaple(a.item.name);
      const sb = normStaple(b.item.name);
      if (sa !== sb) return sa < sb ? -1 : 1;
      const pa = rowUnitPrice(a)?.perValue ?? Infinity;
      const pb = rowUnitPrice(b)?.perValue ?? Infinity;
      return pa - pb;
    });
    return { sorted, cheapestKeys };
  }, [rows]);

  // Staple autocomplete: existing names + curated list (deduped).
  const stapleSuggestions = useMemo(() => {
    const set = new Set<string>(CURATED_INGREDIENTS);
    for (const r of rows) if (r.item.name.trim()) set.add(r.item.name.trim());
    return [...set].sort();
  }, [rows]);

  return (
    <div>
      {/* Editor identity */}
      <div className="mb-3 flex items-center gap-2 text-sm">
        <label htmlFor="editor-name" className="text-gray-600">
          Your name:
        </label>
        <input
          id="editor-name"
          type="text"
          value={editorName}
          onChange={(e) => setEditorName(e.target.value)}
          onBlur={() => rememberEditor(editorName)}
          className="border border-gray-300 rounded px-2 py-0.5 text-sm w-40 focus:outline-none focus:ring-1 focus:ring-gray-400"
          placeholder="e.g. Alex"
        />
      </div>

      <datalist id="staple-suggestions">
        {stapleSuggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="store-suggestions">
        {STORE_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-300 text-left text-xs uppercase text-gray-500 tracking-wide">
              <th className="py-1.5 pr-3 font-medium w-44">Staple</th>
              <th className="py-1.5 pr-3 font-medium w-44">Store</th>
              <th className="py-1.5 pr-3 font-medium w-20">Price</th>
              <th className="py-1.5 pr-3 font-medium w-28">Size</th>
              <th className="py-1.5 pr-3 font-medium w-24 whitespace-nowrap">$/unit</th>
              <th className="py-1.5 pr-3 font-medium w-24 whitespace-nowrap">Updated</th>
              <th className="py-1.5 w-20" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-gray-400 text-sm">
                  No reference prices yet — add your first below.
                </td>
              </tr>
            )}
            {sorted.map((row) => {
              const key = rowKey(row);
              const isTemp = !!row.tempId;
              const unsaved = isTemp || row.dirty;
              const up = rowUnitPrice(row);
              const isCheapest = up != null && cheapestKeys.has(key);

              return (
                <Fragment key={key}>
                  <tr className={`border-b border-gray-100 hover:bg-gray-50${unsaved ? " bg-amber-50/50" : ""}`}>
                    <td className="py-1 pr-3">
                      <input
                        type="text"
                        list="staple-suggestions"
                        value={row.item.name}
                        aria-label="Staple"
                        onChange={(e) => setField(key, { item: { name: e.target.value } })}
                        className="w-full bg-transparent border-b border-transparent focus:border-gray-400 focus:outline-none py-0.5 text-sm"
                        placeholder="e.g. chicken thighs"
                        disabled={row.saving}
                      />
                    </td>
                    <td className="py-1 pr-3">
                      <input
                        type="text"
                        list="store-suggestions"
                        value={row.item.store}
                        aria-label="Store"
                        onChange={(e) => setField(key, { item: { store: e.target.value } })}
                        className="w-full bg-transparent border-b border-transparent focus:border-gray-400 focus:outline-none py-0.5 text-sm"
                        placeholder="e.g. Costco"
                        disabled={row.saving}
                      />
                    </td>
                    <td className="py-1 pr-3">
                      <div className="flex items-center">
                        <span className="text-gray-400">$</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.priceInput}
                          aria-label="Price"
                          onChange={(e) => setField(key, { priceInput: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") void saveRow(key); }}
                          className="w-16 bg-transparent border-b border-transparent focus:border-gray-400 focus:outline-none py-0.5 text-sm"
                          placeholder="0.00"
                          disabled={row.saving}
                        />
                      </div>
                    </td>
                    <td className="py-1 pr-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={row.sizeInput}
                          aria-label="Size amount"
                          onChange={(e) => setField(key, { sizeInput: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") void saveRow(key); }}
                          className="w-12 bg-transparent border-b border-transparent focus:border-gray-400 focus:outline-none py-0.5 text-sm"
                          placeholder="2"
                          disabled={row.saving}
                        />
                        <select
                          value={row.item.size_unit ?? "kg"}
                          aria-label="Size unit"
                          onChange={(e) => setField(key, { item: { size_unit: e.target.value } })}
                          className="bg-transparent border-b border-transparent focus:border-gray-400 focus:outline-none py-0.5 text-sm text-gray-600"
                          disabled={row.saving}
                        >
                          {SIZE_UNITS.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-1 pr-3 whitespace-nowrap text-xs">
                      {up ? (
                        <span className={isCheapest ? "text-green-700 font-semibold" : "text-gray-600"}>
                          ${up.perValue}/{up.perUnit}
                          {isCheapest && <span className="ml-1 text-green-600">best</span>}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-1 pr-3 text-gray-400 text-xs whitespace-nowrap">
                      {isTemp ? "—" : formatAgo(row.item.updated_at)}
                    </td>
                    <td className="py-1">
                      <div className="flex items-center justify-end gap-2">
                        {unsaved && (
                          <button
                            onClick={() => void saveRow(key)}
                            disabled={row.saving}
                            className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                          >
                            {row.saving ? "Saving…" : "Save"}
                          </button>
                        )}
                        {isTemp ? (
                          <button
                            onClick={() => handleCancelNew(row.tempId!)}
                            aria-label="Discard new price"
                            disabled={row.saving}
                            className="text-gray-300 hover:text-gray-600 text-base leading-none disabled:opacity-50"
                            title="Discard"
                          >
                            ×
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDelete(key, row.item.id)}
                            aria-label={`Delete ${row.item.name} at ${row.item.store}`}
                            disabled={row.saving}
                            className="text-gray-300 hover:text-red-500 text-base leading-none disabled:opacity-50"
                            title="Remove"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {row.error && (
                    <tr className="bg-red-50">
                      <td colSpan={7} className="text-red-600 text-xs px-1 py-0.5">
                        {row.error}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <button
          onClick={handleAddRow}
          className="text-sm text-blue-600 hover:underline border border-dashed border-blue-300 rounded px-3 py-1 hover:bg-blue-50 transition-colors"
        >
          + Add price
        </button>
      </div>
    </div>
  );
}
