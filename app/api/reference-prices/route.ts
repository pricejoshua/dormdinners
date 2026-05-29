import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/server";
import type { ReferencePriceInsert } from "@/types/database";

/**
 * GET /api/reference-prices
 * Returns all non-deleted reference prices, newest-updated first.
 */
export async function GET() {
  const { data, error } = await supabaseServerClient
    .from("reference_prices")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * POST /api/reference-prices
 * Creates a reference price row.
 * Body: { name, store, price, size_amount?, size_unit?, notes?, updated_by? }
 */
export async function POST(request: NextRequest) {
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

  if (typeof b.name !== "string" || b.name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof b.store !== "string" || b.store.trim() === "") {
    return NextResponse.json({ error: "store is required" }, { status: 400 });
  }
  if (typeof b.price !== "number" || !(b.price >= 0)) {
    return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 });
  }
  if (b.size_amount != null && (typeof b.size_amount !== "number" || !(b.size_amount > 0))) {
    return NextResponse.json({ error: "size_amount must be a positive number or null" }, { status: 400 });
  }

  const insert: ReferencePriceInsert = {
    name: b.name.trim(),
    store: b.store.trim(),
    price: b.price,
    size_amount: (b.size_amount as number | null | undefined) ?? null,
    size_unit: typeof b.size_unit === "string" ? b.size_unit : null,
    notes: typeof b.notes === "string" ? b.notes : null,
    updated_by: typeof b.updated_by === "string" ? b.updated_by : null,
  };

  const { data, error } = await supabaseServerClient
    .from("reference_prices")
    .insert(insert)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
