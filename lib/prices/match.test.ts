import { describe, it, expect } from 'vitest';
import { normalizeTokens, matchesStaple, staplesForIngredient } from './match';

describe('normalizeTokens', () => {
  it('lowercases input', () => {
    expect(normalizeTokens('CHICKEN')).toEqual(['chicken']);
  });

  it('replaces non-alphanumeric chars with spaces', () => {
    expect(normalizeTokens('chicken-breast')).toEqual(['chicken', 'breast']);
    expect(normalizeTokens('chicken/breast')).toEqual(['chicken', 'breast']);
    expect(normalizeTokens('chicken (drumstick)')).toEqual(['chicken', 'drumstick']);
  });

  it('splits on whitespace and drops empties', () => {
    expect(normalizeTokens('chicken  broth')).toEqual(['chicken', 'broth']);
    expect(normalizeTokens('  chicken  ')).toEqual(['chicken']);
  });

  it('removes stopwords', () => {
    expect(normalizeTokens('fresh chicken')).toEqual(['chicken']);
    expect(normalizeTokens('organic boneless skinless chicken')).toEqual(['chicken']);
    expect(normalizeTokens('a large chicken')).toEqual(['chicken']);
    expect(normalizeTokens('the extra chicken of the day')).toEqual(['chicken', 'day']);
    expect(normalizeTokens('an extra onion')).toEqual(['onion']);
  });

  it('strips a single trailing s from each token (plural insensitivity)', () => {
    expect(normalizeTokens('thighs')).toEqual(['thigh']);
    expect(normalizeTokens('onions')).toEqual(['onion']);
    expect(normalizeTokens('tomatoes')).toEqual(['tomatoe']);
    expect(normalizeTokens('apples')).toEqual(['apple']);
    expect(normalizeTokens('chicken thighs')).toEqual(['chicken', 'thigh']);
  });

  it('does not strip s if not trailing', () => {
    expect(normalizeTokens('glass')).toEqual(['glas']);
    expect(normalizeTokens('brass')).toEqual(['bras']);
  });

  it('handles empty and whitespace-only input', () => {
    expect(normalizeTokens('')).toEqual([]);
    expect(normalizeTokens('   ')).toEqual([]);
  });

  it('combines all rules: punctuation, stopwords, plurals, case', () => {
    expect(normalizeTokens('Fresh Organic (Chicken Thighs)')).toEqual(['chicken', 'thigh']);
  });
});

describe('matchesStaple', () => {
  it('returns false when staple name normalizes to empty', () => {
    expect(matchesStaple('chicken thighs', '')).toBe(false);
    expect(matchesStaple('chicken thighs', '   ')).toBe(false);
    expect(matchesStaple('chicken thighs', 'a the of')).toBe(false);
  });

  it('returns true when ingredient contains all staple tokens', () => {
    expect(matchesStaple('chicken thighs', 'chicken thighs')).toBe(true);
  });

  it('returns true when ingredient has more tokens than staple', () => {
    expect(matchesStaple('boneless chicken thighs', 'chicken thighs')).toBe(true);
    expect(matchesStaple('fresh organic chicken', 'chicken')).toBe(true);
  });

  it('matches a plural ingredient against a singular staple (naive strip-s)', () => {
    expect(matchesStaple('roma tomatoes', 'tomatoes')).toBe(true);
    expect(matchesStaple('onions', 'onion')).toBe(true);
  });

  it('returns false when staple token missing in ingredient', () => {
    expect(matchesStaple('chicken broth', 'chicken thighs')).toBe(false);
    expect(matchesStaple('beef', 'ground beef')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesStaple('CHICKEN THIGHS', 'chicken thighs')).toBe(true);
    expect(matchesStaple('Chicken Thighs', 'CHICKEN THIGHS')).toBe(true);
  });

  it('handles punctuation in names', () => {
    expect(matchesStaple('chicken-thighs', 'chicken thighs')).toBe(true);
    expect(matchesStaple('chicken (boneless)', 'chicken')).toBe(true);
  });
});

describe('staplesForIngredient', () => {
  it('returns empty array when no staples match', () => {
    expect(staplesForIngredient('beef', ['chicken', 'pork'])).toEqual([]);
  });

  it('returns single matching staple', () => {
    expect(staplesForIngredient('chicken thighs', ['chicken'])).toEqual(['chicken']);
  });

  it('returns all matching staples', () => {
    const result = staplesForIngredient('chicken thighs', ['chicken', 'thighs', 'chicken thighs']);
    expect(result.length).toBe(3);
    expect(result).toContain('chicken');
    expect(result).toContain('thighs');
    expect(result).toContain('chicken thighs');
  });

  it('sorts by descending token-overlap count', () => {
    const ingredient = 'boneless chicken thighs';
    const staples = ['chicken', 'chicken thighs'];
    const result = staplesForIngredient(ingredient, staples);

    // 'chicken thighs' has 2 token overlap, 'chicken' has 1
    expect(result).toEqual(['chicken thighs', 'chicken']);
  });

  it('ranks a more specific matching staple first', () => {
    const ingredient = 'organic chicken breast';
    const staples = ['chicken', 'chicken breast'];
    const result = staplesForIngredient(ingredient, staples);

    // Both match; 'chicken breast' is more specific (more tokens) → first
    expect(result).toEqual(['chicken breast', 'chicken']);
  });

  it('combines sorting rules correctly', () => {
    const ingredient = 'boneless chicken thighs';
    const staples = ['chicken', 'chicken thighs', 'thighs'];
    const result = staplesForIngredient(ingredient, staples);

    // 'chicken thighs': overlap=2, tokens=2
    // 'thighs': overlap=1, tokens=1
    // 'chicken': overlap=1, tokens=1
    // Sorted: 'chicken thighs' (2 overlap), then 'chicken' and 'thighs' (1 overlap each, tiebreak by token count)
    expect(result[0]).toBe('chicken thighs');
    expect(result.slice(1)).toEqual(expect.arrayContaining(['chicken', 'thighs']));
  });

  it('handles empty staples array', () => {
    expect(staplesForIngredient('chicken', [])).toEqual([]);
  });

  it('handles stopword filtering in matching', () => {
    const ingredient = 'fresh organic chicken thighs';
    const staples = ['chicken thighs', 'chicken'];
    const result = staplesForIngredient(ingredient, staples);

    expect(result).toEqual(['chicken thighs', 'chicken']);
  });
});
