# Suggest Meals Reasoning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `reason` string to each meal suggestion, returned from the LLM and revealed in the UI via an expand/collapse toggle.

**Architecture:** Change the `suggestMeals` return type from `string[]` to `{ name: string; reason: string }[]`, update the prompt to request that shape, propagate the new type through the API route and React component, and add an inline expand/collapse per suggestion item.

**Tech Stack:** TypeScript, Next.js App Router, Vercel AI SDK (`generateText`), Vitest, React (useState), Tailwind CSS

---

### Task 1: Update `suggestMeals` tests for new object shape

**Files:**
- Modify: `lib/llm/suggestMeals.test.ts`

- [ ] **Step 1: Update the "returns parsed meal names" test**

Replace the existing test with one that expects objects:

```ts
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
```

- [ ] **Step 2: Add a test that filters items missing name or reason**

```ts
it('filters out items missing name or reason', async () => {
  mockGenerateText.mockResolvedValueOnce({
    text: JSON.stringify([
      { name: 'Fried Rice', reason: 'Good use of pantry' },
      { name: '', reason: 'Some reason' },
      { name: 'Lentil Soup', reason: '' },
      { reason: 'No name here' },
    ]),
  } as never);
  const result = await suggestMeals(baseInput);
  expect(result).toEqual([{ name: 'Fried Rice', reason: 'Good use of pantry' }]);
});
```

- [ ] **Step 3: Run tests to verify they fail**

```
npx vitest run lib/llm/suggestMeals.test.ts
```

Expected: the two modified/new tests FAIL (others pass).

---

### Task 2: Update `suggestMeals` implementation

**Files:**
- Modify: `lib/llm/suggestMeals.ts`

- [ ] **Step 1: Update the return type and prompt**

Replace the `suggestMeals` function signature and prompt in `lib/llm/suggestMeals.ts`:

```ts
export async function suggestMeals(input: SuggestMealsInput): Promise<{ name: string; reason: string }[]> {
```

Update the prompt instructions (replace the last two lines of the prompt string):

```ts
Suggest 6 meal ideas that would work well alongside the existing meals. Favour meals that:
- Reuse ingredients already appearing in the planned meals (reducing shopping)
- Draw on pantry items where possible
- Are practical for a group cooking setting

Return a JSON array of objects — no preamble, no markdown fences.
Each object must have exactly two fields: "name" (the meal title) and "reason" (one sentence explaining why it fits).
Example: [{"name":"Pasta Primavera","reason":"Uses the pasta and cherry tomatoes already in your pantry"},{"name":"Fried Rice","reason":"Reuses the rice from Monday's planned meal"}]
Return only JSON.`;
```

- [ ] **Step 2: Bump maxTokens to 2048**

```ts
const result = await generateText({
  model: getModel(),
  maxTokens: 2048,
  temperature: 0,
  messages: [{ role: 'user', content: prompt }],
});
```

- [ ] **Step 3: Update parse and return logic**

Replace the existing parse block and return statement:

```ts
  let parsed: unknown;
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    throw new LLMParseError('Failed to parse JSON from meal suggestion response', text);
  }

  if (!Array.isArray(parsed)) {
    throw new LLMParseError('Expected JSON array from meal suggestion response', text);
  }

  return parsed.filter(
    (item): item is { name: string; reason: string } =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).name === 'string' &&
      (item as Record<string, unknown>).name !== '' &&
      typeof (item as Record<string, unknown>).reason === 'string' &&
      (item as Record<string, unknown>).reason !== '',
  );
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run lib/llm/suggestMeals.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/llm/suggestMeals.ts lib/llm/suggestMeals.test.ts
git commit -m "feat: suggestMeals returns {name, reason} objects"
```

---

### Task 3: Update the API route

**Files:**
- Modify: `app/api/suggest-meals/route.ts`

- [ ] **Step 1: Update the `suggestions` type in the route**

On line 106, change:

```ts
let suggestions: { name: string; reason: string }[];
```

On line 121, the return is already `{ suggestions }` — no change needed there.

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/suggest-meals/route.ts
git commit -m "feat: propagate {name, reason} type through suggest-meals route"
```

---

### Task 4: Update `MealSuggestions` component

**Files:**
- Modify: `app/MealSuggestions.tsx`

- [ ] **Step 1: Update the `suggestions` state type and fetch handling**

Change the state declaration and fetch result handling:

```ts
const [suggestions, setSuggestions] = useState<{ name: string; reason: string }[]>([]);
```

In the `generate` function, update the response parsing:

```ts
const json = (await res.json()) as { suggestions?: { name: string; reason: string }[]; error?: string };
if (!res.ok) {
  setError(json.error ?? 'Suggestion failed.');
} else {
  setSuggestions(json.suggestions ?? []);
}
```

- [ ] **Step 2: Update `SuggestionItem` to accept and display `reason`**

Replace the `SuggestionItemProps` interface and component:

```ts
interface SuggestionItemProps {
  name: string;
  reason: string;
  emptySlots: SuggestionSlot[];
  onAccept: (slotKey: string) => void;
  onDismiss: () => void;
}

function SuggestionItem({ name, reason, emptySlots, onAccept, onDismiss }: SuggestionItemProps) {
  const [preferredKey, setPreferredKey] = useState<string>(
    emptySlots[0]?.key ?? '',
  );
  const [showReason, setShowReason] = useState(false);

  const validKey =
    emptySlots.find((s) => s.key === preferredKey)?.key ?? emptySlots[0]?.key ?? '';
  const canAccept = validKey !== '';

  return (
    <li className="py-1.5 border-b border-gray-100 last:border-b-0 text-sm">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowReason((v) => !v)}
          className="text-gray-400 hover:text-gray-600 text-xs shrink-0 w-3 text-left"
          aria-label={showReason ? 'Hide reason' : 'Show reason'}
        >
          {showReason ? '▾' : '▸'}
        </button>

        <span className="flex-1 text-gray-800">{name}</span>

        {canAccept && (
          <select
            value={validKey}
            onChange={(e) => setPreferredKey(e.target.value)}
            className="text-xs border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-gray-500 shrink-0"
          >
            {emptySlots.map((s) => (
              <option key={s.key} value={s.key}>
                {(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const)[s.index] ?? `Slot ${s.index + 1}`}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          disabled={!canAccept}
          onClick={() => onAccept(validKey)}
          className="text-xs px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          Accept
        </button>

        <button
          type="button"
          onClick={onDismiss}
          className="text-gray-400 hover:text-red-500 text-xs shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>

      {showReason && (
        <p className="mt-1 ml-5 text-xs text-gray-500 leading-relaxed">{reason}</p>
      )}
    </li>
  );
}
```

- [ ] **Step 3: Update the suggestion list render to pass `reason` and match on `name`**

Replace the `suggestions.map` block and the `handleAccept` / `handleDismiss` functions:

```ts
function handleAccept(name: string, slotKey: string) {
  onAccept(slotKey, name);
  setSuggestions((prev) => prev.filter((s) => s.name !== name));
}

function handleDismiss(name: string) {
  setSuggestions((prev) => prev.filter((s) => s.name !== name));
}
```

And in the render:

```tsx
{suggestions.map((suggestion, i) => (
  <SuggestionItem
    key={i}
    name={suggestion.name}
    reason={suggestion.reason}
    emptySlots={emptySlots}
    onAccept={(slotKey) => handleAccept(suggestion.name, slotKey)}
    onDismiss={() => handleDismiss(suggestion.name)}
  />
))}
```

- [ ] **Step 4: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/MealSuggestions.tsx
git commit -m "feat: show collapsible reasoning in meal suggestion items"
```
