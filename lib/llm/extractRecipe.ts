import 'server-only';

import { generateText } from 'ai';
import { getModel } from './client';
import { LLMParseError, LLMRequestError } from './types';

export interface RecipeIngredient {
  name: string;
  quantity: string;
  unit: string;
}

export interface ExtractedRecipe {
  ingredients: RecipeIngredient[];
  serves: number | null;
}

export async function extractRecipe(html: string): Promise<ExtractedRecipe> {
  let text: string;

  try {
    const result = await generateText({
      model: getModel(),
      maxTokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Extract recipe data from this page.
Return JSON: { "serves": <number or null>, "ingredients": [{ "name", "quantity", "unit" }] }
Return only JSON, no preamble.

${html}`,
        },
      ],
    });
    text = result.text;
    console.log('[extractRecipe] raw LLM response:', text);
  } catch (err) {
    throw new LLMRequestError('LLM request failed during recipe extraction', err);
  }

  let parsed: unknown;
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    throw new LLMParseError('Failed to parse JSON from recipe extraction response', text);
  }

  // Accept both the new object format and the legacy array format
  let ingredientsRaw: unknown[];
  let serves: number | null = null;

  if (Array.isArray(parsed)) {
    ingredientsRaw = parsed;
  } else if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    ingredientsRaw = Array.isArray(obj.ingredients) ? obj.ingredients : [];
    const s = obj.serves;
    if (typeof s === 'number' && Number.isFinite(s) && s > 0) serves = Math.round(s);
  } else {
    throw new LLMParseError('Expected JSON object or array from recipe extraction', text);
  }

  const ingredients = ingredientsRaw.map((item: unknown, i: number) => {
    if (typeof item !== 'object' || item === null) {
      throw new LLMParseError(`Item at index ${i} is not an object`, text);
    }
    const obj = item as Record<string, unknown>;
    if (typeof obj.name !== 'string') {
      throw new LLMParseError(`Item at index ${i} missing string "name"`, text);
    }
    return {
      name: obj.name,
      quantity: typeof obj.quantity === 'string' ? obj.quantity : String(obj.quantity ?? ''),
      unit: typeof obj.unit === 'string' ? obj.unit : String(obj.unit ?? ''),
    };
  });

  return { ingredients, serves };
}
