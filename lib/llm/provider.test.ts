import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all AI SDK provider factories
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn((opts: { apiKey: string }) => {
    return (modelId: string) => ({ provider: 'anthropic', modelId, apiKey: opts.apiKey });
  }),
}));

vi.mock('@ai-sdk/groq', () => ({
  createGroq: vi.fn((opts: { apiKey: string }) => {
    return (modelId: string) => ({ provider: 'groq', modelId, apiKey: opts.apiKey });
  }),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn((opts: { apiKey: string; baseURL: string }) => {
    return (modelId: string) => ({ provider: 'openai-compat', modelId, apiKey: opts.apiKey, baseURL: opts.baseURL });
  }),
}));

describe('provider matrix', () => {
  beforeEach(() => {
    // Clean env before each test
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  it('defaults to anthropic with claude-haiku-4-5-20251001', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    // LLM_PROVIDER not set — should default to anthropic

    // Re-import to get fresh module with updated env
    const { getModel } = await import('./provider');
    const model = getModel() as unknown as { provider: string; modelId: string };

    expect(model.provider).toBe('anthropic');
    expect(model.modelId).toBe('claude-haiku-4-5-20251001');
  });

  it('selects anthropic provider when LLM_PROVIDER=anthropic', async () => {
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

    const { getModel } = await import('./provider');
    const model = getModel() as unknown as { provider: string; modelId: string };

    expect(model.provider).toBe('anthropic');
    expect(model.modelId).toBe('claude-haiku-4-5-20251001');
  });

  it('selects groq provider when LLM_PROVIDER=groq', async () => {
    process.env.LLM_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'test-groq-key';

    const { getModel } = await import('./provider');
    const model = getModel() as unknown as { provider: string; modelId: string };

    expect(model.provider).toBe('groq');
    expect(model.modelId).toBe('llama-3.3-70b-versatile');
  });

  it('selects openrouter provider when LLM_PROVIDER=openrouter', async () => {
    process.env.LLM_PROVIDER = 'openrouter';
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

    const { getModel } = await import('./provider');
    const model = getModel() as unknown as { provider: string; modelId: string; baseURL: string };

    expect(model.provider).toBe('openai-compat');
    expect(model.modelId).toBe('anthropic/claude-haiku-4.5');
    expect(model.baseURL).toBe('https://openrouter.ai/api/v1');
  });

  it('respects LLM_MODEL override', async () => {
    process.env.LLM_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.LLM_MODEL = 'custom-model-id';

    const { getModel } = await import('./provider');
    const model = getModel() as unknown as { modelId: string };

    expect(model.modelId).toBe('custom-model-id');
  });

  it('throws when anthropic API key is missing', async () => {
    process.env.LLM_PROVIDER = 'anthropic';
    // ANTHROPIC_API_KEY not set

    const { getModel } = await import('./provider');
    expect(() => getModel()).toThrow('ANTHROPIC_API_KEY');
  });

  it('throws when groq API key is missing', async () => {
    process.env.LLM_PROVIDER = 'groq';
    // GROQ_API_KEY not set

    const { getModel } = await import('./provider');
    expect(() => getModel()).toThrow('GROQ_API_KEY');
  });

  it('throws when openrouter API key is missing', async () => {
    process.env.LLM_PROVIDER = 'openrouter';
    // OPENROUTER_API_KEY not set

    const { getModel } = await import('./provider');
    expect(() => getModel()).toThrow('OPENROUTER_API_KEY');
  });

  it('throws on unknown provider', async () => {
    process.env.LLM_PROVIDER = 'unknown-provider';

    const { getModel } = await import('./provider');
    expect(() => getModel()).toThrow('Unknown LLM_PROVIDER');
  });
});
