/**
 * /shopping-list — server component
 *
 * Loads the current week's shopping_list_items grouped by assigned_store,
 * the referenced flipp_cache rows, and accepted optimization_suggestions,
 * then renders the ShoppingList client component.
 *
 * "Store unknown" bucket is placed at the bottom.
 */

export const dynamic = "force-dynamic";

import { supabaseServerClient } from "@/lib/supabase/server";
import { currentMondayISO } from "@/app/_lib/weekOf";
import type {
  ShoppingListItemRow,
  FlippCacheRow,
  OptimizationSuggestionRow,
} from "@/types/database";
import ShoppingList from "./ShoppingList";

export default async function ShoppingListPage() {
  const weekOf = currentMondayISO();

  // ---- Load shopping list items for the current week -----------------------
  const { data: itemsData, error: itemsError } = await supabaseServerClient
    .from("shopping_list_items")
    .select("*")
    .eq("week_of", weekOf)
    .order("name", { ascending: true });

  if (itemsError) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600">
          Failed to load shopping list: {itemsError.message}
        </p>
      </div>
    );
  }

  const items: ShoppingListItemRow[] = itemsData ?? [];

  // ---- Load referenced flipp_cache rows ------------------------------------
  const flippIds = [
    ...new Set(items.map((i) => i.flipp_cache_id).filter(Boolean) as string[]),
  ];

  let flippById: Record<string, FlippCacheRow> = {};

  if (flippIds.length > 0) {
    const { data: flippData } = await supabaseServerClient
      .from("flipp_cache")
      .select("*")
      .in("id", flippIds);

    if (flippData) {
      for (const row of flippData) {
        flippById[row.id] = row;
      }
    }
  }

  // ---- Load accepted suggestions (for notes column) ------------------------
  const { data: suggestionsData } = await supabaseServerClient
    .from("optimization_suggestions")
    .select("*")
    .eq("status", "accepted");

  const acceptedSuggestions: OptimizationSuggestionRow[] =
    suggestionsData ?? [];

  // ---- Group items by assigned_store ---------------------------------------
  // Known stores first (sorted alphabetically), "Store unknown" last.
  const storeMap = new Map<string, ShoppingListItemRow[]>();
  const unknownItems: ShoppingListItemRow[] = [];

  for (const item of items) {
    if (!item.assigned_store) {
      unknownItems.push(item);
    } else {
      if (!storeMap.has(item.assigned_store)) {
        storeMap.set(item.assigned_store, []);
      }
      storeMap.get(item.assigned_store)!.push(item);
    }
  }

  // Sort store names alphabetically
  const sortedStores = [...storeMap.keys()].sort((a, b) =>
    a.localeCompare(b)
  );

  const groups: { store: string | null; items: ShoppingListItemRow[] }[] = [
    ...sortedStores.map((store) => ({
      store,
      items: storeMap.get(store)!,
    })),
  ];

  if (unknownItems.length > 0) {
    groups.push({ store: null, items: unknownItems });
  }

  return (
    <div className="px-4 py-4 max-w-lg mx-auto">
      <ShoppingList
        groups={groups}
        flippById={flippById}
        acceptedSuggestions={acceptedSuggestions}
      />
    </div>
  );
}
