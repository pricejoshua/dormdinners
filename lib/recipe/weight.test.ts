import { describe, it, expect } from 'vitest';
import { sumWeight, WeighableIngredient, WeightTotal } from './weight';

describe('sumWeight', () => {
  it('sums mixed units (grams and kilograms)', () => {
    const items: WeighableIngredient[] = [
      { quantity: '500 g' },
      { quantity: '1 kg' },
    ];
    const result = sumWeight(items, 1);
    expect(result).not.toBeNull();
    expect(result!.kg).toBeCloseTo(1.5, 2);
    // 1500 grams / 453.592 = 3.307... lb
    expect(result!.lb).toBeCloseTo(3.31, 2);
  });

  it('applies factor to all items', () => {
    const items: WeighableIngredient[] = [
      { quantity: '500 g' },
    ];
    const result = sumWeight(items, 3);
    expect(result).not.toBeNull();
    // 500 * 3 = 1500 grams = 1.5 kg
    expect(result!.kg).toBeCloseTo(1.5, 2);
  });

  it('uses range upper bound when quantity2 is present', () => {
    const items: WeighableIngredient[] = [
      { quantity: '1-2 lbs' },
    ];
    const result = sumWeight(items, 1);
    expect(result).not.toBeNull();
    // 2 lbs = 2 * 453.592 = 907.184 grams = 0.907184 kg ≈ 0.91 kg
    expect(result!.kg).toBeCloseTo(0.91, 2);
  });

  it('converts ounces correctly', () => {
    const items: WeighableIngredient[] = [
      { quantity: '8 oz' },
    ];
    const result = sumWeight(items, 1);
    expect(result).not.toBeNull();
    // 8 oz = 8 * 28.3495 = 226.796 grams = 0.226796 kg ≈ 0.23 kg
    expect(result!.kg).toBeCloseTo(0.23, 2);
  });

  it('converts pounds correctly', () => {
    const items: WeighableIngredient[] = [
      { quantity: '2 pounds' },
    ];
    const result = sumWeight(items, 1);
    expect(result).not.toBeNull();
    // 2 pounds = 2 * 453.592 = 907.184 grams = 0.907184 kg ≈ 0.91 kg
    expect(result!.kg).toBeCloseTo(0.91, 2);
    expect(result!.lb).toBeCloseTo(2.0, 2);
  });

  it('ignores non-mass units (cups, eggs, etc.) and returns null', () => {
    const items: WeighableIngredient[] = [
      { quantity: '2 cups' },
      { quantity: '3 eggs' },
    ];
    const result = sumWeight(items, 1);
    expect(result).toBeNull();
  });

  it('skips null quantity but still sums mass units', () => {
    const items: WeighableIngredient[] = [
      { quantity: null },
      { quantity: '1 kg' },
    ];
    const result = sumWeight(items, 1);
    expect(result).not.toBeNull();
    expect(result!.kg).toBeCloseTo(1.0, 2);
  });

  it('skips empty string quantity but still sums mass units', () => {
    const items: WeighableIngredient[] = [
      { quantity: '' },
      { quantity: '500 g' },
    ];
    const result = sumWeight(items, 1);
    expect(result).not.toBeNull();
    expect(result!.kg).toBeCloseTo(0.5, 2);
  });

  it('returns null when no mass units are found', () => {
    const items: WeighableIngredient[] = [
      { quantity: 'salt to taste' },
    ];
    const result = sumWeight(items, 1);
    expect(result).toBeNull();
  });

  it('handles empty items array', () => {
    const items: WeighableIngredient[] = [];
    const result = sumWeight(items, 1);
    expect(result).toBeNull();
  });

  it('handles mixed mass and non-mass units', () => {
    const items: WeighableIngredient[] = [
      { quantity: '2 cups flour' },
      { quantity: '500 g butter' },
      { quantity: '3 eggs' },
    ];
    const result = sumWeight(items, 1);
    expect(result).not.toBeNull();
    // Only the 500g butter counts
    expect(result!.kg).toBeCloseTo(0.5, 2);
  });

  it('applies factor to range upper bound', () => {
    const items: WeighableIngredient[] = [
      { quantity: '1-2 lbs' },
    ];
    const result = sumWeight(items, 2);
    expect(result).not.toBeNull();
    // 2 lbs * 2 factor = 4 lbs = 4 * 453.592 = 1814.368 grams = 1.814368 kg ≈ 1.81 kg
    expect(result!.kg).toBeCloseTo(1.81, 2);
  });

  it('ignores items with null parsed.quantity', () => {
    const items: WeighableIngredient[] = [
      { quantity: 'g' }, // quantity without a number
      { quantity: '500 g' },
    ];
    const result = sumWeight(items, 1);
    expect(result).not.toBeNull();
    // Only 500g counts
    expect(result!.kg).toBeCloseTo(0.5, 2);
  });
});
