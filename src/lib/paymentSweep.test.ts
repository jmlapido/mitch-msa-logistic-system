import { describe, it, expect } from 'vitest';
import { planOverpaymentSweep, applyExcessToCandidate, addMonthToYyyyMm } from './paymentSweep';

describe('applyExcessToCandidate', () => {
  it('applies the full excess when it is less than the remaining due', () => {
    const result = applyExcessToCandidate(50, 100, 0);
    expect(result).toEqual({ applied: 50, remainingExcess: 0 });
  });

  it('caps the applied amount at the remaining due, carrying the rest forward', () => {
    const result = applyExcessToCandidate(150, 100, 0);
    expect(result).toEqual({ applied: 100, remainingExcess: 50 });
  });

  it('applies nothing when the candidate has no remaining due', () => {
    const result = applyExcessToCandidate(100, 100, 100);
    expect(result).toEqual({ applied: 0, remainingExcess: 100 });
  });

  it('accounts for a candidate that is already partially paid', () => {
    const result = applyExcessToCandidate(80, 100, 60);
    expect(result).toEqual({ applied: 40, remainingExcess: 40 });
  });
});

describe('planOverpaymentSweep', () => {
  it('exact match: no excess, no sweep', () => {
    const plan = planOverpaymentSweep(400, 400, 0, []);
    expect(plan.ownAmount).toBe(400);
    expect(plan.swept).toEqual([]);
    expect(plan.leftover).toBe(0);
  });

  it('overpayment fully clears one older unpaid month', () => {
    const plan = planOverpaymentSweep(500, 400, 0, [
      { id: 7, expectedRent: 100, amountPaid: 0 },
    ]);
    expect(plan.ownAmount).toBe(400);
    expect(plan.swept).toEqual([{ rentPaymentId: 7, amount: 100 }]);
    expect(plan.leftover).toBe(0);
  });

  it('overpayment spans two older months, oldest first, no leftover', () => {
    const plan = planOverpaymentSweep(550, 400, 0, [
      { id: 5, expectedRent: 100, amountPaid: 50 }, // May, remaining 50
      { id: 6, expectedRent: 100, amountPaid: 0 },  // June, remaining 100
    ]);
    expect(plan.ownAmount).toBe(400);
    expect(plan.swept).toEqual([
      { rentPaymentId: 5, amount: 50 },
      { rentPaymentId: 6, amount: 100 },
    ]);
    expect(plan.leftover).toBe(0);
  });

  it('overpayment exceeds all existing debt: leftover is reported, not glued to target', () => {
    const plan = planOverpaymentSweep(1000, 400, 0, [
      { id: 5, expectedRent: 100, amountPaid: 0 },
    ]);
    expect(plan.ownAmount).toBe(400);
    expect(plan.swept).toEqual([{ rentPaymentId: 5, amount: 100 }]);
    expect(plan.leftover).toBe(500);
  });

  it('target row already partially paid: only its remaining due is its own share', () => {
    const plan = planOverpaymentSweep(300, 400, 250, [
      { id: 9, expectedRent: 100, amountPaid: 0 },
    ]);
    // target owes 150 more; entered 300 covers that (150) + sweeps 100 to row 9 + 50 leftover
    expect(plan.ownAmount).toBe(150);
    expect(plan.swept).toEqual([{ rentPaymentId: 9, amount: 100 }]);
    expect(plan.leftover).toBe(50);
  });

  it('candidate rows with zero remaining due are skipped', () => {
    const plan = planOverpaymentSweep(500, 400, 0, [
      { id: 3, expectedRent: 100, amountPaid: 100 }, // already fully paid, must be skipped
      { id: 4, expectedRent: 50, amountPaid: 0 },
    ]);
    expect(plan.ownAmount).toBe(400);
    expect(plan.swept).toEqual([{ rentPaymentId: 4, amount: 50 }]);
    expect(plan.leftover).toBe(50);
  });

  it('no-excess payment with more than 2 decimal places passes through unrounded', () => {
    const plan = planOverpaymentSweep(100.126, 400, 0, []);
    expect(plan.ownAmount).toBe(100.126);
    expect(plan.swept).toEqual([]);
    expect(plan.leftover).toBe(0);
  });
});

describe('addMonthToYyyyMm', () => {
  it('steps forward within a year', () => {
    expect(addMonthToYyyyMm('2026-07')).toBe('2026-08');
  });

  it('rolls over into the next year at December', () => {
    expect(addMonthToYyyyMm('2025-12')).toBe('2026-01');
  });

  it('zero-pads single-digit months', () => {
    expect(addMonthToYyyyMm('2026-01')).toBe('2026-02');
    expect(addMonthToYyyyMm('2026-09')).toBe('2026-10');
  });
});
