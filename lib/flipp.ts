/**
 * lib/flipp.ts
 *
 * Typed shape for a Flipp item and a helper to read fresh rows from the cache.
 * Import this in any server component or API route that needs price data.
 */

import { supabaseServerClient } from "@/lib/supabase/server";
import type { FlippCacheRow } from "@/types/database";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single Flipp deal item as stored in flipp_cache. */
export interface FlippItem {
  id: string;
  ingredient_query: string | null;
  merchant_name: string | null;
  item_name: string | null;
  current_price: number | null;
  /** Unit string as returned by Flipp, e.g. "/lb", "/ea". */
  post_price_text: string | null;
  valid_from: string | null;
  valid_to: string | null;
  fetched_at: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rowToItem(row: FlippCacheRow): FlippItem {
  return {
    id: row.id,
    ingredient_query: row.ingredient_query,
    merchant_name: row.merchant_name,
    item_name: row.item_name,
    current_price: row.current_price,
    post_price_text: row.post_price_text,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    fetched_at: row.fetched_at,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return cached Flipp items for a given ingredient name.
 *
 * Only rows where `valid_to` is in the future (or null) are returned.
 * Results are ordered by `fetched_at` descending so callers get the freshest
 * data first.
 *
 * Gracefully returns an empty array on any error so callers never crash.
 */
export async function getCached(name: string): Promise<FlippItem[]> {
  try {
    const now = new Date().toISOString();

    const { data, error } = await supabaseServerClient
      .from("flipp_cache")
      .select("*")
      .eq("ingredient_query", name)
      .or(`valid_to.is.null,valid_to.gt.${now}`)
      .order("fetched_at", { ascending: false });

    if (error) {
      console.error("[flipp] getCached error:", error.message);
      return [];
    }

    return (data ?? []).map(rowToItem);
  } catch (err) {
    console.error("[flipp] getCached unexpected error:", err);
    return [];
  }
}
