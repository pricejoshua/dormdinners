import 'server-only';

import { generateText } from 'ai';
import { getModel } from './client';
import { LLMParseError, LLMRequestError } from './types';

export interface RecipeIngredient {
  name: string;
  quantity: string;
  unit: string;
}

export async function extractRecipe(html: string): Promise<RecipeIngredient[]> {
  let text: string;

  try {
    const result = await generateText({
      model: getModel(),
      maxTokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Extract a list of ingredients from this recipe page.
Return JSON array: [{ name, quantity, unit }]
Return only JSON, no preamble.

${html}`,
        },
      ],
    });
    text = result.text;
  } catch (err) {
    throw new LLMRequestError('LLM request failed during recipe extraction', err);
  }

  let parsed: unknown;
  try {
    // Strip markdown code fences if present
    const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    throw new LLMParseError('Failed to parse JSON from recipe extraction response', text);
  }

  if (!Array.isArray(parsed)) {
    throw new LLMParseError('Expected JSON array from recipe extraction', text);
  }

  return parsed.map((item: unknown, i: number) => {
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
}
