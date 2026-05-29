"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { PantryItemRow } from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RowState {
  /** undefined = persisted in DB; set = unsaved local row awaiting POST */
  tempId?: string;
  item: PantryItemRow;
  error: string | null;
  saving: boolean;
  /** true when the row has local edits not yet persisted to the DB */
  dirty: boolean;
}

interface PantryTableProps {
  /** Initial rows fetched server-side (non-deleted, ordered by updated_at desc) */
  initialItems: PantryItemRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PantryTable({ initialItems }: PantryTableProps) {
  // ---- editor name (localStorage) ----------------------------------------
  const [editorName, setEditorName] = useState<string>("");
  const [editingName, setEditingName] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem("pantry_updated_by") ?? "";
    setEditorName(stored);
    if (!stored) setEditingName(true);
  }, []);

  const saveName = useCallback(() => {
    const trimmed = editorName.trim();
    if (trimmed) {
      localStorage.setItem("pantry_updated_by", trimmed);
      setEditorName(trimmed);
    }
    setEditingName(false);
  }, [editorName]);

  // ---- row state ----------------------------------------------------------
  const [rows, setRows] = useState<RowState[]>(() =>
    initialItems.map((item) => ({ item, error: null, saving: false, dirty: false }))
  );
  // Mirror of rows kept in a ref so callbacks can read current state without
  // listing `rows` as a dependency (avoids stale closures).
  const rowsRef = useRef<RowState[]>(rows);
  useEffect(() => {
    rowsRef.current = rows;
  });

  // Keep a global error for network-level failures (e.g. add row)
  const [globalError, setGlobalError] = useState<string | null>(null);

  // ---- receipt state -------------------------------------------------------
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [receiptNotice, setReceiptNotice] = useState<{
    type: "success" | "error" | "store-needed";
    message: string;
    pricedItems?: { name: string; price: number }[];
  } | null>(null);
  const [storeInput, setStoreInput] = useState("");
  const [storeSaving, setStoreSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ---- helpers -------------------------------------------------------------
  const rowKey = (r: RowState) => r.tempId ?? r.item.id;

  const patchRow = useCallback(
    (key: string, updates: Partial<RowState>) => {
      setRows((prev) =>
        prev.map((r) => (rowKey(r) === key ? { ...r, ...updates } : r))
      );
    },
    // rowKey is stable (plain fn), setRows is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ---- local edit (no network until the user clicks Save) ------------------
  const handleChange = useCallback(
    (key: string, field: "name" | "notes" | "quantity_unit", value: string) => {
      setRows((prev) =>
        prev.map((r) => {
          if (rowKey(r) !== key) return r;
          return { ...r, item: { ...r.item, [field]: value }, dirty: true };
        })
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleQuantityAmountChange = useCallback((key: string, value: string) => {
    const num = value === "" ? null : parseFloat(value);
    setRows(prev => prev.map(r =>
      rowKey(r) !== key ? r : { ...r, item: { ...r.item, quantity_amount: isNaN(num as number) ? null : num }, dirty: true }
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- save a single row (PATCH for existing, POST for new) ----------------
  const saveRow = useCallback(
    async (key: string) => {
      const row = rowsRef.current.find((r) => rowKey(r) === key);
      if (!row || row.saving) return;
      if (!row.item.name.trim()) return; // can't persist a nameless item

      patchRow(key, { saving: true, error: null });

      const isNew = !!row.tempId;
      const url = isNew ? "/api/pantry" : `/api/pantry/${row.item.id}`;
      const method = isNew ? "POST" : "PATCH";

      try {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: row.item.name,
            notes: row.item.notes,
            quantity_amount: row.item.quantity_amount,
            quantity_unit: row.item.quantity_unit,
            updated_by: editorName || null,
          }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          patchRow(key, {
            saving: false,
            error: json.error ?? (isNew ? "Create failed" : "Save failed"),
          });
          return;
        }
        const saved = (await res.json()) as PantryItemRow;
        // For a new row this also swaps the temp row for the real DB row by
        // dropping tempId; for an existing row it refreshes timestamps.
        setRows((prev) =>
          prev.map((r) =>
            rowKey(r) === key
              ? { item: saved, error: null, saving: false, dirty: false }
              : r
          )
        );
      } catch {
        patchRow(key, { saving: false, error: "Network error" });
      }
    },
    [editorName, patchRow]
  );

  // ---- add a new (unsaved) row --------------------------------------------
  const handleAddRow = useCallback(() => {
    setGlobalError(null);
    const tempId = `temp-${Date.now()}`;
    const optimistic: RowState = {
      tempId,
      item: {
        id: "",
        name: "",
        notes: null,
        quantity_amount: null,
        quantity_unit: null,
        updated_by: editorName || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
      error: null,
      saving: false,
      dirty: false,
    };
    setRows((prev) => [...prev, optimistic]);
  }, [editorName]);

  // ---- discard an unsaved (temp) row locally -------------------------------
  const handleCancelNew = useCallback((tempId: string) => {
    setRows((prev) => prev.filter((r) => r.tempId !== tempId));
  }, []);

  // ---- delete a persisted row ----------------------------------------------
  const handleDelete = useCallback(
    async (key: string, id: string) => {
      // Optimistic: remove immediately. Use rowsRef for current state.
      const snapshot = rowsRef.current.find((r) => rowKey(r) === key);
      setRows((prev) => prev.filter((r) => rowKey(r) !== key));

      try {
        const res = await fetch(`/api/pantry/${id}`, { method: "DELETE" });
        if (!res.ok && res.status !== 204) {
          // Revert
          if (snapshot) {
            setRows((prev) => [
              ...prev,
              { ...snapshot, error: "Delete failed — row restored" },
            ]);
          }
        }
      } catch {
        if (snapshot) {
          setRows((prev) => [
            ...prev,
            { ...snapshot, error: "Network error — row restored" },
          ]);
        }
      }
    },
    // rowsRef is a ref (stable), rowKey is a plain fn — no deps needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ---- receipt upload handler ----------------------------------------------
  const handleReceiptUpload = useCallback(async (file: File) => {
    setReceiptUploading(true);
    setReceiptNotice(null);
    const formData = new FormData();
    formData.append("image", file);
    if (editorName) formData.append("updated_by", editorName);
    try {
      const res = await fetch("/api/pantry/receipt", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setReceiptNotice({ type: "error", message: json.error ?? "Receipt parsing failed" });
        return;
      }
      const { store, pantryItems, pricedItems } = json as {
        store: string | null;
        pantryItems: PantryItemRow[];
        pricedItems: { name: string; price: number }[];
      };
      // Append new items (already saved, no tempId, not dirty)
      setRows(prev => [
        ...prev,
        ...pantryItems.map(item => ({ item, error: null, saving: false, dirty: false })),
      ]);
      if (!store && pricedItems.length > 0) {
        setReceiptNotice({ type: "store-needed", message: `Added ${pantryItems.length} items. Store not detected — enter store name to save prices:`, pricedItems });
      } else {
        const label = store ? ` from ${store}` : "";
        setReceiptNotice({ type: "success", message: `Added ${pantryItems.length} items${label}.` });
      }
    } catch {
      setReceiptNotice({ type: "error", message: "Network error during receipt upload" });
    } finally {
      setReceiptUploading(false);
    }
  }, [editorName]);

  // ---- save prices handler (store fallback) --------------------------------
  const handleSavePrices = useCallback(async () => {
    if (!storeInput.trim() || !receiptNotice?.pricedItems) return;
    setStoreSaving(true);
    try {
      await Promise.all(
        receiptNotice.pricedItems.map(item =>
          fetch("/api/reference-prices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: item.name,
              store: storeInput.trim(),
              price: item.price,
              updated_by: editorName || null,
            }),
          })
        )
      );
      setReceiptNotice({ type: "success", message: `Prices saved to reference prices for ${storeInput.trim()}.` });
      setStoreInput("");
    } catch {
      setReceiptNotice({ type: "error", message: "Failed to save prices" });
    } finally {
      setStoreSaving(false);
    }
  }, [storeInput, receiptNotice, editorName]);

  // -------------------------------------------------------------------------
  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleReceiptUpload(file);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleReceiptUpload(file);
          e.target.value = "";
        }}
      />

      {/* Header: editor identity */}
      <div className="mb-3 flex items-center gap-2 text-sm">
        {editingName ? (
          <>
            <label htmlFor="editor-name" className="text-gray-600">
              Your name:
            </label>
            <input
              id="editor-name"
              type="text"
              value={editorName}
              autoFocus
              onChange={(e) => setEditorName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") setEditingName(false);
              }}
              onBlur={saveName}
              className="border border-gray-300 rounded px-2 py-0.5 text-sm w-40 focus:outline-none focus:ring-1 focus:ring-gray-400"
              placeholder="e.g. Alex"
            />
          </>
        ) : (
          <>
            <span className="text-gray-500">
              Editing as{" "}
              <span className="font-medium text-gray-800">
                {editorName || "(anonymous)"}
              </span>
            </span>
            <button
              onClick={() => setEditingName(true)}
              className="text-blue-600 hover:underline text-xs"
            >
              edit
            </button>
          </>
        )}
      </div>

      {globalError && (
        <p className="text-red-600 text-xs mb-2">{globalError}</p>
      )}

      {receiptNotice && (
        <div className={`mb-3 text-sm rounded px-3 py-2 flex flex-col gap-1 ${
          receiptNotice.type === "error" ? "bg-red-50 text-red-700" :
          receiptNotice.type === "store-needed" ? "bg-yellow-50 text-yellow-800" :
          "bg-green-50 text-green-700"
        }`}>
          <div className="flex items-center justify-between gap-2">
            <span>{receiptNotice.message}</span>
            <button onClick={() => setReceiptNotice(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
          </div>
          {receiptNotice.type === "store-needed" && (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={storeInput}
                onChange={(e) => setStoreInput(e.target.value)}
                placeholder="Store name"
                className="border border-yellow-300 rounded px-2 py-0.5 text-sm w-36 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                onKeyDown={(e) => { if (e.key === "Enter") void handleSavePrices(); }}
              />
              <button
                onClick={() => void handleSavePrices()}
                disabled={!storeInput.trim() || storeSaving}
                className="text-xs px-2 py-0.5 rounded bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-40 transition-colors"
              >
                {storeSaving ? "Saving…" : "Save prices"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-300 text-left text-xs uppercase text-gray-500 tracking-wide">
              <th className="py-1.5 pr-3 font-medium w-48">Name</th>
              <th className="py-1.5 pr-3 font-medium w-16 whitespace-nowrap">Qty</th>
              <th className="py-1.5 pr-3 font-medium w-20 whitespace-nowrap">Unit</th>
              <th className="py-1.5 pr-3 font-medium">Notes</th>
              <th className="py-1.5 pr-3 font-medium w-28 whitespace-nowrap">
                Updated by
              </th>
              <th className="py-1.5 pr-3 font-medium w-36 whitespace-nowrap">
                Updated at
              </th>
              <th className="py-1.5 w-28" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="py-4 text-center text-gray-400 text-sm"
                >
                  No items — add one below.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const key = rowKey(row);
              const isTemp = !!row.tempId;
              const unsaved = isTemp || row.dirty;
              const canSave = !row.saving && row.item.name.trim().length > 0;

              return (
                <Fragment key={key}>
                  <tr
                    className={`border-b border-gray-100 hover:bg-gray-50${
                      unsaved ? " bg-amber-50/50" : ""
                    }`}
                  >
                    <td className="py-1 pr-3">
                      <input
                        type="text"
                        value={row.item.name}
                        aria-label="Item name"
                        onChange={(e) =>
                          handleChange(key, "name", e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveRow(key);
                        }}
                        className="w-full bg-transparent border-b border-transparent focus:border-gray-400 focus:outline-none py-0.5 px-0 text-sm"
                        placeholder="Item name"
                        disabled={row.saving}
                      />
                    </td>
                    <td className="py-1 pr-3">
                      <input
                        type="number"
                        value={row.item.quantity_amount ?? ""}
                        aria-label="Quantity amount"
                        onChange={(e) => handleQuantityAmountChange(key, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void saveRow(key); }}
                        className="w-full bg-transparent border-b border-transparent focus:border-gray-400 focus:outline-none py-0.5 px-0 text-sm"
                        placeholder="0"
                        min="0"
                        step="any"
                        disabled={row.saving}
                      />
                    </td>
                    <td className="py-1 pr-3">
                      <input
                        type="text"
                        value={row.item.quantity_unit ?? ""}
                        aria-label="Unit"
                        onChange={(e) => handleChange(key, "quantity_unit", e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void saveRow(key); }}
                        className="w-full bg-transparent border-b border-transparent focus:border-gray-400 focus:outline-none py-0.5 px-0 text-sm"
                        placeholder="ea / kg / L"
                        disabled={row.saving}
                      />
                    </td>
                    <td className="py-1 pr-3">
                      <input
                        type="text"
                        value={row.item.notes ?? ""}
                        aria-label="Notes"
                        onChange={(e) =>
                          handleChange(key, "notes", e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveRow(key);
                        }}
                        className="w-full bg-transparent border-b border-transparent focus:border-gray-400 focus:outline-none py-0.5 px-0 text-sm font-mono"
                        placeholder="e.g. expires soon"
                        disabled={row.saving}
                      />
                    </td>
                    <td className="py-1 pr-3 text-gray-500 text-xs whitespace-nowrap">
                      {row.item.updated_by ?? "—"}
                    </td>
                    <td className="py-1 pr-3 text-gray-400 text-xs whitespace-nowrap">
                      {isTemp ? "—" : formatDate(row.item.updated_at)}
                    </td>
                    <td className="py-1">
                      <div className="flex items-center justify-end gap-2">
                        {unsaved && (
                          <button
                            onClick={() => void saveRow(key)}
                            disabled={!canSave}
                            className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            title={
                              canSave
                                ? "Save this row"
                                : "Enter a name before saving"
                            }
                          >
                            {row.saving ? "Saving…" : "Save"}
                          </button>
                        )}
                        {isTemp ? (
                          <button
                            onClick={() => handleCancelNew(row.tempId!)}
                            aria-label="Discard new item"
                            disabled={row.saving}
                            className="text-gray-300 hover:text-gray-600 transition-colors text-base leading-none disabled:opacity-50"
                            title="Discard"
                          >
                            ×
                          </button>
                        ) : (
                          <button
                            onClick={() => void handleDelete(key, row.item.id)}
                            aria-label={`Delete ${row.item.name}`}
                            disabled={row.saving}
                            className="text-gray-300 hover:text-red-500 transition-colors text-base leading-none disabled:opacity-50"
                            title="Remove item"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {row.error && (
                    <tr className="bg-red-50">
                      <td
                        colSpan={7}
                        className="text-red-600 text-xs px-1 py-0.5"
                      >
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

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleAddRow}
          className="text-sm text-blue-600 hover:underline border border-dashed border-blue-300 rounded px-3 py-1 hover:bg-blue-50 transition-colors"
        >
          + Add item
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={receiptUploading}
          className="text-sm text-gray-600 hover:underline border border-dashed border-gray-300 rounded px-3 py-1 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {receiptUploading ? "Parsing receipt…" : "Upload receipt"}
        </button>
        <button
          onClick={() => cameraInputRef.current?.click()}
          disabled={receiptUploading}
          className="text-sm text-gray-600 hover:underline border border-dashed border-gray-300 rounded px-3 py-1 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {receiptUploading ? "Parsing receipt…" : "Take photo"}
        </button>
      </div>
    </div>
  );
}
