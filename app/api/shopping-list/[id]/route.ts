/**
 * PATCH /api/shopping-list/[id]
 *
 * Toggles or sets `checked_off` on a shopping list item.
 * Body: { checked_off: boolean }
 *
 * Returns the updated row on success.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("checked_off" in body) ||
    typeof (body as Record<string, unknown>).checked_off !== "boolean"
  ) {
    return NextResponse.json(
      { error: "checked_off (boolean) is required" },
      { status: 400 }
    );
  }

  const { checked_off } = body as { checked_off: boolean };

  const { data, error } = await supabaseServerClient
    .from("shopping_list_items")
    .update({ checked_off })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
