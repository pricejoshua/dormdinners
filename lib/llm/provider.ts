import 'server-only';

import { createAnthropic } from '@ai-sdk/anthropic';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

type Provider = 'anthropic' | 'groq' | 'openrouter';

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'anthropic/claude-haiku-4.5',
};

export function getModel(): LanguageModel {
  const provider = (process.env.LLM_PROVIDER ?? 'anthropic') as Provider;
  const modelId = process.env.LLM_MODEL ?? DEFAULT_MODELS[provider];

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic',
      );
    }
    const client = createAnthropic({ apiKey });
    return client(modelId);
  }

  if (provider === 'groq') {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is required when LLM_PROVIDER=groq');
    }
    const client = createGroq({ apiKey });
    return client(modelId);
  }

  if (provider === 'openrouter') {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter',
      );
    }
    const client = createOpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    return client(modelId);
  }

  throw new Error(
    `Unknown LLM_PROVIDER: "${provider}". Must be one of: anthropic, groq, openrouter`,
  );
}

// Vision-capable model — always Anthropic since Groq/OpenRouter configs may not support images.
// Override the model with LLM_VISION_MODEL env var if needed.
export function getVisionModel(): LanguageModel {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required for vision (receipt parsing)');
  }
  const modelId = process.env.LLM_VISION_MODEL ?? 'claude-haiku-4-5-20251001';
  return createAnthropic({ apiKey })(modelId);
}
