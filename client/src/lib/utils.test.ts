import { describe, it, expect } from 'vitest';
import { monthsBetweenRounded } from './utils';

describe('monthsBetweenRounded', () => {
  it('returns 12 for an exact one-year span', () => {
    expect(monthsBetweenRounded('2026-01-01', '2027-01-01')).toBe(12);
  });

  it('returns 1 for a short span under a month', () => {
    expect(monthsBetweenRounded('2026-01-01', '2026-01-15')).toBe(1);
  });

  it('rounds down when closer to the lower whole month', () => {
    // ~11.5 months would round to 12; use a span clearly closer to 11
    expect(monthsBetweenRounded('2026-01-01', '2026-11-20')).toBe(11);
  });

  it('rounds up when closer to the higher whole month', () => {
    expect(monthsBetweenRounded('2026-01-01', '2027-01-10')).toBe(12);
  });

  it('never returns less than 1 even for a zero-length or inverted span', () => {
    expect(monthsBetweenRounded('2026-01-01', '2026-01-01')).toBe(1);
    expect(monthsBetweenRounded('2026-01-01', '2025-12-01')).toBe(1);
  });
});
