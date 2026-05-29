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
import { optimize } from './optimize';
import { LLMParseError, LLMRequestError } from './types';

const mockGenerateText = vi.mocked(generateText);

const sampleInput = {
  headcount: 6,
  pantry: [
    { name: 'olive oil', notes: 'half full' },
    { name: 'garlic', notes: null },
  ],
  flipp: [
    {
      item_name: 'chicken thighs',
      merchant_name: 'Freshmart',
      current_price: 4.99,
      post_price_text: '/lb',
    },
  ],
  meals: [
    {
      title: 'Chicken stir fry',
      ingredients: [
        { name: 'chicken thighs', quantity: '1kg' },
        { name: 'broccoli', quantity: '2 heads' },
      ],
    },
    {
      title: 'Pasta',
      ingredients: [
        { name: 'pasta', quantity: '500g' },
        { name: 'tomatoes', quantity: '4' },
      ],
    },
  ],
};

const sampleSuggestions = [
  {
    type: 'bulk_buy',
    meal_indices: [0],
    description: 'Buy chicken thighs in bulk at Freshmart for $4.99/lb',
  },
  {
    type: 'pantry_use',
    meal_indices: [0, 1],
    description: 'Use pantry olive oil instead of buying more',
  },
];

describe('optimize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses a valid suggestions array', async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify(sampleSuggestions),
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await optimize(sampleInput);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('bulk_buy');
    expect(result[0].meal_indices).toEqual([0]);
    expect(result[1].type).toBe('pantry_use');
  });

  it('strips markdown code fences from response', async () => {
    const json = JSON.stringify(sampleSuggestions);
    mockGenerateText.mockResolvedValue({
      text: '```json\n' + json + '\n```',
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await optimize(sampleInput);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty suggestions', async () => {
    mockGenerateText.mockResolvedValue({
      text: '[]',
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await optimize(sampleInput);
    expect(result).toEqual([]);
  });

  it('throws LLMParseError on invalid JSON', async () => {
    mockGenerateText.mockResolvedValue({
      text: 'here are some suggestions: none',
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(optimize(sampleInput)).rejects.toThrow(LLMParseError);
  });

  it('throws LLMParseError when response is not an array', async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({ suggestion: 'buy bulk' }),
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(optimize(sampleInput)).rejects.toThrow(LLMParseError);
  });

  it('throws LLMParseError on invalid suggestion type', async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify([
        {
          type: 'invalid_type',
          meal_indices: [0],
          description: 'test',
        },
      ]),
    } as Awaited<ReturnType<typeof generateText>>);

    await expect(optimize(sampleInput)).rejects.toThrow(LLMParseError);
  });

  it('throws LLMRequestError when generateText throws', async () => {
    mockGenerateText.mockRejectedValue(new Error('API error'));

    await expect(optimize(sampleInput)).rejects.toThrow(LLMRequestError);
  });

  it('passes correct prompt with headcount and pantry to generateText', async () => {
    mockGenerateText.mockResolvedValue({
      text: '[]',
    } as Awaited<ReturnType<typeof generateText>>);

    await optimize(sampleInput);

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 2048,
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Headcount: 6'),
          }),
        ]),
      }),
    );

    const call = mockGenerateText.mock.calls[0][0];
    const content = (call.messages as Array<{ role: string; content: string }>)[0].content;
    expect(content).toContain('olive oil (half full)');
    expect(content).toContain('chicken thighs - $4.99/lb at Freshmart');
    expect(content).toContain('Chicken stir fry');
  });

  it('handles empty pantry gracefully', async () => {
    mockGenerateText.mockResolvedValue({
      text: '[]',
    } as Awaited<ReturnType<typeof generateText>>);

    await optimize({ ...sampleInput, pantry: [] });

    const call = mockGenerateText.mock.calls[0][0];
    const content = (call.messages as Array<{ role: string; content: string }>)[0].content;
    expect(content).toContain('Pantry: (none)');
  });

  it('handles empty flipp deals gracefully', async () => {
    mockGenerateText.mockResolvedValue({
      text: '[]',
    } as Awaited<ReturnType<typeof generateText>>);

    await optimize({ ...sampleInput, flipp: [] });

    const call = mockGenerateText.mock.calls[0][0];
    const content = (call.messages as Array<{ role: string; content: string }>)[0].content;
    expect(content).toContain('(no deals available)');
  });
});
