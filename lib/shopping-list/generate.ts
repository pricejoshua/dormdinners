/**
 * lib/shopping-list/generate.ts
 *
 * Pure function — no Supabase calls. All IO is done by the caller (API route).
 *
 * Suggestion type mapping:
 *   substitution  — rewrites the ingredient name to the LLM's suggested alternative
 *   pantry_use    — marks pantry_match = true for the named item
 *   bulk_buy      — adds a note to affected items (no row-set change)
 *   overlap       — adds a note to affected items (no row-set change)
 */

import type { FlippItem } from "@/lib/flipp";
import type { OptimizationSuggestionRow } from "@/types/database";

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface MealInput {
  ingredients: { name: string; quantity: string | null }[];
}

export interface PantryInput {
  name: string;
}

/**
 * A single shopping list item ready to be inserted into `shopping_list_items`.
 * `id` and timestamps are omitted — Postgres provides them.
 */
export interface GeneratedItem {
  name: string;
  quantity: string | null;
  /** `flipp_cache.id` of the best matching (freshest) Flipp row, or null. */
  flipp_cache_id: string | null;
  /** `merchant_name` from the matched Flipp row, or null. */
  assigned_store: string | null;
  pantry_match: boolean;
  /** Human-readable note from bulk_buy / overlap suggestions, or null. */
  note: string | null;
}

