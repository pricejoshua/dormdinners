import { describe, it, expect } from 'vitest';
import { unitPrice, cheapestByFamily, type PricedItem, type CanonicalUnit, type UnitPrice } from './unitPrice';

describe('unitPrice', () => {
  describe('mass conversions to kg', () => {
    it('should convert kg directly', () => {
      const item: PricedItem = { price: 12.99, size_amount: 2, size_unit: 'kg' };
      const result = unitPrice(item);
      expect(result).toEqual({ perValue: 6.5, perUnit: 'kg' });
    });

    it('should convert g to kg', () => {
      const item: PricedItem = { price: 3, size_amount: 500, size_unit: 'g' };
      const result = unitPrice(item);
      expect(result).toEqual({ perValue: 6, perUnit: 'kg' });
    });

    it('should convert oz to kg', () => {
      // 1 oz = 0.0283495 kg
      // 16 oz = 0.453592 kg
      const item: PricedItem = { price: 1, size_amount: 16, size_unit: 'oz' };
      const result = unitPrice(item);
      expect(result).toEqual({ perValue: 2.2, perUnit: 'kg' }); // 1 / 0.453592 ≈ 2.205
    });

    it('should convert lb to kg', () => {
      // 1 lb = 0.453592 kg
      const item: PricedItem = { price: 2, size_amount: 1, size_unit: 'lb' };
      const result = unitPrice(item);
      expect(result).toEqual({ perValue: 4.41, perUnit: 'kg' }); // 2 / 0.453592 ≈ 4.409
    });

    it('should handle case-insensitive unit', () => {
      const item: PricedItem = { price: 12.99, size_amount: 2, size_unit: 'KG' };
      const result = unitPrice(item);
      expect(result).toEqual({ perValue: 6.5, perUnit: 'kg' });
    });

    it('should handle whitespace in unit', () => {
      const item: PricedItem = { price: 12.99, size_amount: 2, size_unit: '  kg  ' };
      const result = unitPrice(item);
      expect(result).toEqual({ perValue: 6.5, perUnit: 'kg' });
    });
  });

  describe('volume conversions to L', () => {
    it('should convert L directly', () => {
      const item: PricedItem = { price: 5, size_amount: 2, size_unit: 'L' };
      const result = unitPrice(item);
      expect(result).toEqual({ perValue: 2.5, perUnit: 'L' });
    });

    it('should convert l (lowercase) directly', () => {
      const item: PricedItem = { price: 5, size_amount: 2, size_unit: 'l' };
      const result = unitPrice(item);
      expect(result).toEqual({ perValue: 2.5, perUnit: 'L' });
    });

    it('should convert ml to L', () => {
      const item: PricedItem = { price: 2, size_amount: 500, size_unit: 'ml' };
      const result = unitPrice(item);
      expect(result).toEqual({ perValue: 4, perUnit: 'L' });
    });

    it('should convert ML to L (case-insensitive)', () => {
      const item: PricedItem = { price: 2, size_amount: 500, size_unit: 'ML' };
      const result = unitPrice(item);
      expect(result).toEqual({ perValue: 4, perUnit: 'L' });
    });
  });

  describe('count conversions to ea', () => {
    it('should keep ea as-is', () => {
      const item: PricedItem = { price: 4, size_amount: 1, size_unit: 'ea' };
      const result = unitPrice(item);
      expect(result).toEqual({ perValue: 4, perUnit: 'ea' });
    });

    it('should keep each as-is', () => {
      const item: PricedItem = { price: 8, size_amount: 2, size_unit: 'each' };
      const result = unitPrice(item);
      expect(result).toEqual({ perValue: 4, perUnit: 'ea' });
    });

    it('should keep pack as-is', () => {
      const item: PricedItem = { price: 10, size_amount: 5, size_unit: 'pack' };
      const result = unitPrice(item);
      expect(result).toEqual({ perValue: 2, perUnit: 'ea' });
    });

    it('should keep ct as-is', () => {
      const item: PricedItem = { price: 12, size_amount: 6, size_unit: 'ct' };
      const result = unitPrice(item);
      expect(result).toEqual({ perValue: 2, perUnit: 'ea' });
    });

    it('should keep pc as-is', () => {
      const item: PricedItem = { price: 15, size_amount: 3, size_unit: 'pc' };
      const result = unitPrice(item);
      expect(result).toEqual({ perValue: 5, perUnit: 'ea' });
    });
  });

  describe('rounding', () => {
    it('should round to 2 decimals: 12.99/2 = 6.495 → 6.5', () => {
      const item: PricedItem = { price: 12.99, size_amount: 2, size_unit: 'kg' };
      const result = unitPrice(item);
      expect(result?.perValue).toBe(6.5);
    });

    it('should round 3/0.5 = 6.00', () => {
      const item: PricedItem = { price: 3, size_amount: 500, size_unit: 'g' };
      const result = unitPrice(item);
      expect(result?.perValue).toBe(6);
    });

    it('rounds 2.445 → 2.44 (float-aware Math.round)', () => {
      const item: PricedItem = { price: 2.445, size_amount: 1, size_unit: 'kg' };
      const result = unitPrice(item);
      expect(result?.perValue).toBe(2.44);
    });

    it('should handle very small prices', () => {
      const item: PricedItem = { price: 0.01, size_amount: 1, size_unit: 'kg' };
      const result = unitPrice(item);
      expect(result).toEqual({ perValue: 0.01, perUnit: 'kg' });
    });
  });

  describe('null cases', () => {
    it('should return null when size_amount is null', () => {
      const item: PricedItem = { price: 5, size_amount: null, size_unit: 'kg' };
      const result = unitPrice(item);
      expect(result).toBeNull();
    });

    it('should return null when size_amount is 0', () => {
      const item: PricedItem = { price: 5, size_amount: 0, size_unit: 'kg' };
      const result = unitPrice(item);
      expect(result).toBeNull();
    });

    it('should return null when size_amount is negative', () => {
      const item: PricedItem = { price: 5, size_amount: -2, size_unit: 'kg' };
      const result = unitPrice(item);
      expect(result).toBeNull();
    });

    it('should return null when size_unit is null', () => {
      const item: PricedItem = { price: 5, size_amount: 2, size_unit: null };
      const result = unitPrice(item);
      expect(result).toBeNull();
    });

    it('should return null when size_unit is unknown', () => {
      const item: PricedItem = { price: 5, size_amount: 2, size_unit: 'dozen' };
      const result = unitPrice(item);
      expect(result).toBeNull();
    });

    it('should return null when size_unit is unknown (misspelled unit)', () => {
      const item: PricedItem = { price: 5, size_amount: 2, size_unit: 'kgg' };
      const result = unitPrice(item);
      expect(result).toBeNull();
    });
  });

  describe('cheapestByFamily', () => {
    it('should return empty object for empty array', () => {
      const result = cheapestByFamily([]);
      expect(result).toEqual({});
    });

    it('should skip items with invalid unitPrice', () => {
      const rows: PricedItem[] = [
        { price: 5, size_amount: null, size_unit: 'kg' },
        { price: 5, size_amount: 2, size_unit: 'dozen' },
      ];
      const result = cheapestByFamily(rows);
      expect(result).toEqual({});
    });

    it('should keep lowest per-unit within kg family', () => {
      const rows: PricedItem[] = [
        { price: 10, size_amount: 2, size_unit: 'kg' }, // 5/kg
        { price: 6, size_amount: 1, size_unit: 'kg' },  // 6/kg
      ];
      const result = cheapestByFamily(rows);
      expect(result.kg?.row).toBe(rows[0]);
      expect(result.kg?.unit.perValue).toBe(5);
    });

    it('should keep lowest per-unit within L family', () => {
      const rows: PricedItem[] = [
        { price: 3, size_amount: 2, size_unit: 'L' },   // 1.5/L
        { price: 2, size_amount: 1, size_unit: 'L' },   // 2/L
      ];
      const result = cheapestByFamily(rows);
      expect(result.L?.row).toBe(rows[0]);
      expect(result.L?.unit.perValue).toBe(1.5);
    });

    it('should keep lowest per-unit within ea family', () => {
      const rows: PricedItem[] = [
        { price: 4, size_amount: 2, size_unit: 'ea' },  // 2/ea
        { price: 3, size_amount: 1, size_unit: 'ea' },  // 3/ea
      ];
      const result = cheapestByFamily(rows);
      expect(result.ea?.row).toBe(rows[0]);
      expect(result.ea?.unit.perValue).toBe(2);
    });

    it('should return separate entries for different families', () => {
      const rows: PricedItem[] = [
        { price: 10, size_amount: 2, size_unit: 'kg' }, // 5/kg
        { price: 2, size_amount: 1, size_unit: 'ea' },  // 2/ea
      ];
      const result = cheapestByFamily(rows);
      expect(result.kg).toBeDefined();
      expect(result.ea).toBeDefined();
      expect(result.kg?.row).toBe(rows[0]);
      expect(result.ea?.row).toBe(rows[1]);
    });

    it('should handle mixed valid and invalid items, keeping only valid families', () => {
      const rows: PricedItem[] = [
        { price: 10, size_amount: 2, size_unit: 'kg' }, // 5/kg → valid
        { price: 5, size_amount: null, size_unit: 'L' }, // invalid
        { price: 2, size_amount: 1, size_unit: 'ea' },   // 2/ea → valid
      ];
      const result = cheapestByFamily(rows);
      expect(result.kg).toBeDefined();
      expect(result.L).toBeUndefined();
      expect(result.ea).toBeDefined();
    });

    it('should work with custom PricedItem subtype', () => {
      interface Product extends PricedItem {
        name: string;
      }
      const rows: Product[] = [
        { name: 'Cheese A', price: 10, size_amount: 2, size_unit: 'kg' },
        { name: 'Cheese B', price: 8, size_amount: 1, size_unit: 'kg' },
      ];
      const result = cheapestByFamily(rows);
      expect(result.kg?.row.name).toBe('Cheese A');
    });

    it('should select cheapest across different unit representations within same family', () => {
      const rows: PricedItem[] = [
        { price: 5, size_amount: 1000, size_unit: 'g' },   // 5/kg
        { price: 4, size_amount: 1, size_unit: 'kg' },     // 4/kg (cheaper)
        { price: 6, size_amount: 2000, size_unit: 'g' },   // 3/kg (cheapest)
      ];
      const result = cheapestByFamily(rows);
      expect(result.kg?.row).toBe(rows[2]);
      expect(result.kg?.unit.perValue).toBe(3);
    });
  });
});
