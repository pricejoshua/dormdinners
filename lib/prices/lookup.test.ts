import { describe, it, expect } from "vitest";
import { bestPriceForIngredient, type PriceRow } from "./lookup";

const rows: PriceRow[] = [
  { name: "chicken thighs", store: "Costco", price: 13, size_amount: 2, size_unit: "kg" },      // $6.5/kg
  { name: "chicken thighs", store: "Superstore", price: 8, size_amount: 1, size_unit: "kg" },    // $8/kg
  { name: "rice", store: "Costco", price: 20, size_amount: 10, size_unit: "kg" },                // $2/kg
  { name: "eggs", store: "Walmart", price: 4, size_amount: 12, size_unit: "ea" },                // $0.33/ea
];

describe("bestPriceForIngredient", () => {
  it("returns the cheapest store for a matched staple", () => {
    const hint = bestPriceForIngredient("boneless chicken thighs", rows);
    expect(hint).toEqual({ store: "Costco", perValue: 6.5, perUnit: "kg" });
  });

  it("matches via token-subset (specific ingredient name)", () => {
    const hint = bestPriceForIngredient("long grain rice", rows);
    expect(hint).toEqual({ store: "Costco", perValue: 2, perUnit: "kg" });
  });

  it("handles count units", () => {
    const hint = bestPriceForIngredient("eggs", rows);
    expect(hint).toEqual({ store: "Walmart", perValue: 0.33, perUnit: "ea" });
  });

  it("returns null when no staple matches", () => {
    expect(bestPriceForIngredient("saffron", rows)).toBeNull();
  });

  it("returns null on empty price list", () => {
    expect(bestPriceForIngredient("rice", [])).toBeNull();
  });

  it("returns null when matched rows lack a usable size", () => {
    const noSize: PriceRow[] = [
      { name: "salt", store: "Costco", price: 2, size_amount: null, size_unit: null },
    ];
    expect(bestPriceForIngredient("salt", noSize)).toBeNull();
  });
});
