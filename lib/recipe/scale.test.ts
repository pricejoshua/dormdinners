import { describe, it, expect } from 'vitest';
import { scaleQuantity, scaleIngredients, ScalableIngredient } from './scale';

describe('scaleQuantity', () => {
  it('scales a whole number with unit', () => {
    expect(scaleQuantity('2 cups', 3)).toBe('6 cups');
  });

  it('scales a fraction with unit', () => {
    expect(scaleQuantity('1/2 cup', 3)).toBe('1.5 cup');
  });

  it('scales a range', () => {
    expect(scaleQuantity('1-2 lbs', 3)).toBe('3-6 lbs');
  });

  it('scales a quantity with no unit', () => {
    expect(scaleQuantity('3', 2)).toBe('6');
  });

  it('passes through quantity with no numeric value', () => {
    expect(scaleQuantity('salt to taste', 3)).toBe('salt to taste');
  });

  it('returns unchanged when factor is 1', () => {
    expect(scaleQuantity('2 cups', 1)).toBe('2 cups');
  });

  it('returns null when quantity is null', () => {
    expect(scaleQuantity(null, 3)).toBe(null);
  });

  it('returns empty string when quantity is empty string', () => {
    expect(scaleQuantity('', 3)).toBe('');
  });

  it('returns original when quantity is whitespace only', () => {
    expect(scaleQuantity('   ', 3)).toBe('   ');
  });

  it('formats decimals with at most 2 decimal places', () => {
    expect(scaleQuantity('1/3 cup', 3)).toBe('1 cup');
  });

  it('preserves description after unit', () => {
    expect(scaleQuantity('2 cups flour', 2)).toBe('4 cups flour');
  });
});

describe('scaleIngredients', () => {
  it('scales quantities and preserves all other fields', () => {
    const items: ScalableIngredient[] = [
      { name: 'flour', quantity: '2 cups' },
      { name: 'eggs', quantity: '3' },
    ];

    const result = scaleIngredients(items, 2);

    expect(result).toEqual([
      { name: 'flour', quantity: '4 cups' },
      { name: 'eggs', quantity: '6' },
    ]);
  });

  it('preserves extra fields on extended types', () => {
    interface ExtendedIngredient extends ScalableIngredient {
      id: string;
      notes: string;
    }

    const items: ExtendedIngredient[] = [
      { id: '1', name: 'butter', quantity: '1 cup', notes: 'softened' },
    ];

    const result = scaleIngredients(items, 3);

    expect(result).toEqual([
      { id: '1', name: 'butter', quantity: '3 cup', notes: 'softened' },
    ]);
  });

  it('handles null quantities', () => {
    const items: ScalableIngredient[] = [
      { name: 'salt', quantity: null },
    ];

    const result = scaleIngredients(items, 2);

    expect(result).toEqual([
      { name: 'salt', quantity: null },
    ]);
  });
});
