# Task 03 — LLM client helper (pluggable backend)

**Phase:** 1 (Foundations)
**Depends on:** 01 (uses env vars + packages it adds)
**Blocks:** 05 (recipe URL extraction), 07 (optimization pass)

## Goal

Server-side LLM helpers with **pluggable provider backends**. The same
function signatures work whether the active backend is Anthropic, Groq, or
OpenRouter — selected by env var, no code changes required.

Built on the **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/groq` +
`@ai-sdk/openai`).

## Deliverables

1. `lib/llm/provider.ts` — provider factory:
   - Reads `LLM_PROVIDER` env var: `anthropic` (default) | `groq` | `openrouter`.
   - Reads optional `LLM_MODEL` env var; falls back to a per-provider default:
     - `anthropic` → `claude-haiku-4-5-20251001`
     - `groq` → `llama-3.3-70b-versatile`
     - `openrouter` → `anthropic/claude-haiku-4.5`
   - Exports `getModel(): LanguageModel` returning a configured model
     instance.
   - For OpenRouter, uses `createOpenAI({ apiKey: OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1' })` from `@ai-sdk/openai` — OpenRouter exposes an OpenAI-compatible API.
   - Throws a clear error if the selected provider's API key is missing.

2. `lib/llm/anthropic.ts` → **rename concept to `lib/llm/client.ts`** —
   re-exports `getModel` from `provider.ts`. (Keep file name `client.ts` so
   future readers don't assume Anthropic-only.)

3. `lib/llm/extractRecipe.ts`:
   - Signature: `extractRecipe(html: string): Promise<{ name: string; quantity: string; unit: string }[]>`
   - Uses `generateText` (or `generateObject` with a Zod schema if cleaner)
     from `ai`, with `model: getModel()`.
   - Prompt from the design doc ("Extract a list of ingredients...").
   - Parses JSON; throws `LLMParseError` on bad output.

4. `lib/llm/optimize.ts`:
   - Signature:
     ```ts
     optimize(input: {
       headcount: number;
       pantry: { name: string; notes: string | null }[];
       flipp: { item_name: string; merchant_name: string; current_price: number; post_price_text: string }[];
       meals: { title: string; ingredients: { name: string; quantity: string }[] }[];
     }): Promise<Suggestion[]>
     ```
   - `Suggestion` shape per design doc.
   - Uses the optimization prompt verbatim from the design doc.
   - Same `getModel()` source — provider-agnostic.

5. `lib/llm/types.ts` — `Suggestion`, `LLMParseError`, `LLMRequestError`.

6. Tests (Vitest):
   - `lib/llm/provider.test.ts` — exercises each provider branch with mocked env vars.
   - One test per helper using a mocked model so no real API calls.

## Acceptance criteria

- All files compile under strict TS.
- `provider.test.ts` proves all three providers can be selected via env var
  alone, with no code changes.
- Helpers throw a typed error if the active provider's key is missing.
- No file imports `@ai-sdk/*` directly outside `provider.ts` — feature code
  only sees `getModel`, `extractRecipe`, `optimize`.

## Notes / constraints

- Add `import 'server-only'` at the top of every file in `lib/llm/`.
- `max_tokens: 2048` for optimize, `1024` for extractRecipe.
- Don't try to support streaming. Both calls are one-shot.
- Don't reinvent prompt caching — leave it off for now; call volume is tiny
  and provider support varies.
- The provider factory must be a singleton **per request**, not a process
  singleton — env vars can change between deploys but the SDK clients are
  cheap to construct, so a small per-call build is fine.
