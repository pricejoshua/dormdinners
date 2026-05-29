import { parseIngredient } from 'parse-ingredient';

export interface ScalableIngredient {
  name: string;
  quantity: string | null;
}

export interface ScalableMeal {
  headcount: number | null;
  serves: number | null;
  scale_override: number | null;
}

/**
 * Derive a meal's effective scale factor:
 *   scale_override ?? (serves > 0 && headcount > 0 ? headcount / serves : 1)
 * A manual override always wins; otherwise scale to headcount when both the
 * recipe yield and headcount are known; otherwise no scaling (1).
 */
export function effectiveFactor(meal: ScalableMeal): number {
  if (meal.scale_override != null && meal.scale_override > 0) {
    return meal.scale_override;
  }
  if (
    meal.serves != null && meal.serves > 0 &&
    meal.headcount != null && meal.headcount > 0
  ) {
    return meal.headcount / meal.serves;
  }
  return 1;
}

/**
 * Format a number to at most 2 decimal places, stripping trailing zeros.
 * 6 → "6", 1.5 → "1.5", 0.25 → "0.25", 0.333... → "0.33"
 */
function format(n: number): string {
  return parseFloat(n.toFixed(2)).toString();
}

/**
 * Scale a quantity string by a given factor.
 *
 * Returns null/empty unchanged. Returns original if quantity is unparseable or factor is 1.
 * Otherwise reconstructs the quantity with scaled numbers.
 */
export function scaleQuantity(quantity: string | null, factor: number): string | null {
  // Rule 1: null or empty/whitespace passthrough
  if (quantity === null) return null;
  if (quantity === '' || quantity.trim() === '') return quantity;

  // Rule 2: factor 1 is no-op
  if (factor === 1) return quantity;

  // Rule 3: parse and check for numeric quantity
  const parsed = parseIngredient(quantity.trim())[0];
  if (parsed.quantity === null) {
    // No numeric quantity (e.g., "salt to taste") — return original
    return quantity;
  }

  // Rule 4: reconstruct with scaled numbers
  const scaledLow = format(parsed.quantity * factor);
  let numberPart: string;
  if (parsed.quantity2 != null) {
    const scaledHigh = format(parsed.quantity2 * factor);
    numberPart = `${scaledLow}-${scaledHigh}`;
  } else {
    numberPart = scaledLow;
  }

  const parts: string[] = [numberPart];

  if (parsed.unitOfMeasure) {
    parts.push(parsed.unitOfMeasure);
  }

  if (parsed.description && parsed.description.trim()) {
    parts.push(parsed.description.trim());
  }

  return parts.join(' ').trim();
}

/**
 * Scale multiple ingredients by a given factor.
 * Returns a new array where each item's quantity is scaled,
 * preserving all other fields.
 */
export function scaleIngredients<T extends ScalableIngredient>(
  items: T[],
  factor: number
): T[] {
  return items.map((item) => ({
    ...item,
    quantity: scaleQuantity(item.quantity, factor),
  }));
}
