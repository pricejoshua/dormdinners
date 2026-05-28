import { describe, it, expect } from 'vitest';
import { isMondayISO, addWeeksISO } from './weekOf';

describe('isMondayISO', () => {
  it('accepts a real Monday', () => {
    expect(isMondayISO('2026-05-25')).toBe(true); // Mon
  });
  it('rejects a non-Monday weekday', () => {
    expect(isMondayISO('2026-05-26')).toBe(false); // Tue
    expect(isMondayISO('2026-05-24')).toBe(false); // Sun
  });
  it('rejects malformed strings', () => {
    expect(isMondayISO('2026-5-25')).toBe(false);
    expect(isMondayISO('not-a-date')).toBe(false);
    expect(isMondayISO('')).toBe(false);
  });
  it('rejects impossible calendar dates', () => {
    expect(isMondayISO('2026-02-30')).toBe(false);
  });
});

describe('addWeeksISO', () => {
  it('steps forward one week', () => {
    expect(addWeeksISO('2026-05-25', 1)).toBe('2026-06-01');
  });
  it('steps back one week', () => {
    expect(addWeeksISO('2026-05-25', -1)).toBe('2026-05-18');
  });
  it('crosses a year boundary', () => {
    expect(addWeeksISO('2026-12-28', 1)).toBe('2027-01-04');
  });
});
