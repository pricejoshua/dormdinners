/**
 * app/api/cron/refresh-flipp/route.ts
 *
 * Vercel cron endpoint — triggered every Sunday at 8pm PT (Monday 04:00 UTC).
 * Schedule is declared in vercel.json.
 *
 * The route validates the shared CRON_SECRET, then fires the Supabase Edge
 * Function `refresh-flipp` and returns 202 immediately without waiting for
 * the edge function to finish (avoids Vercel's 10s free-tier limit).
 */

import { NextResponse } from "next/server";
import { CURATED_INGREDIENTS } from "@/config/curated-ingredients";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // --- Auth check ---
  const cronSecret = process.env.CRON_SECRET ?? "";
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Resolve edge function URL ---
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  if (!supabaseUrl) {
    return NextResponse.json(
      { error: "SUPABASE_URL not configured" },
      { status: 500 },
    );
  }

  const edgeFnUrl = `${supabaseUrl}/functions/v1/refresh-flipp`;

  // Fire-and-forget: do not await the edge function response.
  // We use void to make the intentional no-await explicit.
  void fetch(edgeFnUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY ?? ""}`,
    },
    body: JSON.stringify({ ingredients: CURATED_INGREDIENTS }),
  }).catch((err: unknown) => {
    // Non-fatal — the weekly job will retry next Sunday.
    console.error("[cron/refresh-flipp] Failed to invoke edge function:", err);
  });

  return NextResponse.json(
    { status: "accepted", ingredients: CURATED_INGREDIENTS.length },
    { status: 202 },
  );
}
