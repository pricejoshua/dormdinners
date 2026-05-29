import { supabaseServerClient } from "@/lib/supabase/server";
import type { ReferencePriceRow } from "@/types/database";
import PricesTable from "./PricesTable";

export const dynamic = "force-dynamic";

/**
 * /prices — server component
 * Fetches non-deleted reference prices and passes them to the client table.
 */
export default async function PricesPage() {
  const { data, error } = await supabaseServerClient
    .from("reference_prices")
    .select("*")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const items: ReferencePriceRow[] = data ?? [];
  const fetchError = error?.message ?? null;

  return (
    <div>
      <h1 className="text-base font-semibold mb-1 uppercase tracking-wide text-gray-800">
        Reference Prices
      </h1>
      <p className="text-xs text-gray-500 mb-4">
        Your group&apos;s known staple prices across stores. Enter the size so prices
        compare per unit ($/kg, $/L, $/ea) — the cheapest store is highlighted.
      </p>

      {fetchError && (
        <p className="text-sm text-red-600 mb-3">Could not load prices: {fetchError}</p>
      )}

      <PricesTable initialItems={items} />
    </div>
  );
}
