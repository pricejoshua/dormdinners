export interface PricedItem {
  price: number;            // pack price, e.g. 12.99
  size_amount: number | null; // pack size quantity, e.g. 2
  size_unit: string | null;   // e.g. "kg","g","oz","lb","ml","l","L","ea","each","pack","ct","pc"
}

export type CanonicalUnit = 'kg' | 'L' | 'ea';

export interface UnitPrice {
  perValue: number;   // price per canonical unit, rounded to 2 decimals
  perUnit: CanonicalUnit;
}

/**
 * Round a number to 2 decimal places.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Conversion factors to canonical base units:
 * - MASS: g, kg, oz, lb → kg
 * - VOLUME: ml, l, L → L
 * - COUNT: ea, each, pack, ct, pc → ea
 */
const UNIT_FAMILIES: Record<string, { family: 'mass' | 'volume' | 'count'; factor: number; canonical: CanonicalUnit }> = {
  // Mass family (kg)
  'g': { family: 'mass', factor: 1 / 1000, canonical: 'kg' },
  'kg': { family: 'mass', factor: 1, canonical: 'kg' },
  'oz': { family: 'mass', factor: 0.0283495, canonical: 'kg' },
  'lb': { family: 'mass', factor: 0.453592, canonical: 'kg' },

  // Volume family (L)
  'ml': { family: 'volume', factor: 1 / 1000, canonical: 'L' },
  'l': { family: 'volume', factor: 1, canonical: 'L' },
  'L': { family: 'volume', factor: 1, canonical: 'L' },

  // Count family (ea)
  'ea': { family: 'count', factor: 1, canonical: 'ea' },
  'each': { family: 'count', factor: 1, canonical: 'ea' },
  'pack': { family: 'count', factor: 1, canonical: 'ea' },
  'ct': { family: 'count', factor: 1, canonical: 'ea' },
  'pc': { family: 'count', factor: 1, canonical: 'ea' },
};

/**
 * Convert a PricedItem to a unit price (price per canonical unit).
 * Returns null if the unit is unknown, missing, or size_amount is null/≤0.
 */
export function unitPrice(item: PricedItem): UnitPrice | null {
  // Validate size_amount
  if (item.size_amount === null || item.size_amount <= 0) {
    return null;
  }

  // Validate and normalize size_unit
  if (item.size_unit === null) {
    return null;
  }

  const normalizedUnit = item.size_unit.toLowerCase().trim();
  const unitInfo = UNIT_FAMILIES[normalizedUnit];

  // Unknown unit
  if (!unitInfo) {
    return null;
  }

  // Calculate base amount and per-unit price
  const baseAmount = item.size_amount * unitInfo.factor;
  const perValue = round2(item.price / baseAmount);

  return {
    perValue,
    perUnit: unitInfo.canonical,
  };
}

/**
 * Find the cheapest item by canonical unit within each unit family.
 * Returns a map of canonical units to the row with the lowest per-unit price.
 */
export function cheapestByFamily<T extends PricedItem>(
  rows: T[]
): Partial<Record<CanonicalUnit, { row: T; unit: UnitPrice }>> {
  const result: Partial<Record<CanonicalUnit, { row: T; unit: UnitPrice }>> = {};

  for (const row of rows) {
    const unit = unitPrice(row);
    if (unit === null) {
      continue; // Skip rows with invalid unit prices
    }

    const canonical = unit.perUnit;
    const existing = result[canonical];

    // Keep the row with the lowest per-unit price
    if (!existing || unit.perValue < existing.unit.perValue) {
      result[canonical] = { row, unit };
    }
  }

  return result;
}
