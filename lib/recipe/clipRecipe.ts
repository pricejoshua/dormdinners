import 'server-only';

import { JSDOM } from 'jsdom';
import { clipRecipe as runClipper } from '@julianpoy/recipe-clipper';
import { parseIngredient } from 'parse-ingredient';
import type { RecipeIngredient } from '@/lib/llm/extractRecipe';

export interface ClippedRecipe {
  ingredients: RecipeIngredient[];
  /** Recipe's canonical yield (e.g. "Serves 4-6" → 4), or null if unknown. */
  serves: number | null;
}

/**
 * Extract recipe ingredients and yield from a page's HTML using RecipeClipper
 * (CSS-selector based, ML disabled) running under JSDOM.
 *
 * Ingredients use the same `{ name, quantity, unit }` shape as the LLM
 * extractor so the route can treat both paths uniformly. Returns empty
 * ingredients (and never throws) when no recipe is found or extraction fails,
 * so callers can fall through to the LLM.
 */
export async function clipRecipe(html: string, baseUrl: string): Promise<ClippedRecipe> {
  let ingredientsText = '';
  let yieldText = '';

  try {
    const dom = new JSDOM(html, { url: baseUrl });
    const result = await runClipper({ window: dom.window, mlDisable: true });
    ingredientsText = typeof result?.ingredients === 'string' ? result.ingredients : '';
    yieldText = typeof result?.yield === 'string' ? result.yield : '';
  } catch (err) {
    console.error('recipe-clipper extraction failed:', err);
    return { ingredients: [], serves: null };
  }

  return {
    ingredients: parseIngredientLines(ingredientsText),
    serves: parseServes(yieldText),
  };
}

/** Pull the first positive integer out of a yield string ("Serves 4-6" → 4). */
function parseServes(yieldText: string): number | null {
  const match = yieldText.match(/\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * RecipeClipper returns ingredients as a newline-delimited string of raw lines
 * (e.g. "2 cups flour"). Split and run each through `parse-ingredient` to
 * recover a structured name/quantity/unit, dropping blanks and group headers.
 */
function parseIngredientLines(text: string): RecipeIngredient[] {
  const out: RecipeIngredient[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    for (const item of parseIngredient(trimmed)) {
      if (item.isGroupHeader) continue;

      const name = (item.description ?? '').trim();
      if (!name) continue;

      out.push({
        name,
        quantity: formatQuantity(item.quantity, item.quantity2),
        unit: item.unitOfMeasure ?? '',
      });
    }
  }

  return out;
}

/** Join a quantity (and optional range upper bound) into a display string. */
function formatQuantity(quantity: number | null, quantity2: number | null): string {
  if (quantity == null) return '';
  return quantity2 != null ? `${quantity}-${quantity2}` : String(quantity);
}
