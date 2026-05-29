import { parseIngredient } from 'parse-ingredient';

/**
 * Grams per unit, keyed on normalized unit tokens (all common synonyms).
 *
 * We can't rely on parse-ingredient's `unitOfMeasureID`: for the bare
 * "<qty> <unit>" strings we store in `meal_ingredients.quantity` (the food name
 * lives in a separate column), parse-ingredient leaves the unit untagged and
 * puts it in `description` instead. So we resolve the unit from
 * `unitOfMeasure ?? description` and look it up here.
 */
const GRAMS_PER_UNIT: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
};

const GRAMS_PER_LB = 453.592;

export interface WeighableIngredient {
  quantity: string | null;
}

export interface WeightTotal {
  kg: number;
  lb: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Sum the weight of every ingredient given in a mass unit (g, kg, oz, lb),
 * scaled by `factor`. Volume/count units (cups, eggs, cans) are ignored.
 *
 * For ranges ("1-2 lbs") the upper bound is used so we don't under-buy.
 * Returns null when no mass-unit ingredient is present.
 */
export function sumWeight(items: WeighableIngredient[], factor: number): WeightTotal | null {
  let grams = 0;
  let foundMassUnit = false;

  for (const item of items) {
    if (!item.quantity || item.quantity.trim() === '') continue;

    const parsed = parseIngredient(item.quantity.trim())[0];
    if (parsed.quantity === null) continue;

    const token = (parsed.unitOfMeasure ?? parsed.description ?? '').trim().toLowerCase();
    const gramsPerUnit = GRAMS_PER_UNIT[token];
    if (gramsPerUnit === undefined) continue;

    foundMassUnit = true;
    const amount = (parsed.quantity2 ?? parsed.quantity) * factor;
    grams += amount * gramsPerUnit;
  }

  if (!foundMassUnit) return null;

  return {
    kg: round2(grams / 1000),
    lb: round2(grams / GRAMS_PER_LB),
  };
}
