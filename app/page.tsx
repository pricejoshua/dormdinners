import { supabaseServerClient } from '@/lib/supabase/server';
import { currentMondayISO, isMondayISO } from '@/app/_lib/weekOf';
import WeekView from '@/app/WeekView';
import type { MealWithIngredients } from '@/app/WeeklyPlan';
import type { MealRow, MealIngredientRow, OptimizationSuggestionRow } from '@/types/database';

export const dynamic = 'force-dynamic';

/**
 * Fetches (without creating) the meals for a given week, ordered oldest-first.
 */
async function getWeekMeals(weekOf: string): Promise<MealRow[]> {
  const { data, error } = await supabaseServerClient
    .from('meals')
    .select('*')
    .eq('week_of', weekOf)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch meals: ${error.message}`);
  }
  return data ?? [];
}

interface PageProps {
  searchParams: { week?: string };
}

export default async function ThisWeekPage({ searchParams }: PageProps) {
  const weekOf =
    typeof searchParams.week === 'string' && isMondayISO(searchParams.week)
      ? searchParams.week
      : currentMondayISO();

  let meals: MealRow[];
  try {
    meals = await getWeekMeals(weekOf);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return (
      <div>
        <h1 className="text-lg font-semibold mb-4">This Week</h1>
        <p className="text-sm text-red-600">Failed to load meals: {message}</p>
      </div>
    );
  }

  // Fetch ingredients for the fetched meals (skip the query when there are none).
  const mealIds = meals.map((m) => m.id);
  const { data: allIngredients } =
    mealIds.length > 0
      ? await supabaseServerClient
          .from('meal_ingredients')
          .select('*')
          .in('meal_id', mealIds)
          .order('created_at', { ascending: true })
      : { data: [] as MealIngredientRow[] };

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

  // Load optimization suggestions that reference this week's meals.
  // The Supabase JS client has no uuid[] overlap operator, so we fetch all
  // suggestions and filter client-side (the table stays small).
  const weekMealSet = new Set(mealIds);
  const { data: suggestionsData } = await supabaseServerClient
    .from('optimization_suggestions')
    .select('*')
    .order('created_at', { ascending: false });

  // Reference prices (group-maintained) for the per-ingredient planner hint.
  const { data: referencePricesData } = await supabaseServerClient
    .from('reference_prices')
    .select('name, store, price, size_amount, size_unit')
    .is('deleted_at', null);

  const existingSuggestions: OptimizationSuggestionRow[] = (suggestionsData ?? []).filter((s) => {
    if (!Array.isArray(s.meal_ids)) return false;
    return (s.meal_ids as string[]).some((id) => weekMealSet.has(id));
  });

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">This Week</h1>
      <WeekView
        key={weekOf}
        weekOf={weekOf}
        meals={mealsWithIngredients}
        suggestions={existingSuggestions}
        referencePrices={referencePricesData ?? []}
      />
    </div>
  );
}
