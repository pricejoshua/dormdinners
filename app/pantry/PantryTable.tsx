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

const DEBOUNCE_MS = 600;

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
    initialItems.map((item) => ({ item, error: null, saving: false }))
  );
  // Mirror of rows kept in a ref so callbacks can read current state without
  // listing `rows` as a dependency (avoids stale closures).
  const rowsRef = useRef<RowState[]>(rows);
  useEffect(() => {
    rowsRef.current = rows;
  });

  // Keep a global error for network-level failures (e.g. add row)
  const [globalError, setGlobalError] = useState<string | null>(null);

  // ---- debounce refs -------------------------------------------------------
  // Map from row id (or tempId) → timeout handle
  const debounceMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

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

  // ---- save (PATCH) --------------------------------------------------------
  const saveRow = useCallback(
    async (key: string, item: PantryItemRow) => {
      patchRow(key, { saving: true, error: null });
      try {
        const res = await fetch(`/api/pantry/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: item.name,
            notes: item.notes,
            updated_by: editorName || null,
          }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          patchRow(key, {
            saving: false,
            error: json.error ?? "Save failed",
          });
        } else {
          const saved = (await res.json()) as PantryItemRow;
          patchRow(key, { saving: false, item: saved });
        }
      } catch {
        patchRow(key, { saving: false, error: "Network error" });
      }
    },
    [editorName, patchRow]
  );

  // debounced save on change
  const scheduleDebounce = useCallback(
    (key: string, item: PantryItemRow) => {
      const existing = debounceMap.current.get(key);
      if (existing) clearTimeout(existing);
      const handle = setTimeout(() => {
        debounceMap.current.delete(key);
        void saveRow(key, item);
      }, DEBOUNCE_MS);
      debounceMap.current.set(key, handle);
    },
    [saveRow]
  );

  const handleChange = useCallback(
    (key: string, field: "name" | "notes", value: string) => {
      // Update the field in local state
      setRows((prev) =>
        prev.map((r) => {
          if (rowKey(r) !== key) return r;
          return { ...r, item: { ...r.item, [field]: value } };
        })
      );
      // Schedule debounced PATCH only for rows already in the DB (no tempId).
      // rowsRef gives us the current rows without a stale closure.
      const row = rowsRef.current.find((r) => rowKey(r) === key);
      if (row && !row.tempId) {
        scheduleDebounce(key, { ...row.item, [field]: value });
      }
    },
    [scheduleDebounce]
  );

  // ---- blur save (for rows that already exist in DB) ----------------------
  const handleBlur = useCallback(
    (key: string) => {
      // Read current row from ref — no stale closure issue
      const row = rowsRef.current.find((r) => rowKey(r) === key);
      if (!row || row.tempId) return; // new rows saved via handleNewRowBlur
      // Cancel any pending debounce and save immediately on blur
      const existing = debounceMap.current.get(key);
      if (existing) {
        clearTimeout(existing);
        debounceMap.current.delete(key);
      }
      void saveRow(key, row.item);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saveRow]
  );

  // ---- add row -------------------------------------------------------------
  const handleAddRow = useCallback(async () => {
    setGlobalError(null);
    const tempId = `temp-${Date.now()}`;
    const optimistic: RowState = {
      tempId,
      item: {
        id: "",
        name: "",
        notes: null,
        updated_by: editorName || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
      error: null,
      saving: false,
    };
    setRows((prev) => [...prev, optimistic]);
  }, [editorName]);

  // save a new (temp) row when its name field loses focus
  const handleNewRowBlur = useCallback(
    async (tempId: string, item: PantryItemRow) => {
      if (!item.name.trim()) {
        // remove empty unsaved rows
        setRows((prev) => prev.filter((r) => r.tempId !== tempId));
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.tempId === tempId ? { ...r, saving: true, error: null } : r
        )
      );
      try {
        const res = await fetch("/api/pantry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: item.name,
            notes: item.notes,
            updated_by: editorName || null,
          }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          setRows((prev) =>
            prev.map((r) =>
              r.tempId === tempId
                ? { ...r, saving: false, error: json.error ?? "Create failed" }
                : r
            )
          );
        } else {
          const saved = (await res.json()) as PantryItemRow;
          // replace temp row with real row
          setRows((prev) =>
            prev.map((r) =>
              r.tempId === tempId
                ? { item: saved, error: null, saving: false }
                : r
            )
          );
        }
      } catch {
        setRows((prev) =>
          prev.map((r) =>
            r.tempId === tempId
              ? { ...r, saving: false, error: "Network error" }
              : r
          )
        );
      }
    },
    [editorName]
  );

  // ---- delete row ----------------------------------------------------------
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

  // -------------------------------------------------------------------------
  return (
    <div>
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

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-300 text-left text-xs uppercase text-gray-500 tracking-wide">
              <th className="py-1.5 pr-3 font-medium w-48">Name</th>
              <th className="py-1.5 pr-3 font-medium">Notes</th>
              <th className="py-1.5 pr-3 font-medium w-28 whitespace-nowrap">
                Updated by
              </th>
              <th className="py-1.5 pr-3 font-medium w-36 whitespace-nowrap">
                Updated at
              </th>
              <th className="py-1.5 w-8" aria-label="Delete" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="py-4 text-center text-gray-400 text-sm"
                >
                  No items — add one below.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const key = rowKey(row);
              const isTemp = !!row.tempId;

              return (
                <Fragment key={key}>
                  <tr
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-1 pr-3">
                      <input
                        type="text"
                        value={row.item.name}
                        aria-label="Item name"
                        onChange={(e) =>
                          handleChange(key, "name", e.target.value)
                        }
                        onBlur={() =>
                          isTemp
                            ? void handleNewRowBlur(row.tempId!, row.item)
                            : handleBlur(key)
                        }
                        className="w-full bg-transparent border-b border-transparent focus:border-gray-400 focus:outline-none py-0.5 px-0 text-sm"
                        placeholder="Item name"
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
                        onBlur={() =>
                          isTemp
                            ? void handleNewRowBlur(row.tempId!, row.item)
                            : handleBlur(key)
                        }
                        className="w-full bg-transparent border-b border-transparent focus:border-gray-400 focus:outline-none py-0.5 px-0 text-sm font-mono"
                        placeholder="e.g. half a bag"
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
                      {!isTemp && (
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
                    </td>
                  </tr>
                  {row.error && (
                    <tr className="bg-red-50">
                      <td
                        colSpan={5}
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

      <div className="mt-3">
        <button
          onClick={() => void handleAddRow()}
          className="text-sm text-blue-600 hover:underline border border-dashed border-blue-300 rounded px-3 py-1 hover:bg-blue-50 transition-colors"
        >
          + Add item
        </button>
      </div>
    </div>
  );
}
