import { supabaseServerClient } from "@/lib/supabase/server";
import type { PantryItemRow } from "@/types/database";
import PantryTable from "./PantryTable";

export const dynamic = "force-dynamic";

/**
 * /pantry — server component
 * Fetches non-deleted pantry items and passes them to the client table.
 */
export default async function PantryPage() {
  const { data, error } = await supabaseServerClient
    .from("pantry_items")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  // Graceful fallback: if the DB is unreachable, show an empty table with an error note.
  const items: PantryItemRow[] = data ?? [];
  const fetchError = error?.message ?? null;

  return (
    <div>
      <h1 className="text-base font-semibold mb-4 uppercase tracking-wide text-gray-800">
        Pantry
      </h1>

      {fetchError && (
        <p className="text-sm text-red-600 mb-3">
          Could not load pantry: {fetchError}
        </p>
      )}

      <PantryTable initialItems={items} />
    </div>
  );
}
