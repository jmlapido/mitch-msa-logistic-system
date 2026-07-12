import { describe, it, expect } from 'vitest';
import { isExpiring, daysUntil, EXPIRY_WINDOW_DAYS } from './expiry';

function iso(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86400000);
  return d.toISOString().slice(0, 10);
}

describe('isExpiring', () => {
  it('is true inside the 60-day window', () => {
    expect(isExpiring(iso(1))).toBe(true);
    expect(isExpiring(iso(59))).toBe(true);
  });

  it('is true on the window boundary', () => {
    expect(isExpiring(iso(EXPIRY_WINDOW_DAYS))).toBe(true);
  });

  it('is false beyond the window', () => {
    expect(isExpiring(iso(61))).toBe(false);
    expect(isExpiring(iso(365))).toBe(false);
  });

  it('is false for already-ended contracts', () => {
    expect(isExpiring(iso(-1))).toBe(false);
    expect(isExpiring(iso(-100))).toBe(false);
  });

  it('is false for absent dates', () => {
    expect(isExpiring(undefined)).toBe(false);
    expect(isExpiring(null)).toBe(false);
    expect(isExpiring('')).toBe(false);
  });
});

describe('daysUntil', () => {
  it('is positive for future dates and negative for past', () => {
    expect(daysUntil(iso(10))).toBeGreaterThan(8);
    expect(daysUntil(iso(10))).toBeLessThanOrEqual(10);
    expect(daysUntil(iso(-10))).toBeLessThan(0);
  });
});
