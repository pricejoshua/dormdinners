import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./provider', () => ({
  getModel: vi.fn(() => ({ _tag: 'mock-model' })),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import { generateText } from 'ai';
import { suggestMeals } from './suggestMeals';
import { LLMParseError, LLMRequestError } from './types';

const mockGenerateText = vi.mocked(generateText);

const baseInput = {
  pantry: [{ name: 'olive oil', notes: null }],
  meals: [{ title: 'Pasta', ingredients: [{ name: 'pasta', quantity: '500g' }] }],
};

describe('suggestMeals', () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it('returns parsed meal names with reasons', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify([
        { name: 'Fried Rice', reason: 'Uses leftover rice from pantry' },
        { name: 'Lentil Soup', reason: 'Reuses the lentils already planned' },
      ]),
    } as never);
    const result = await suggestMeals(baseInput);
    expect(result).toEqual([
      { name: 'Fried Rice', reason: 'Uses leftover rice from pantry' },
      { name: 'Lentil Soup', reason: 'Reuses the lentils already planned' },
    ]);
  });

  it('filters out items missing name or reason', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify([
        { name: 'Fried Rice', reason: 'Good use of pantry' },
        { name: '', reason: 'Some reason' },
        { name: 'Lentil Soup', reason: '' },
        { reason: 'No name here' },
        { name: 'Pasta' },  // missing reason key entirely
      ]),
    } as never);
    const result = await suggestMeals(baseInput);
    expect(result).toEqual([{ name: 'Fried Rice', reason: 'Good use of pantry' }]);
  });

  it('includes dietary restrictions as a hard constraint in the prompt', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify([{ name: 'Fried Rice', reason: 'Quick weeknight meal' }]),
    } as never);
    await suggestMeals({ ...baseInput, dietaryRestrictions: 'no nuts' });
    const call = mockGenerateText.mock.calls[0][0];
    const prompt = (call.messages as Array<{ content: string }>)[0].content;
    expect(prompt).toContain('Dietary restrictions: no nuts');
  });

  it('omits dietary restrictions line when not provided', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify([{ name: 'Fried Rice', reason: 'Quick weeknight meal' }]),
    } as never);
    await suggestMeals(baseInput);
    const call = mockGenerateText.mock.calls[0][0];
    const prompt = (call.messages as Array<{ content: string }>)[0].content;
    expect(prompt).not.toContain('Dietary restrictions');
  });

  it('throws LLMRequestError when generateText throws', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('network'));
    await expect(suggestMeals(baseInput)).rejects.toBeInstanceOf(LLMRequestError);
  });

  it('throws LLMParseError when response is not valid JSON', async () => {
    mockGenerateText.mockResolvedValueOnce({ text: 'not json' } as never);
    await expect(suggestMeals(baseInput)).rejects.toBeInstanceOf(LLMParseError);
  });
});
