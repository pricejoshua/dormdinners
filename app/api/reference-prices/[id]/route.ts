import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/server";
import type { ReferencePriceUpdate } from "@/types/database";

/**
 * PATCH /api/reference-prices/[id]
 * Partial update. Body may include name, store, price, size_amount,
 * size_unit, notes, updated_by.
 */
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

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const patch: ReferencePriceUpdate = {};

  if ("name" in b) {
    if (typeof b.name !== "string" || b.name.trim() === "") {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    patch.name = b.name.trim();
  }
  if ("store" in b) {
    if (typeof b.store !== "string" || b.store.trim() === "") {
      return NextResponse.json({ error: "store must be a non-empty string" }, { status: 400 });
    }
    patch.store = b.store.trim();
  }
  if ("price" in b) {
    if (typeof b.price !== "number" || !(b.price >= 0)) {
      return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 });
    }
    patch.price = b.price;
  }
  if ("size_amount" in b) {
    if (b.size_amount !== null && (typeof b.size_amount !== "number" || !(b.size_amount > 0))) {
      return NextResponse.json({ error: "size_amount must be a positive number or null" }, { status: 400 });
    }
    patch.size_amount = b.size_amount as number | null;
  }
  if ("size_unit" in b) {
    patch.size_unit = typeof b.size_unit === "string" ? b.size_unit : null;
  }
  if ("notes" in b) {
    patch.notes = typeof b.notes === "string" ? b.notes : null;
  }
  if ("updated_by" in b) {
    patch.updated_by = typeof b.updated_by === "string" ? b.updated_by : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabaseServerClient
    .from("reference_prices")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
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

/**
 * DELETE /api/reference-prices/[id]
 * Soft-deletes by setting deleted_at = now().
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const { error } = await supabaseServerClient
    .from("reference_prices")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
