import { describe, it, expect } from 'vitest';
import { rangesOverlap } from './contractOverlap';

describe('rangesOverlap', () => {
  it('detects full containment', () => {
    expect(rangesOverlap('2026-01-01', '2026-12-31', '2026-03-01', '2026-06-30')).toBe(true);
  });

  it('detects partial overlap at the start', () => {
    expect(rangesOverlap('2026-06-01', '2027-05-31', '2026-01-01', '2026-06-15')).toBe(true);
  });

  it('detects single-day touch (inclusive bounds)', () => {
    expect(rangesOverlap('2026-01-01', '2026-06-30', '2026-06-30', '2027-06-29')).toBe(true);
  });

  it('rejects back-to-back ranges that do not share a day', () => {
    expect(rangesOverlap('2026-01-01', '2026-06-30', '2026-07-01', '2027-06-30')).toBe(false);
  });

  it('rejects fully disjoint ranges', () => {
    expect(rangesOverlap('2025-01-01', '2025-12-31', '2026-01-01', '2026-12-31')).toBe(false);
  });
});
