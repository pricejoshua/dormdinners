import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./provider', () => ({
  getModel: vi.fn(() => ({ _tag: 'mock-model' })),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import { generateText } from 'ai';
import { verifyMealDietary } from './verifyMealDietary';
import { LLMParseError, LLMRequestError } from './types';

const mockGenerateText = vi.mocked(generateText);

const baseInput = {
  title: 'Pasta Bolognese',
  ingredients: [
    { name: 'pasta', quantity: '500g' },
    { name: 'beef mince', quantity: '400g' },
  ],
  dietaryRestrictions: 'vegetarian',
};

describe('verifyMealDietary', () => {
  beforeEach(() => {
    mockGenerateText.mockReset();
  });

  it('returns ok:true with empty adaptations when meal works as-is', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ ok: true, adaptations: [] }),
    } as never);
    const result = await verifyMealDietary(baseInput);
    expect(result).toEqual({ ok: true, adaptations: [] });
  });

  it('returns ok:false with adaptations when meal needs changes', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ ok: false, adaptations: ['swap beef mince for lentils', 'use vegetable stock'] }),
    } as never);
    const result = await verifyMealDietary(baseInput);
    expect(result).toEqual({
      ok: false,
      adaptations: ['swap beef mince for lentils', 'use vegetable stock'],
    });
  });

  it('filters out non-string and empty adaptations', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ ok: false, adaptations: ['use veggie stock', null, 42, ''] }),
    } as never);
    const result = await verifyMealDietary(baseInput);
    expect(result.adaptations).toEqual(['use veggie stock']);
  });

  it('includes meal title and restrictions in the prompt', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ ok: true, adaptations: [] }),
    } as never);
    await verifyMealDietary(baseInput);
    const call = mockGenerateText.mock.calls[0][0];
    const prompt = (call.messages as Array<{ content: string }>)[0].content;
    expect(prompt).toContain('Pasta Bolognese');
    expect(prompt).toContain('vegetarian');
  });

  it('throws LLMRequestError when generateText throws', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('network'));
    await expect(verifyMealDietary(baseInput)).rejects.toBeInstanceOf(LLMRequestError);
  });

  it('throws LLMParseError when response is not valid JSON', async () => {
    mockGenerateText.mockResolvedValueOnce({ text: 'not json' } as never);
    await expect(verifyMealDietary(baseInput)).rejects.toBeInstanceOf(LLMParseError);
  });

  it('throws LLMParseError when response has wrong shape (ok is not boolean)', async () => {
    mockGenerateText.mockResolvedValueOnce({ text: '{"ok":"yes","adaptations":[]}' } as never);
    await expect(verifyMealDietary(baseInput)).rejects.toBeInstanceOf(LLMParseError);
  });
});
