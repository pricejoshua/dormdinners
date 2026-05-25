/**
 * supabase/functions/refresh-flipp/index.ts
 *
 * Supabase Edge Function (Deno runtime).
 * Fetches weekly Flipp price data for a curated list of ingredients and
 * upserts results into the `flipp_cache` table.
 *
 * Deploy:
 *   supabase functions deploy refresh-flipp
 *
 * Required env vars (set via Supabase dashboard or `supabase secrets set`):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_POSTAL_CODE   — e.g. V3A4S8
 */

// @ts-nocheck — Deno globals; excluded from tsc via tsconfig.json exclude field.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types (mirrored here to avoid importing from the Next.js tree)
// ---------------------------------------------------------------------------

interface FlippRawItem {
  name?: string;
  merchant?: string;
  merchant_name?: string;
  current_price?: number | string | null;
  post_price_text?: string | null;
  [key: string]: unknown;
}

interface FlippApiResponse {
  items?: FlippRawItem[];
  [key: string]: unknown;
}

interface RequestBody {
  ingredients?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONCURRENCY = 5;
const DAYS_VALID = 7;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

/**
 * Fetch Flipp items for a single ingredient query.
 * Returns an empty array on any error — callers must handle gracefully.
 */
async function fetchFlippItems(
  query: string,
  postalCode: string,
): Promise<FlippRawItem[]> {
  const url =
    `https://backflipp.wishabi.com/flipp/items/search?q=${encodeURIComponent(query)}&postal_code=${encodeURIComponent(postalCode)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.warn(`[refresh-flipp] Network error for "${query}":`, err);
    return [];
  }

  if (!res.ok) {
    console.warn(
      `[refresh-flipp] Non-200 response for "${query}": ${res.status}`,
    );
    return [];
  }

  // Guard against HTML error pages.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    console.warn(
      `[refresh-flipp] Unexpected content-type for "${query}": ${contentType}`,
    );
    return [];
  }

  let json: FlippApiResponse;
  try {
    json = (await res.json()) as FlippApiResponse;
  } catch (err) {
    console.warn(`[refresh-flipp] JSON parse error for "${query}":`, err);
    return [];
  }

  const items = json.items;
  if (!Array.isArray(items) || items.length === 0) {
    console.info(`[refresh-flipp] No items for "${query}"`);
    return [];
  }

  return items;
}

/**
 * Process one ingredient: fetch from Flipp, mark old rows stale, upsert new rows.
 */
async function processIngredient(
  supabase: ReturnType<typeof createClient>,
  ingredient: string,
  postalCode: string,
): Promise<void> {
  const now = new Date().toISOString();
  const validTo = daysFromNow(DAYS_VALID);

  // Mark any currently-active rows for this query as stale.
  const { error: staleError } = await supabase
    .from("flipp_cache")
    .update({ valid_to: now })
    .eq("ingredient_query", ingredient)
    .gt("valid_to", now);

  if (staleError) {
    console.warn(
      `[refresh-flipp] Could not mark stale rows for "${ingredient}":`,
      staleError.message,
    );
    // Non-fatal — proceed with upsert.
  }

  const rawItems = await fetchFlippItems(ingredient, postalCode);
  if (rawItems.length === 0) return;

  const rows = rawItems.map((item) => ({
    ingredient_query: ingredient,
    merchant_name: item.merchant_name ?? item.merchant ?? null,
    item_name: item.name ?? null,
    current_price:
      item.current_price != null ? Number(item.current_price) : null,
    post_price_text: item.post_price_text ?? null,
    valid_from: now,
    valid_to: validTo,
    fetched_at: now,
  }));

  const { error: upsertError } = await supabase
    .from("flipp_cache")
    .insert(rows);

  if (upsertError) {
    console.error(
      `[refresh-flipp] Insert failed for "${ingredient}":`,
      upsertError.message,
    );
  } else {
    console.info(
      `[refresh-flipp] Inserted ${rows.length} rows for "${ingredient}"`,
    );
  }
}

/**
 * Process an array of ingredients with a fixed concurrency limit.
 */
async function processInBatches(
  supabase: ReturnType<typeof createClient>,
  ingredients: string[],
  postalCode: string,
): Promise<void> {
  for (let i = 0; i < ingredients.length; i += CONCURRENCY) {
    const batch = ingredients.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map((ing) => processIngredient(supabase, ing, postalCode)),
    );
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const postalCode = Deno.env.get("NEXT_PUBLIC_POSTAL_CODE") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!postalCode) {
    console.warn(
      "[refresh-flipp] NEXT_PUBLIC_POSTAL_CODE is not set; using empty string",
    );
  }

  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ingredients = Array.isArray(body.ingredients) ? body.ingredients : [];
  if (ingredients.length === 0) {
    return new Response(
      JSON.stringify({ error: "No ingredients provided" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.info(
    `[refresh-flipp] Starting run for ${ingredients.length} ingredients`,
  );

  await processInBatches(supabase, ingredients, postalCode);

  console.info("[refresh-flipp] Run complete");

  return new Response(
    JSON.stringify({ ok: true, processed: ingredients.length }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
