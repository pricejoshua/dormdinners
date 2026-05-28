import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase/server';
import { optimize } from '@/lib/llm/optimize';
import { currentMondayISO, isMondayISO } from '@/app/_lib/weekOf';
import { LLMParseError, LLMRequestError } from '@/lib/llm/types';
import type { OptimizationSuggestionRow } from '@/types/database';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  // Default to the current week; accept an optional { weekOf } override.
  let weekOf = currentMondayISO();
  try {
    const body = (await request.json()) as { weekOf?: unknown };
    if (typeof body?.weekOf === 'string' && isMondayISO(body.weekOf)) {
      weekOf = body.weekOf;
    }
  } catch {
    // No/invalid body → keep the current-week default.
  }

  // ── 1. Load this week's meals ─────────────────────────────────────────────
  const { data: meals, error: mealsError } = await supabaseServerClient
    .from('meals')
    .select('*')
    .eq('week_of', weekOf)
    .order('created_at', { ascending: true });

  if (mealsError) {
    return NextResponse.json({ error: mealsError.message }, { status: 500 });
  }

  const mealRows = meals ?? [];

  if (mealRows.length === 0) {
    return NextResponse.json({ error: 'No meals found for this week.' }, { status: 400 });
  }

  const mealIds = mealRows.map((m) => m.id);

  // ── 2. Load ingredients for those meals ───────────────────────────────────
  const { data: ingredients, error: ingError } = await supabaseServerClient
    .from('meal_ingredients')
    .select('*')
    .in('meal_id', mealIds)
    .order('created_at', { ascending: true });

  if (ingError) {
    return NextResponse.json({ error: ingError.message }, { status: 500 });
  }

  const ingredientsByMeal = new Map<string, { name: string; quantity: string }[]>();
  for (const ing of ingredients ?? []) {
    if (!ing.meal_id) continue;
    const list = ingredientsByMeal.get(ing.meal_id) ?? [];
    list.push({ name: ing.name, quantity: ing.quantity ?? '' });
    ingredientsByMeal.set(ing.meal_id, list);
  }

  // ── 3. Load non-deleted pantry items ──────────────────────────────────────
  const { data: pantryData, error: pantryError } = await supabaseServerClient
    .from('pantry_items')
    .select('name, notes')
    .is('deleted_at', null);

  if (pantryError) {
    return NextResponse.json({ error: pantryError.message }, { status: 500 });
  }

  // ── 4. Load current Flipp cache rows ──────────────────────────────────────
  const { data: flippData, error: flippError } = await supabaseServerClient
    .from('flipp_cache')
    .select('item_name, merchant_name, current_price, post_price_text')
    .gte('valid_to', new Date().toISOString());

  if (flippError) {
    return NextResponse.json({ error: flippError.message }, { status: 500 });
  }

  // ── 5. Derive headcount from meals ────────────────────────────────────────
  const headcount = mealRows.find((m) => m.headcount != null)?.headcount ?? 1;

  // ── 6. Build optimize input ───────────────────────────────────────────────
  const optimizeInput = {
    headcount,
    pantry: (pantryData ?? []).map((p) => ({ name: p.name, notes: p.notes })),
    flipp: (flippData ?? [])
      .filter(
        (f) =>
          f.item_name != null &&
          f.merchant_name != null &&
          f.current_price != null &&
          f.post_price_text != null,
      )
      .map((f) => ({
        item_name: f.item_name as string,
        merchant_name: f.merchant_name as string,
        current_price: f.current_price as number,
        post_price_text: f.post_price_text as string,
      })),
    meals: mealRows.map((meal) => ({
      title: meal.title,
      ingredients: ingredientsByMeal.get(meal.id) ?? [],
    })),
  };

  // ── 7. Call LLM ───────────────────────────────────────────────────────────
  let suggestions: Awaited<ReturnType<typeof optimize>>;
  try {
    suggestions = await optimize(optimizeInput);
  } catch (err) {
    if (err instanceof LLMParseError) {
      return NextResponse.json(
        { error: `LLM returned malformed JSON: ${err.message}` },
        { status: 502 },
      );
    }
    if (err instanceof LLMRequestError) {
      return NextResponse.json(
        { error: `LLM request failed: ${err.message}` },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: 'Unexpected error during optimization.' }, { status: 500 });
  }

  if (suggestions.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  // ── 8. Map meal_indices → meal_ids and insert ─────────────────────────────
  const inserts = suggestions.map((s) => ({
    meal_ids: s.meal_indices
      .filter((idx) => idx >= 0 && idx < mealRows.length)
      .map((idx) => mealRows[idx].id),
    suggestion_type: s.type,
    description: s.description,
    estimated_saving: s.estimated_saving || null,
    status: 'pending' as const,
  }));

  const { data: inserted, error: insertError } = await supabaseServerClient
    .from('optimization_suggestions')
    .insert(inserts)
    .select();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ suggestions: inserted as OptimizationSuggestionRow[] });
}
