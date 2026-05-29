import 'server-only';

import { generateText } from 'ai';
import { getModel } from './client';
import { LLMParseError, LLMRequestError, type Suggestion } from './types';

export interface OptimizeInput {
  headcount: number;
  pantry: { name: string; notes: string | null }[];
  flipp: {
    item_name: string;
    merchant_name: string;
    current_price: number;
    post_price_text: string;
  }[];
  meals: {
    title: string;
    ingredients: { name: string; quantity: string }[];
  }[];
}

function formatPantry(pantry: OptimizeInput['pantry']): string {
  if (pantry.length === 0) return '(none)';
  return pantry
    .map((p) => (p.notes ? `${p.name} (${p.notes})` : p.name))
    .join(', ');
}

function formatFlipp(flipp: OptimizeInput['flipp']): string {
  if (flipp.length === 0) return '(no deals available)';
  return flipp
    .map(
      (f) =>
        `${f.item_name} - $${f.current_price}${f.post_price_text} at ${f.merchant_name}`,
    )
    .join('\n');
}

function formatMeals(meals: OptimizeInput['meals']): string {
  return meals
    .map((meal, i) => {
      const ingredients = meal.ingredients
        .map((ing) => `${ing.name} ${ing.quantity}`.trim())
        .join(', ');
      return `  ${i + 1}. ${meal.title}: ${ingredients}`;
    })
    .join('\n');
}

export async function optimize(input: OptimizeInput): Promise<Suggestion[]> {
  const prompt = `You are helping a university cooking group plan their week efficiently.

Headcount: ${input.headcount}
Pantry: ${formatPantry(input.pantry)}
This week's Flipp deals: ${formatFlipp(input.flipp)}
Meals planned:
${formatMeals(input.meals)}

Identify opportunities to save money or reduce waste. Look for:
- Ingredients that appear in multiple meals (bulk buy opportunity)
- Cheaper ingredient substitutions based on this week's deals
- Ingredient swaps that can optimize purchasing in bulk (e.g. ground pork to ground beef, if ground beef is already being used)
- Pantry items that could replace something on the shopping list
- Bulk sizes that make sense given headcount

Return a JSON array of suggestions:
[{
  type: "bulk_buy" | "substitution" | "overlap" | "pantry_use",
  meal_indices: [0, 2],
  description: "human readable suggestion",
}]
Return only JSON, no preamble.`;

  let text: string;

  try {
    const result = await generateText({
      model: getModel(),
      maxTokens: 2048,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });
    text = result.text;
  } catch (err) {
    throw new LLMRequestError('LLM request failed during optimization', err);
  }

  let parsed: unknown;
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    throw new LLMParseError('Failed to parse JSON from optimization response', text);
  }

  if (!Array.isArray(parsed)) {
    throw new LLMParseError('Expected JSON array from optimization response', text);
  }

  const validTypes = new Set(['bulk_buy', 'substitution', 'overlap', 'pantry_use']);

  return parsed.map((item: unknown, i: number) => {
    if (typeof item !== 'object' || item === null) {
      throw new LLMParseError(`Suggestion at index ${i} is not an object`, text);
    }
    const obj = item as Record<string, unknown>;

    if (!validTypes.has(obj.type as string)) {
      throw new LLMParseError(
        `Suggestion at index ${i} has invalid type: "${obj.type}"`,
        text,
      );
    }
    if (!Array.isArray(obj.meal_indices)) {
      throw new LLMParseError(
        `Suggestion at index ${i} missing "meal_indices" array`,
        text,
      );
    }
    if (typeof obj.description !== 'string') {
      throw new LLMParseError(
        `Suggestion at index ${i} missing string "description"`,
        text,
      );
    }

    return {
      type: obj.type as Suggestion['type'],
      meal_indices: obj.meal_indices as number[],
      description: obj.description,
    };
  });
}
