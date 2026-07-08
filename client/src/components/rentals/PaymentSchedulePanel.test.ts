import { describe, it, expect } from 'vitest';
import { computeShortfall } from './PaymentSchedulePanel';

describe('computeShortfall', () => {
  it('returns 0 when the saved amount exactly covers annual_rent', () => {
    const slots = [
      { pdc_number: 1, amount: 500 },
      { pdc_number: 2, amount: 500 },
    ];
    expect(computeShortfall(slots, 2, 500, 1000)).toBe(0);
  });

  it('returns the positive shortfall when under-covered', () => {
    const slots = [
      { pdc_number: 1, amount: 500 },
      { pdc_number: 2, amount: 300 },
    ];
    expect(computeShortfall(slots, 2, 300, 1000)).toBe(200);
  });

  it('returns 0 (not negative) when over-covered', () => {
    const slots = [
      { pdc_number: 1, amount: 500 },
      { pdc_number: 2, amount: 700 },
    ];
    expect(computeShortfall(slots, 2, 700, 1000)).toBe(0);
  });

  it('uses the newly-saved amount for the target slot instead of double-counting its old value', () => {
    const slots = [
      { pdc_number: 1, amount: 500 },
      { pdc_number: 2, amount: 999 }, // stale value, should be replaced by savedAmount below
    ];
    expect(computeShortfall(slots, 2, 300, 1000)).toBe(200);
  });

  it('treats a null saved amount as 0', () => {
    const slots = [
      { pdc_number: 1, amount: 500 },
      { pdc_number: 2, amount: null },
    ];
    expect(computeShortfall(slots, 2, null, 1000)).toBe(500);
  });
});
