import { supabaseServerClient } from '@/lib/supabase/server';
import { currentMondayISO } from '@/app/_lib/weekOf';
import WeeklyPlan, { type MealWithIngredients } from '@/app/WeeklyPlan';
import type { MealRow, MealIngredientRow } from '@/types/database';

export const dynamic = 'force-dynamic';

const MEAL_COUNT = 5;

/**
 * Ensures exactly MEAL_COUNT meal rows exist for the current week.
 * Tops up with blank rows if fewer exist. Returns all 5 meal rows.
 */
async function getOrCreateWeekMeals(): Promise<MealRow[]> {
  const weekOf = currentMondayISO();

  const { data: existing, error: fetchError } = await supabaseServerClient
    .from('meals')
    .select('*')
    .eq('week_of', weekOf)
    .order('created_at', { ascending: true });

  if (fetchError) {
    throw new Error(`Failed to fetch meals: ${fetchError.message}`);
  }

  const meals: MealRow[] = existing ?? [];

  if (meals.length < MEAL_COUNT) {
    const needed = MEAL_COUNT - meals.length;
    // Derive a shared headcount from existing meals, defaulting to 1
    const headcount = meals.find((m) => m.headcount != null)?.headcount ?? 1;

    const inserts = Array.from({ length: needed }, () => ({
      title: '',
      week_of: weekOf,
      headcount,
    }));

    const { data: inserted, error: insertError } = await supabaseServerClient
      .from('meals')
      .insert(inserts)
      .select();

    if (insertError) {
      throw new Error(`Failed to create meals: ${insertError.message}`);
    }

    meals.push(...(inserted ?? []));
    // Sort by created_at to keep stable order
    meals.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  return meals.slice(0, MEAL_COUNT);
}

export default async function ThisWeekPage() {
  let meals: MealRow[];
  try {
    meals = await getOrCreateWeekMeals();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return (
      <div>
        <h1 className="text-lg font-semibold mb-4">This Week</h1>
        <p className="text-sm text-red-600">Failed to load meals: {message}</p>
      </div>
    );
  }

  // Fetch ingredients for all meals in one query
  const mealIds = meals.map((m) => m.id);
  const { data: allIngredients } = await supabaseServerClient
    .from('meal_ingredients')
    .select('*')
    .in('meal_id', mealIds)
    .order('created_at', { ascending: true });

  const ingredientsByMeal = new Map<string, MealIngredientRow[]>();
  for (const ing of allIngredients ?? []) {
    if (!ing.meal_id) continue;
    const existing = ingredientsByMeal.get(ing.meal_id) ?? [];
    existing.push(ing);
    ingredientsByMeal.set(ing.meal_id, existing);
  }

  const mealsWithIngredients: MealWithIngredients[] = meals.map((meal) => ({
    ...meal,
    ingredients: ingredientsByMeal.get(meal.id) ?? [],
  }));

  const weekOf = currentMondayISO();

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-lg font-semibold">This Week</h1>
        <span className="text-xs text-gray-400">Week of {weekOf}</span>
      </div>
      <WeeklyPlan meals={mealsWithIngredients} />
    </div>
  );
}
