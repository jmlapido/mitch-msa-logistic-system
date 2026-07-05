import { describe, it, expect } from 'vitest';
import { planOverpaymentSweep } from './paymentSweep';

describe('planOverpaymentSweep', () => {
  it('exact match: no excess, no sweep', () => {
    const plan = planOverpaymentSweep(400, 400, 0, []);
    expect(plan.targetAmount).toBe(400);
    expect(plan.swept).toEqual([]);
  });

  it('overpayment fully clears one older unpaid month', () => {
    const plan = planOverpaymentSweep(500, 400, 0, [
      { id: 7, expectedRent: 100, amountPaid: 0 },
    ]);
    expect(plan.targetAmount).toBe(400);
    expect(plan.swept).toEqual([{ rentPaymentId: 7, amount: 100 }]);
  });

  it('overpayment spans two older months, oldest first, no leftover', () => {
    const plan = planOverpaymentSweep(550, 400, 0, [
      { id: 5, expectedRent: 100, amountPaid: 50 }, // May, remaining 50
      { id: 6, expectedRent: 100, amountPaid: 0 },  // June, remaining 100
    ]);
    expect(plan.targetAmount).toBe(400);
    expect(plan.swept).toEqual([
      { rentPaymentId: 5, amount: 50 },
      { rentPaymentId: 6, amount: 100 },
    ]);
  });

  it('overpayment exceeds all existing debt: leftover stays on target', () => {
    const plan = planOverpaymentSweep(1000, 400, 0, [
      { id: 5, expectedRent: 100, amountPaid: 0 },
    ]);
    expect(plan.targetAmount).toBe(900); // 400 own + 500 leftover after clearing the 100 debt
    expect(plan.swept).toEqual([{ rentPaymentId: 5, amount: 100 }]);
  });

  it('target row already partially paid: only its remaining due is its own share', () => {
    const plan = planOverpaymentSweep(300, 400, 250, [
      { id: 9, expectedRent: 100, amountPaid: 0 },
    ]);
    // target owes 150 more; entered 300 covers that (150) + sweeps 100 to row 9 + 50 leftover back to target
    expect(plan.targetAmount).toBe(200); // 150 own share + 50 leftover
    expect(plan.swept).toEqual([{ rentPaymentId: 9, amount: 100 }]);
  });

  it('candidate rows with zero remaining due are skipped', () => {
    const plan = planOverpaymentSweep(500, 400, 0, [
      { id: 3, expectedRent: 100, amountPaid: 100 }, // already fully paid, must be skipped
      { id: 4, expectedRent: 50, amountPaid: 0 },
    ]);
    expect(plan.targetAmount).toBe(450); // 400 own + 50 leftover (100-50=50 excess, 50 goes to row 4, 50 leftover)
    expect(plan.swept).toEqual([{ rentPaymentId: 4, amount: 50 }]);
  });

  it('no-excess payment with more than 2 decimal places passes through unrounded', () => {
    const plan = planOverpaymentSweep(100.126, 400, 0, []);
    expect(plan.targetAmount).toBe(100.126);
    expect(plan.swept).toEqual([]);
  });
});
