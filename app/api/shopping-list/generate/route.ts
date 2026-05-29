/**
 * POST /api/shopping-list/generate
 *
 * Wipes the current week's shopping_list_items rows and inserts fresh ones
 * generated from:
 *   - This week's meals + ingredients
 *   - Current (non-deleted) pantry items
 *   - All Flipp cache rows (including stale — the UI shows a stale marker)
 *   - Accepted optimization suggestions
 *
 * No body required. Returns { count: number } on success.
 */

import { NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabase/server";
import { currentMondayISO } from "@/app/_lib/weekOf";
import { generateShoppingList } from "@/lib/shopping-list/generate";
import { effectiveFactor, scaleIngredients } from "@/lib/recipe/scale";
import type { ShoppingListItemInsert } from "@/types/database";

export async function POST() {
  const weekOf = currentMondayISO();

  // ---- 1. Load meals + ingredients for current week ------------------------
  const { data: mealsData, error: mealsError } = await supabaseServerClient
    .from("meals")
    .select("id, title, week_of, headcount, serves, scale_override")
    .eq("week_of", weekOf);

  if (mealsError) {
    return NextResponse.json({ error: mealsError.message }, { status: 500 });
  }

  const mealIds = (mealsData ?? []).map((m) => m.id);

  const { data: ingredientsData, error: ingredientsError } =
    mealIds.length > 0
      ? await supabaseServerClient
          .from("meal_ingredients")
          .select("meal_id, name, quantity")
          .in("meal_id", mealIds)
      : { data: [], error: null };

  if (ingredientsError) {
    return NextResponse.json({ error: ingredientsError.message }, { status: 500 });
  }

  // Group ingredients by meal
  const ingredientsByMeal = new Map<
    string,
    { name: string; quantity: string | null }[]
  >();
  for (const ing of ingredientsData ?? []) {
    if (!ing.meal_id) continue;
    if (!ingredientsByMeal.has(ing.meal_id)) {
      ingredientsByMeal.set(ing.meal_id, []);
    }
    ingredientsByMeal.get(ing.meal_id)!.push({
      name: ing.name,
      quantity: ing.quantity ?? null,
    });
  }

  // Scale each meal's ingredients by its effective factor so purchased
  // amounts match what's actually cooked for this week's headcount.
  const mealsById = new Map((mealsData ?? []).map((m) => [m.id, m]));
  const meals = mealIds.map((id) => {
    const m = mealsById.get(id);
    const factor = m ? effectiveFactor(m) : 1;
    return {
      ingredients: scaleIngredients(ingredientsByMeal.get(id) ?? [], factor),
    };
  });

  // ---- 2. Load pantry (non-deleted) ----------------------------------------
  const { data: pantryData, error: pantryError } = await supabaseServerClient
    .from("pantry_items")
    .select("name")
    .is("deleted_at", null);

  if (pantryError) {
    return NextResponse.json({ error: pantryError.message }, { status: 500 });
  }

  // ---- 3. Load all Flipp cache rows ----------------------------------------
  const { data: flippData, error: flippError } = await supabaseServerClient
    .from("flipp_cache")
    .select("*");

  if (flippError) {
    return NextResponse.json({ error: flippError.message }, { status: 500 });
  }

  // ---- 4. Load accepted suggestions ----------------------------------------
  const { data: suggestionsData, error: suggestionsError } =
    await supabaseServerClient
      .from("optimization_suggestions")
      .select("*")
      .eq("status", "accepted");

  if (suggestionsError) {
    return NextResponse.json(
      { error: suggestionsError.message },
      { status: 500 }
    );
  }

  // ---- 5. Run pure generation function -------------------------------------
  const generated = generateShoppingList({
    meals,
    pantry: pantryData ?? [],
    flipp: (flippData ?? []).map((row) => ({
      id: row.id,
      ingredient_query: row.ingredient_query,
      merchant_name: row.merchant_name,
      item_name: row.item_name,
      current_price: row.current_price,
      post_price_text: row.post_price_text,
      valid_from: row.valid_from,
      valid_to: row.valid_to,
      fetched_at: row.fetched_at,
    })),
    acceptedSuggestions: suggestionsData ?? [],
  });

  // ---- 6. Wipe current week and insert fresh rows --------------------------
  const { error: deleteError } = await supabaseServerClient
    .from("shopping_list_items")
    .delete()
    .eq("week_of", weekOf);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (generated.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  const inserts: ShoppingListItemInsert[] = generated.map((item) => ({
    week_of: weekOf,
    name: item.name,
    quantity: item.quantity,
    assigned_store: item.assigned_store,
    flipp_cache_id: item.flipp_cache_id,
    pantry_match: item.pantry_match,
    checked_off: false,
  }));

  const { data: insertedData, error: insertError } = await supabaseServerClient
    .from("shopping_list_items")
    .insert(inserts)
    .select();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ count: insertedData?.length ?? 0 });
}
