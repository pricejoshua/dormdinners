import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/server";

/**
 * PATCH /api/pantry/[id]
 * Updates name, notes, and/or updated_by for an existing pantry item.
 * Body: { name?: string; notes?: string | null; updated_by?: string | null }
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

  const allowed = ["name", "notes", "updated_by"] as const;
  type AllowedKey = (typeof allowed)[number];
  const patch: Partial<Record<AllowedKey, string | null>> = {};

  for (const key of allowed) {
    const b = body as Record<string, unknown>;
    if (key in b) {
      const val = b[key];
      if (val === null || typeof val === "string") {
        patch[key] = val;
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Always bump updated_at
  const updatePayload = { ...patch, updated_at: new Date().toISOString() };

  const { data, error } = await supabaseServerClient
    .from("pantry_items")
    .update(updatePayload)
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
 * DELETE /api/pantry/[id]
 * Soft-deletes a pantry item by setting deleted_at = now().
 * Never hard-deletes; the record remains in the DB for recovery.
 *
 * Note: concurrent edits from two browser tabs use last-write-wins semantics.
 * If two tabs both soft-delete, the second write is a no-op (already deleted).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const { error } = await supabaseServerClient
    .from("pantry_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
