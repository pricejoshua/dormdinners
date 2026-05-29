import { staplesForIngredient } from "./match";
import { cheapestByFamily, type CanonicalUnit } from "./unitPrice";

/** Minimal shape needed from a reference price row. */
export interface PriceRow {
  name: string;
  store: string;
  price: number;
  size_amount: number | null;
  size_unit: string | null;
}

export interface PriceHint {
  store: string;
  perValue: number;
  perUnit: CanonicalUnit;
}

const FAMILY_PRIORITY: CanonicalUnit[] = ["kg", "L", "ea"];

function norm(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Find the cheapest comparable reference price for a meal ingredient.
 *
 * Matches the ingredient to a reference staple (token-subset), gathers that
 * staple's rows across stores, and returns the cheapest `$/unit` — preferring
 * mass, then volume, then count when a staple spans families. Null when there's
 * no match or no row has a usable size/unit.
 */
export function bestPriceForIngredient<T extends PriceRow>(
  ingredientName: string,
  prices: T[],
): PriceHint | null {
  if (prices.length === 0) return null;

  const names = [...new Set(prices.map((p) => p.name))];
  const matched = staplesForIngredient(ingredientName, names);
  if (matched.length === 0) return null;

  const key = norm(matched[0]);
  const rows = prices.filter((p) => norm(p.name) === key);
  const cheapest = cheapestByFamily(rows);

  for (const unit of FAMILY_PRIORITY) {
    const c = cheapest[unit];
    if (c) return { store: c.row.store, perValue: c.unit.perValue, perUnit: unit };
  }
  return null;
}
