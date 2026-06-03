import 'server-only';

import { generateText } from 'ai';
import { getModel } from './client';
import { LLMParseError, LLMRequestError } from './types';

export interface VerifyMealDietaryInput {
  title: string;
  ingredients: { name: string; quantity: string | null }[];
  dietaryRestrictions: string;
}

export interface VerifyMealDietaryResult {
  ok: boolean;
  adaptations: string[];
}

function formatIngredients(ingredients: VerifyMealDietaryInput['ingredients']): string {
  if (ingredients.length === 0) return '(none listed)';
  return ingredients.map((i) => (i.quantity ? `${i.name} ${i.quantity}` : i.name)).join(', ');
}

export async function verifyMealDietary(input: VerifyMealDietaryInput): Promise<VerifyMealDietaryResult> {
  const prompt = `You are helping a university cooking group check if a meal accommodates dietary restrictions.

Meal: ${input.title}
Ingredients: ${formatIngredients(input.ingredients)}
Dietary restrictions in the group: ${input.dietaryRestrictions}

Does this meal work as-is for everyone given the restrictions? If not, list specific adaptations or side dishes so everyone can eat (e.g. "swap chicken broth for vegetable broth", "serve cheese on the side for dairy-free eaters", "cook a plain portion without the meat sauce").

Return JSON only — no preamble, no markdown fences.
If the meal works as-is: {"ok":true,"adaptations":[]}
If adaptations are needed: {"ok":false,"adaptations":["adaptation 1","adaptation 2"]}`;

  let text: string;
  try {
    const result = await generateText({
      model: getModel(),
      maxTokens: 1024,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });
    text = result.text;
  } catch (err) {
    throw new LLMRequestError('LLM request failed during dietary verification', err);
  }

  let parsed: unknown;
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    throw new LLMParseError('Failed to parse JSON from dietary verification response', text);
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).ok !== 'boolean' ||
    !Array.isArray((parsed as Record<string, unknown>).adaptations)
  ) {
    throw new LLMParseError('Unexpected shape in dietary verification response', text);
  }

  const obj = parsed as { ok: boolean; adaptations: unknown[] };
  return {
    ok: obj.ok,
    adaptations: obj.adaptations.filter((a): a is string => typeof a === 'string' && a.trim() !== ''),
  };
}
