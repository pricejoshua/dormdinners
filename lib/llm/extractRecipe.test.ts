import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock provider so no real model is needed
vi.mock('./provider', () => ({
  getModel: vi.fn(() => ({ _tag: 'mock-model' })),
}));

// Mock generateText from ai
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import { generateText } from 'ai';
import { extractRecipe } from './extractRecipe';
import { LLMParseError, LLMRequestError } from './types';

const mockGenerateText = vi.mocked(generateText);

describe('extractRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses a valid JSON ingredient array', async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify([
        { name: 'flour', quantity: '2', unit: 'cups' },
        { name: 'eggs', quantity: '3', unit: '' },
      ]),
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await extractRecipe('<html>recipe</html>');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'flour', quantity: '2', unit: 'cups' });
    expect(result[1]).toEqual({ name: 'eggs', quantity: '3', unit: '' });
  });

  it('strips markdown code fences from response', async () => {
    const json = JSON.stringify([{ name: 'sugar', quantity: '1', unit: 'cup' }]);
    mockGenerateText.mockResolvedValue({
      text: '```json\n' + json + '\n```',
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await extractRecipe('<html>recipe</html>');
    expect(result[0].name).toBe('sugar');
  });

  it('throws LLMParseError on invalid JSON', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'not valid json at all',
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(extractRecipe('<html>recipe</html>')).rejects.toThrow(LLMParseError);
  });

  it('throws LLMParseError when response is not an array', async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({ name: 'flour' }),
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(extractRecipe('<html>recipe</html>')).rejects.toThrow(LLMParseError);
  });

  it('throws LLMRequestError when generateText throws', async () => {
    mockGenerateText.mockRejectedValue(new Error('network error'));

    await expect(extractRecipe('<html>recipe</html>')).rejects.toThrow(LLMRequestError);
  });

  it('passes correct prompt structure to generateText', async () => {
    mockGenerateText.mockResolvedValue({
      text: '[]',
    } as Awaited<ReturnType<typeof generateText>>);

    await extractRecipe('<html>test content</html>');

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 1024,
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Extract a list of ingredients'),
          }),
        ]),
      }),
    );
  });
});
