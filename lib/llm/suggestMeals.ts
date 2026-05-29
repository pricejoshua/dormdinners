import 'server-only';

import { generateText } from 'ai';
import { getModel } from './client';
import { LLMParseError, LLMRequestError } from './types';

export interface SuggestMealsInput {
  pantry: { name: string; notes: string | null }[];
  meals: {
    title: string;
    ingredients: { name: string; quantity: string | null }[];
  }[];
  preferences?: string;
}

function formatPantry(pantry: SuggestMealsInput['pantry']): string {
  if (pantry.length === 0) return '(none)';
  return pantry.map((p) => (p.notes ? `${p.name} (${p.notes})` : p.name)).join(', ');
}

function formatMeals(meals: SuggestMealsInput['meals']): string {
  if (meals.length === 0) return '(none planned yet)';
  return meals
    .map((meal, i) => {
      const ings = meal.ingredients
        .map((ing) => (ing.quantity ? `${ing.name} ${ing.quantity}` : ing.name))
        .join(', ');
      return `  ${i + 1}. ${meal.title}${ings ? `: ${ings}` : ''}`;
    })
    .join('\n');
}

export async function suggestMeals(input: SuggestMealsInput): Promise<string[]> {
  const preferencesLine = input.preferences?.trim()
    ? `\nUser preferences: ${input.preferences.trim()}`
    : '';

  const prompt = `You are helping a university cooking group plan their week.

Pantry (already owned): ${formatPantry(input.pantry)}
Meals already planned this week:
${formatMeals(input.meals)}${preferencesLine}

Suggest 6 meal ideas that would work well alongside the existing meals. Favour meals that:
- Reuse ingredients already appearing in the planned meals (reducing shopping)
- Draw on pantry items where possible
- Are practical for a group cooking setting

Return a JSON array of meal name strings only — no descriptions, no explanations.
Example: ["Pasta Primavera", "Fried Rice", "Chicken Stir Fry", "Lentil Soup", "Veggie Tacos", "Shakshuka"]
Return only JSON, no preamble.`;

  let text: string;
  try {
    const result = await generateText({
      model: getModel(),
      maxTokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    text = result.text;
    console.log('[suggestMeals] raw LLM response:', text);
  } catch (err) {
    throw new LLMRequestError('LLM request failed during meal suggestion', err);
  }

  let parsed: unknown;
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    throw new LLMParseError('Failed to parse JSON from meal suggestion response', text);
  }

  if (!Array.isArray(parsed)) {
    throw new LLMParseError('Expected JSON array from meal suggestion response', text);
  }

  return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}
