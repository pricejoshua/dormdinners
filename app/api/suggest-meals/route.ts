import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase/server';
import { suggestMeals } from '@/lib/llm/suggestMeals';
import { currentMondayISO, isMondayISO } from '@/app/_lib/weekOf';
import { LLMParseError, LLMRequestError } from '@/lib/llm/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  let weekOf = currentMondayISO();
  let preferences: string | undefined;

  try {
    const body = (await request.json()) as { weekOf?: unknown; preferences?: unknown };
    if (typeof body?.weekOf === 'string' && isMondayISO(body.weekOf)) {
      weekOf = body.weekOf;
    }
    if (typeof body?.preferences === 'string' && body.preferences.trim()) {
      preferences = body.preferences.trim();
    }
  } catch {
    // No/invalid body → use defaults
  }

  // ── 1. Load this week's meals ──────────────────────────────────────────────
  const { data: meals, error: mealsError } = await supabaseServerClient
    .from('meals')
    .select('*')
    .eq('week_of', weekOf)
    .order('created_at', { ascending: true });

  if (mealsError) {
    return NextResponse.json({ error: mealsError.message }, { status: 500 });
  }

  const mealRows = meals ?? [];
  const mealIds = mealRows.map((m) => m.id);

  if (mealRows.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  // ── 2. Load ingredients ────────────────────────────────────────────────────
  const { data: ingredients, error: ingError } =
    mealIds.length > 0
      ? await supabaseServerClient
          .from('meal_ingredients')
          .select('*')
          .in('meal_id', mealIds)
          .order('created_at', { ascending: true })
      : { data: [], error: null };

  if (ingError) {
    return NextResponse.json({ error: ingError.message }, { status: 500 });
  }

  const ingredientsByMeal = new Map<string, { name: string; quantity: string | null }[]>();
  for (const ing of ingredients ?? []) {
    if (!ing.meal_id) continue;
    const list = ingredientsByMeal.get(ing.meal_id) ?? [];
    list.push({ name: ing.name, quantity: ing.quantity ?? null });
    ingredientsByMeal.set(ing.meal_id, list);
  }

  // ── 3. Load pantry ─────────────────────────────────────────────────────────
  const { data: pantryData, error: pantryError } = await supabaseServerClient
    .from('pantry_items')
    .select('name, notes')
    .is('deleted_at', null);

  if (pantryError) {
    return NextResponse.json({ error: pantryError.message }, { status: 500 });
  }

  // ── 4. Call LLM ────────────────────────────────────────────────────────────
  const input = {
    pantry: (pantryData ?? []).map((p) => ({ name: p.name, notes: p.notes })),
    meals: mealRows.map((meal) => ({
      title: meal.title,
      ingredients: ingredientsByMeal.get(meal.id) ?? [],
    })),
    preferences,
  };

  let suggestions: string[];
  try {
    suggestions = await suggestMeals(input);
  } catch (err) {
    if (err instanceof LLMParseError) {
      console.error('[suggest-meals] LLM parse error:', err.raw);
      return NextResponse.json({ error: `LLM returned malformed JSON: ${err.message}` }, { status: 502 });
    }
    if (err instanceof LLMRequestError) {
      console.error('[suggest-meals] LLM request error:', err.cause);
      return NextResponse.json({ error: `LLM request failed: ${err.message}` }, { status: 502 });
    }
    return NextResponse.json({ error: 'Unexpected error during meal suggestion.' }, { status: 500 });
  }

  return NextResponse.json({ suggestions });
}
