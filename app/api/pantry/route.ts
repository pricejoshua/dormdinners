import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/server";
import type { PantryItemInsert } from "@/types/database";

/**
 * GET /api/pantry
 * Returns all non-deleted pantry items ordered by updated_at desc.
 */
export async function GET() {
  const { data, error } = await supabaseServerClient
    .from("pantry_items")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * POST /api/pantry
 * Creates a new pantry item.
 * Body: { name: string; notes?: string | null; updated_by?: string | null }
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("name" in body) ||
    typeof (body as Record<string, unknown>).name !== "string" ||
    !(body as Record<string, unknown>).name
  ) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { name, notes, updated_by, quantity_amount, quantity_unit } = body as {
    name: string;
    notes?: string | null;
    updated_by?: string | null;
    quantity_amount?: number | null;
    quantity_unit?: string | null;
  };

  const insert: PantryItemInsert = {
    name,
    notes: notes ?? null,
    updated_by: updated_by ?? null,
    quantity_amount: quantity_amount ?? null,
    quantity_unit: quantity_unit ?? null,
  };

  const { data, error } = await supabaseServerClient
    .from("pantry_items")
    .insert(insert)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