export interface GenerateInput {
  meals: MealInput[];
  pantry: PantryInput[];
  flipp: FlippItem[];
  acceptedSuggestions: OptimizationSuggestionRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise an ingredient name for deduplication and matching. */
export function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Pure generate function
// ---------------------------------------------------------------------------

/**
 * Produce a deduplicated shopping list from meal ingredients, cross-referenced
 * against the pantry and Flipp cache, with accepted suggestions applied.
 */
export function generateShoppingList(input: GenerateInput): GeneratedItem[] {
  const { meals, pantry, flipp, acceptedSuggestions } = input;

  // ---- 1. Collect all ingredients, deduplicating by normalised name ----------
  // Map: normalisedName → { displayName, quantities[] }
  const ingredientMap = new Map<
    string,
    { displayName: string; quantities: string[] }
  >();

  for (const meal of meals) {
    for (const ing of meal.ingredients) {
      const key = normaliseName(ing.name);
      if (!ingredientMap.has(key)) {
        ingredientMap.set(key, { displayName: ing.name, quantities: [] });
      }
      if (ing.quantity) {
        ingredientMap.get(key)!.quantities.push(ing.quantity);
      }
    }
  }

  // ---- 2. Apply substitution suggestions ------------------------------------
  // A substitution row's description is expected to contain the mapping.
  // We parse it as: the description contains an "old_name → new_name" pair.
  // Per the design doc & task brief: we rewrite ingredient names.
  // The description may be free-text from the LLM so we try a best-effort
  // parse: "Replace <old> with <new>" or "<old> → <new>".
  // If we cannot parse, we leave the item unchanged.
  const substitutions: Map<string, string> = new Map(); // normOld → normNew + displayNew

  for (const s of acceptedSuggestions) {
    if (s.suggestion_type !== "substitution" || !s.description) continue;
    const desc = s.description;

    // Try "Replace <old> with <new>" pattern (case-insensitive)
    const replaceMatch = desc.match(/replace\s+(.+?)\s+with\s+(.+)/i);
    if (replaceMatch) {
      const [, oldName, newName] = replaceMatch;
      substitutions.set(normaliseName(oldName.trim()), newName.trim());
      continue;
    }
    // Try "<old> → <new>" or "<old> -> <new>"
    const arrowMatch = desc.match(/^(.+?)\s*(?:→|->)\s*(.+)$/);
    if (arrowMatch) {
      const [, oldName, newName] = arrowMatch;
      substitutions.set(normaliseName(oldName.trim()), newName.trim());
    }
  }

  // Apply substitutions: rename keys in the map
  for (const [oldKey, newDisplayName] of substitutions) {
    if (!ingredientMap.has(oldKey)) continue;
    const existing = ingredientMap.get(oldKey)!;
    const newKey = normaliseName(newDisplayName);
    if (ingredientMap.has(newKey)) {
      // Merge quantities into existing entry
      ingredientMap.get(newKey)!.quantities.push(...existing.quantities);
    } else {
      ingredientMap.set(newKey, {
        displayName: newDisplayName,
        quantities: existing.quantities,
      });
    }
    ingredientMap.delete(oldKey);
  }

  // ---- 3. Build pantry set for quick lookup ---------------------------------
  const pantrySet = new Set<string>(pantry.map((p) => normaliseName(p.name)));

  // ---- 4. Apply pantry_use suggestions (force pantry_match = true) ----------
  const forcedPantryMatch = new Set<string>();
  for (const s of acceptedSuggestions) {
    if (s.suggestion_type !== "pantry_use" || !s.description) continue;
    // Best-effort: treat the whole description as the item name, and also
    // try common patterns like "Use <item> from pantry"
    const useMatch = s.description.match(/use\s+(.+?)(?:\s+from\s+pantry)?$/i);
    if (useMatch) {
      forcedPantryMatch.add(normaliseName(useMatch[1].trim()));
    } else {
      forcedPantryMatch.add(normaliseName(s.description.trim()));
    }
  }

  // ---- 5. Collect notes from bulk_buy / overlap suggestions -----------------
  // Map: normalisedItemName → note strings[]
  const itemNotes = new Map<string, string[]>();

  for (const s of acceptedSuggestions) {
    if (
      (s.suggestion_type !== "bulk_buy" && s.suggestion_type !== "overlap") ||
      !s.description
    ) {
      continue;
    }
    // Associate the note with every ingredient that appears in the description
    for (const [key] of ingredientMap) {
      const displayName = ingredientMap.get(key)!.displayName;
      if (
        s.description.toLowerCase().includes(key) ||
        s.description.toLowerCase().includes(normaliseName(displayName))
      ) {
        if (!itemNotes.has(key)) itemNotes.set(key, []);
        itemNotes.get(key)!.push(s.description);
      }
    }
  }

  // ---- 6. Match each ingredient against Flipp cache -------------------------
  // Find the freshest Flipp row whose ingredient_query matches (case-insensitive).
  // "Freshest" = highest fetched_at; fall back to first result if equal.
  function findFlippMatch(normKey: string): FlippItem | null {
    const matches = flipp.filter(
      (f) =>
        f.ingredient_query !== null &&
        normaliseName(f.ingredient_query) === normKey
    );
    if (matches.length === 0) return null;
    // Sort by fetched_at descending (nulls last)
    matches.sort((a, b) => {
      if (!a.fetched_at && !b.fetched_at) return 0;
      if (!a.fetched_at) return 1;
      if (!b.fetched_at) return -1;
      return b.fetched_at.localeCompare(a.fetched_at);
    });
    return matches[0];
  }

  // ---- 7. Assemble output ---------------------------------------------------
  const result: GeneratedItem[] = [];

  for (const [normKey, { displayName, quantities }] of ingredientMap) {
    const pantryMatchDirect = pantrySet.has(normKey);
    const pantryMatchForced = forcedPantryMatch.has(normKey);
    const flippMatch = findFlippMatch(normKey);
    const notes = itemNotes.get(normKey) ?? [];

    // Merge quantities: if all the same, deduplicate; otherwise join with " + "
    const uniqueQuantities = [...new Set(quantities)];
    const quantity =
      uniqueQuantities.length === 0 ? null : uniqueQuantities.join(" + ");

    result.push({
      name: displayName,
      quantity,
      flipp_cache_id: flippMatch ? flippMatch.id : null,
      assigned_store: flippMatch ? flippMatch.merchant_name : null,
      pantry_match: pantryMatchDirect || pantryMatchForced,
      note: notes.length > 0 ? notes.join("; ") : null,
    });
  }

  return result;
}
