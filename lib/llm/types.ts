import 'server-only';

export interface Suggestion {
  type: 'bulk_buy' | 'substitution' | 'overlap' | 'pantry_use';
  meal_indices: number[];
  description: string;
  estimated_saving: string;
}

export class LLMParseError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message);
    this.name = 'LLMParseError';
  }
}

export class LLMRequestError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LLMRequestError';
  }
}
