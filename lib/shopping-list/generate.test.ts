/**
 * lib/shopping-list/generate.test.ts
 *
 * Vitest unit tests for the pure generateShoppingList function.
 */

import { describe, it, expect } from "vitest";
import {
  generateShoppingList,
  normaliseName,
  type GenerateInput,
  type GeneratedItem,
} from "./generate";
import type { FlippItem } from "@/lib/flipp";
import type { OptimizationSuggestionRow } from "@/types/database";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFlipp(
  overrides: Partial<FlippItem> & { id: string }
): FlippItem {
  return {
    ingredient_query: null,
    merchant_name: null,
    item_name: null,
    current_price: null,
    post_price_text: null,
    valid_from: null,
    valid_to: null,
    fetched_at: null,
    ...overrides,
  };
}

function makeSuggestion(
  overrides: Partial<OptimizationSuggestionRow> & { id: string }
): OptimizationSuggestionRow {
  return {
    meal_ids: null,
    suggestion_type: null,
    description: null,
    estimated_saving: null,
    status: "accepted",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function findItem(items: GeneratedItem[], name: string): GeneratedItem | undefined {
  return items.find(
    (i) => normaliseName(i.name) === normaliseName(name)
  );
}

// ---------------------------------------------------------------------------
// normaliseName
// ---------------------------------------------------------------------------

describe("normaliseName", () => {
  it("lowercases the name", () => {
    expect(normaliseName("Chicken Breast")).toBe("chicken breast");
  });

  it("trims whitespace", () => {
    expect(normaliseName("  eggs  ")).toBe("eggs");
  });

  it("collapses internal spaces", () => {
    expect(normaliseName("olive   oil")).toBe("olive oil");
  });
});

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

describe("deduplication", () => {
  it("deduplicates identical ingredient names across meals", () => {
    const input: GenerateInput = {
      meals: [
        { ingredients: [{ name: "Garlic", quantity: "3 cloves" }] },
        { ingredients: [{ name: "garlic", quantity: "2 cloves" }] },
      ],
      pantry: [],
      flipp: [],
      acceptedSuggestions: [],
    };
    const result = generateShoppingList(input);
    const garlic = result.filter((i) => normaliseName(i.name) === "garlic");
    expect(garlic).toHaveLength(1);
  });

  it("merges quantities from deduplicated items", () => {
    const input: GenerateInput = {
      meals: [
        { ingredients: [{ name: "Onion", quantity: "1 large" }] },
        { ingredients: [{ name: "onion", quantity: "2 medium" }] },
      ],
      pantry: [],
      flipp: [],
      acceptedSuggestions: [],
    };
    const result = generateShoppingList(input);
    const onion = findItem(result, "onion")!;
    expect(onion).toBeDefined();
    // Should combine both quantities
    expect(onion.quantity).toContain("1 large");
    expect(onion.quantity).toContain("2 medium");
  });

  it("deduplicates identical quantities", () => {
    const input: GenerateInput = {
      meals: [
        { ingredients: [{ name: "Salt", quantity: "1 tsp" }] },
        { ingredients: [{ name: "salt", quantity: "1 tsp" }] },
      ],
      pantry: [],
      flipp: [],
      acceptedSuggestions: [],
    };
    const result = generateShoppingList(input);
    const salt = findItem(result, "salt")!;
    // Same quantity — should not duplicate
    expect(salt.quantity).toBe("1 tsp");
  });

  it("handles null quantity gracefully", () => {
    const input: GenerateInput = {
      meals: [{ ingredients: [{ name: "Pepper", quantity: null }] }],
      pantry: [],
      flipp: [],
      acceptedSuggestions: [],
    };
    const result = generateShoppingList(input);
    const pepper = findItem(result, "pepper")!;
    expect(pepper.quantity).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pantry cross-reference
// ---------------------------------------------------------------------------

describe("pantry cross-reference", () => {
  it("sets pantry_match = true when pantry item name matches", () => {
    const input: GenerateInput = {
      meals: [{ ingredients: [{ name: "Rice", quantity: "2 cups" }] }],
      pantry: [{ name: "rice" }],
      flipp: [],
      acceptedSuggestions: [],
    };
    const result = generateShoppingList(input);
    const rice = findItem(result, "rice")!;
    expect(rice.pantry_match).toBe(true);
  });

  it("pantry_match is case-insensitive", () => {
    const input: GenerateInput = {
      meals: [{ ingredients: [{ name: "Olive Oil", quantity: "2 tbsp" }] }],
      pantry: [{ name: "OLIVE OIL" }],
      flipp: [],
      acceptedSuggestions: [],
    };
    const result = generateShoppingList(input);
    expect(findItem(result, "olive oil")!.pantry_match).toBe(true);
  });

  it("sets pantry_match = false when no pantry match", () => {
    const input: GenerateInput = {
      meals: [{ ingredients: [{ name: "Tofu", quantity: "1 block" }] }],
      pantry: [{ name: "chicken" }],
      flipp: [],
      acceptedSuggestions: [],
    };
    const result = generateShoppingList(input);
    expect(findItem(result, "tofu")!.pantry_match).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Flipp matching
// ---------------------------------------------------------------------------

describe("Flipp matching", () => {
  it("attaches flipp_cache_id and assigned_store from matching Flipp row", () => {
    const flippRow = makeFlipp({
      id: "flipp-1",
      ingredient_query: "chicken breast",
      merchant_name: "FreshMart",
      current_price: 4.99,
      fetched_at: "2025-01-01T00:00:00Z",
    });
    const input: GenerateInput = {
      meals: [
        { ingredients: [{ name: "chicken breast", quantity: "500g" }] },
      ],
      pantry: [],
      flipp: [flippRow],
      acceptedSuggestions: [],
    };
    const result = generateShoppingList(input);
    const item = findItem(result, "chicken breast")!;
    expect(item.flipp_cache_id).toBe("flipp-1");
    expect(item.assigned_store).toBe("FreshMart");
  });

  it("picks the freshest Flipp row when multiple match", () => {
    const older = makeFlipp({
      id: "flipp-old",
      ingredient_query: "eggs",
      merchant_name: "Store A",
      fetched_at: "2025-01-01T00:00:00Z",
    });
    const newer = makeFlipp({
      id: "flipp-new",
      ingredient_query: "eggs",
      merchant_name: "Store B",
      fetched_at: "2025-01-05T00:00:00Z",
    });
    const input: GenerateInput = {
      meals: [{ ingredients: [{ name: "eggs", quantity: "12" }] }],
      pantry: [],
      flipp: [older, newer],
      acceptedSuggestions: [],
    };
    const result = generateShoppingList(input);
    const eggs = findItem(result, "eggs")!;
    expect(eggs.flipp_cache_id).toBe("flipp-new");
    expect(eggs.assigned_store).toBe("Store B");
  });

  it("leaves flipp_cache_id and assigned_store null when no match", () => {
    const input: GenerateInput = {
      meals: [{ ingredients: [{ name: "Lentils", quantity: "1 cup" }] }],
      pantry: [],
      flipp: [],
      acceptedSuggestions: [],
    };
    const result = generateShoppingList(input);
    const lentils = findItem(result, "lentils")!;
    expect(lentils.flipp_cache_id).toBeNull();
    expect(lentils.assigned_store).toBeNull();
  });

  it("matches Flipp ingredient_query case-insensitively", () => {
    const flippRow = makeFlipp({
      id: "flipp-rice",
      ingredient_query: "Rice",
      merchant_name: "GrainShop",
      fetched_at: "2025-01-01T00:00:00Z",
    });
    const input: GenerateInput = {
      meals: [{ ingredients: [{ name: "rice", quantity: "2 cups" }] }],
      pantry: [],
      flipp: [flippRow],
      acceptedSuggestions: [],
    };
    const result = generateShoppingList(input);
    expect(findItem(result, "rice")!.flipp_cache_id).toBe("flipp-rice");
  });
});

// ---------------------------------------------------------------------------
// Accepted suggestion: substitution
// ---------------------------------------------------------------------------

describe("substitution suggestions", () => {
  it("renames an ingredient via 'Replace X with Y' pattern", () => {
    const suggestion = makeSuggestion({
      id: "s1",
      suggestion_type: "substitution",
      description: "Replace chicken breast with tofu",
    });
    const input: GenerateInput = {
      meals: [
        { ingredients: [{ name: "chicken breast", quantity: "500g" }] },
      ],
      pantry: [],
      flipp: [],
      acceptedSuggestions: [suggestion],
    };
    const result = generateShoppingList(input);
    // chicken breast should be gone, tofu should appear
    expect(findItem(result, "chicken breast")).toBeUndefined();
    expect(findItem(result, "tofu")).toBeDefined();
  });

  it("renames via arrow pattern '<old> -> <new>'", () => {
    const suggestion = makeSuggestion({
      id: "s2",
      suggestion_type: "substitution",
      description: "butter -> olive oil",
    });
    const input: GenerateInput = {
      meals: [{ ingredients: [{ name: "butter", quantity: "2 tbsp" }] }],
      pantry: [],
      flipp: [],
      acceptedSuggestions: [suggestion],
    };
    const result = generateShoppingList(input);
    expect(findItem(result, "butter")).toBeUndefined();
    expect(findItem(result, "olive oil")).toBeDefined();
  });

  it("merges quantities when substitution target already exists", () => {
    const suggestion = makeSuggestion({
      id: "s3",
      suggestion_type: "substitution",
      description: "Replace cream with coconut milk",
    });
    const input: GenerateInput = {
      meals: [
        { ingredients: [{ name: "cream", quantity: "1 cup" }] },
        { ingredients: [{ name: "coconut milk", quantity: "2 cans" }] },
      ],
      pantry: [],
      flipp: [],
      acceptedSuggestions: [suggestion],
    };
    const result = generateShoppingList(input);
    const cm = findItem(result, "coconut milk")!;
    expect(cm).toBeDefined();
    // cream's quantity "1 cup" should be merged in
    expect(cm.quantity).toContain("1 cup");
    expect(cm.quantity).toContain("2 cans");
  });
});

// ---------------------------------------------------------------------------
// Accepted suggestion: pantry_use
// ---------------------------------------------------------------------------

describe("pantry_use suggestions", () => {
  it("sets pantry_match = true via 'Use X from pantry' description", () => {
    const suggestion = makeSuggestion({
      id: "p1",
      suggestion_type: "pantry_use",
      description: "Use olive oil from pantry",
    });
    const input: GenerateInput = {
      meals: [{ ingredients: [{ name: "olive oil", quantity: "3 tbsp" }] }],
      pantry: [],
      flipp: [],
      acceptedSuggestions: [suggestion],
    };
    const result = generateShoppingList(input);
    expect(findItem(result, "olive oil")!.pantry_match).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Accepted suggestion: bulk_buy / overlap
// ---------------------------------------------------------------------------

describe("bulk_buy and overlap suggestions", () => {
  it("attaches note to items mentioned in bulk_buy description", () => {
    const suggestion = makeSuggestion({
      id: "b1",
      suggestion_type: "bulk_buy",
      description: "Buy chicken thighs in bulk for both meals",
    });
    const input: GenerateInput = {
      meals: [
        { ingredients: [{ name: "chicken thighs", quantity: "1kg" }] },
      ],
      pantry: [],
      flipp: [],
      acceptedSuggestions: [suggestion],
    };
    const result = generateShoppingList(input);
    const item = findItem(result, "chicken thighs")!;
    expect(item.note).toContain("bulk");
  });

  it("attaches note to items mentioned in overlap description", () => {
    const suggestion = makeSuggestion({
      id: "o1",
      suggestion_type: "overlap",
      description: "Rice appears in meals 1 and 3 — buy together",
    });
    const input: GenerateInput = {
      meals: [{ ingredients: [{ name: "rice", quantity: "2 cups" }] }],
      pantry: [],
      flipp: [],
      acceptedSuggestions: [suggestion],
    };
    const result = generateShoppingList(input);
    const item = findItem(result, "rice")!;
    expect(item.note).toBeTruthy();
  });

  it("does not add note to unrelated items", () => {
    const suggestion = makeSuggestion({
      id: "b2",
      suggestion_type: "bulk_buy",
      description: "Buy pasta in bulk",
    });
    const input: GenerateInput = {
      meals: [
        { ingredients: [{ name: "pasta", quantity: "500g" }] },
        { ingredients: [{ name: "garlic", quantity: "4 cloves" }] },
      ],
      pantry: [],
      flipp: [],
      acceptedSuggestions: [suggestion],
    };
    const result = generateShoppingList(input);
    const garlic = findItem(result, "garlic")!;
    expect(garlic.note).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Empty input edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("returns empty array for no meals", () => {
    const input: GenerateInput = {
      meals: [],
      pantry: [],
      flipp: [],
      acceptedSuggestions: [],
    };
    expect(generateShoppingList(input)).toEqual([]);
  });

  it("returns empty array for meals with no ingredients", () => {
    const input: GenerateInput = {
      meals: [{ ingredients: [] }, { ingredients: [] }],
      pantry: [],
      flipp: [],
      acceptedSuggestions: [],
    };
    expect(generateShoppingList(input)).toEqual([]);
  });

  it("does not crash on ignored suggestion types (pending/dismissed)", () => {
    const pendingSuggestion = makeSuggestion({
      id: "x1",
      suggestion_type: "substitution",
      status: "pending",
      description: "Replace garlic with garlic powder",
    });
    // Even if the caller passes a pending suggestion, generation should still
    // work — caller should filter to accepted only, but function is robust.
    const input: GenerateInput = {
      meals: [{ ingredients: [{ name: "garlic", quantity: "3 cloves" }] }],
      pantry: [],
      flipp: [],
      acceptedSuggestions: [pendingSuggestion],
    };
    // Should not throw; garlic may or may not be renamed depending on whether
    // caller pre-filtered — here we pass it directly so substitution applies.
    expect(() => generateShoppingList(input)).not.toThrow();
  });
});
