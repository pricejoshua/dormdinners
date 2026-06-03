import { NextResponse } from 'next/server';
import { supabaseServerClient } from '@/lib/supabase/server';
import { verifyMealDietary } from '@/lib/llm/verifyMealDietary';
import { LLMParseError, LLMRequestError } from '@/lib/llm/types';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id: mealId } = await context.params;

  // 1. Load meal
  const { data: meal, error: mealError } = await supabaseServerClient
    .from('meals')
    .select('id, title, week_of')
    .eq('id', mealId)
    .maybeSingle();

  if (mealError) {
    return NextResponse.json({ error: mealError.message }, { status: 500 });
  }
  if (!meal) {
    return NextResponse.json({ error: 'Meal not found' }, { status: 404 });
  }

  // 2. Load ingredients
  const { data: ingredients, error: ingError } = await supabaseServerClient
    .from('meal_ingredients')
    .select('name, quantity')
    .eq('meal_id', mealId)
    .order('created_at', { ascending: true });

  if (ingError) {
    return NextResponse.json({ error: ingError.message }, { status: 500 });
  }

  // 3. Load effective dietary restrictions (same logic as suggest-meals)
  const [settingsResult, weekSettingsResult] = await Promise.all([
    supabaseServerClient
      .from('app_settings')
      .select('value')
      .eq('key', 'dietary_restrictions')
      .maybeSingle(),
    supabaseServerClient
      .from('week_settings')
      .select('dietary_restrictions')
      .eq('week_of', meal.week_of)
      .maybeSingle(),
  ]);

  const standingRestrictions = settingsResult.data?.value ?? '';
  const weekOverride = weekSettingsResult.data ? weekSettingsResult.data.dietary_restrictions : null;
  const dietaryRestrictions = (weekOverride !== null ? weekOverride : standingRestrictions) || '';

  // 4. Short-circuit if no restrictions are set
  if (!dietaryRestrictions.trim()) {
    return NextResponse.json({ ok: true, adaptations: [] });
  }

  // 5. Call LLM
  let result: { ok: boolean; adaptations: string[] };
  try {
    result = await verifyMealDietary({
      title: meal.title,
      ingredients: (ingredients ?? []).map((i) => ({ name: i.name, quantity: i.quantity ?? null })),
      dietaryRestrictions,
    });
  } catch (err) {
    if (err instanceof LLMParseError) {
      console.error('[verify-dietary] LLM parse error:', err.raw);
      return NextResponse.json({ error: `LLM returned malformed JSON: ${err.message}` }, { status: 502 });
    }
    if (err instanceof LLMRequestError) {
      console.error('[verify-dietary] LLM request error:', err.cause);
      return NextResponse.json({ error: `LLM request failed: ${err.message}` }, { status: 502 });
    }
    return NextResponse.json({ error: 'Unexpected error during dietary verification.' }, { status: 500 });
  }

  return NextResponse.json(result);
}
