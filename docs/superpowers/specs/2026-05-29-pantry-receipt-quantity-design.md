# Pantry: Receipt Upload + Quantity Fields

**Date:** 2026-05-29  
**Status:** Approved

## Overview

Three connected features for the pantry:
1. **Quantity columns** — structured `quantity_amount` + `quantity_unit` per pantry item
2. **Receipt upload** — upload a receipt image, AI extracts items and bulk-adds them to the pantry
3. **Price carryover** — receipt prices are automatically written to `reference_prices` (store read from receipt; manual fallback if not detected)

---

## 1. Data Model

### `pantry_items` — new columns

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `quantity_amount` | `numeric` | yes | e.g. `2`, `0.5` |
| `quantity_unit` | `text` | yes | e.g. `kg`, `L`, `ea`, `pack` |

Mirrors the `size_amount`/`size_unit` shape already on `reference_prices` for consistency.

### Supabase migration

```sql
alter table pantry_items
  add column quantity_amount numeric,
  add column quantity_unit   text;
```

### TypeScript types (`types/database.ts`)

Add to `PantryItemRow`:
```ts
quantity_amount: number | null;
quantity_unit: string | null;
```

Add to `PantryItemInsert`:
```ts
quantity_amount?: number | null;
quantity_unit?: string | null;
```

---

## 2. Pantry Table UI

Two new columns added between **Name** and **Notes**:

- **Qty** — `<input type="number">`, ~60px wide, placeholder `0`, accepts decimals
- **Unit** — `<input type="text">`, ~70px wide, placeholder `ea / kg / L`

Behavior:
- Edits mark the row dirty (amber highlight) identically to name/notes
- Enter key or Save button persists; quantity fields included in POST/PATCH body
- `handleChange` gains a branch for `"quantity_amount"` and `"quantity_unit"`

---

## 3. Receipt Upload UI

**Location:** PantryTable — a "Upload receipt" button near the "+ Add item" button.

**Flow:**
1. Click "Upload receipt" → triggers hidden `<input type="file" accept="image/*">`
2. User selects image → spinner replaces button text ("Parsing receipt…")
3. `multipart/form-data` POST to `/api/pantry/receipt` (includes `image` + `updated_by`)
4. On success: new items appended to table (already persisted — no amber highlight)
5. Dismissable green notice: **"Added 8 items from Walmart"** or **"Added 8 items"** if no store detected
6. If store was not detected but prices exist: yellow notice — **"Store not detected — enter store name to save prices:"** + text input + "Save prices" button → POSTs priced items to `/api/reference-prices`

**Errors** (bad image, AI failure, network): dismissable red notice.

The tab must stay open during parsing (~5–10 s). DB writes happen server-side, so items are safe even if the response is lost.

---

## 4. `/api/pantry/receipt` Route

**Method:** POST  
**Content-Type:** `multipart/form-data`  
**Fields:** `image` (File), `updated_by` (string, optional)

### Server steps

1. Read image buffer from form data, base64-encode it
2. Call Claude Vision via existing `lib/llm/client.ts` pattern
3. Prompt instructs Claude to return JSON:
   ```json
   {
     "store": "Walmart" | null,
     "items": [
       { "name": "...", "quantity_amount": 2, "quantity_unit": "kg", "price": 4.99 }
     ]
   }
   ```
   `store` is extracted once from the receipt header. `price`, `quantity_amount`, `quantity_unit` may be null.
4. Validate and parse the JSON response
5. Bulk-insert all items into `pantry_items` (name, quantity_amount, quantity_unit, updated_by)
6. If `store` detected: bulk-insert items with a price into `reference_prices` (name, store, price, size_amount=quantity_amount, size_unit=quantity_unit, updated_by)
7. Return:
   ```ts
   {
     store: string | null;
     pantryItems: PantryItemRow[];
     referencePrices: ReferencePriceRow[];
     pricedItems: { name: string; price: number }[]; // for manual store fallback
   }
   ```

---

## 5. Files Changed

| File | Change |
|------|--------|
| `types/database.ts` | Add quantity fields to PantryItemRow/Insert |
| `app/pantry/PantryTable.tsx` | Qty/Unit columns + upload button + receipt flow |
| `app/api/pantry/route.ts` | Accept quantity fields in POST |
| `app/api/pantry/[id]/route.ts` | Accept quantity fields in PATCH |
| `app/api/pantry/receipt/route.ts` | New route (vision parse + bulk insert) |
| Supabase migration | `alter table pantry_items add column ...` |
