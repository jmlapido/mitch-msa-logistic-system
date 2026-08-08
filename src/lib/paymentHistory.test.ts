import { describe, it, expect } from 'vitest';
import { formatMonthLabel, buildPaymentHistory, type PaymentHistoryMonthRow, type PaymentHistoryEntry } from './paymentHistory';

describe('formatMonthLabel', () => {
  it('formats a YYYY-MM string as short month + year', () => {
    expect(formatMonthLabel('2026-08')).toBe('Aug 2026');
  });

  it('handles December correctly (no year rollover bug)', () => {
    expect(formatMonthLabel('2025-12')).toBe('Dec 2025');
  });
});

describe('buildPaymentHistory', () => {
  const baseRow: PaymentHistoryMonthRow = {
    rent_payment_id: 1,
    month: '2026-08',
    expected_rent: 1000,
    amount_paid: 400,
    status: 'partial',
    written_off_amount: null,
    written_off_reason: null,
  };

  it('attaches entries for a matching rent_payment_id', () => {
    const entry: PaymentHistoryEntry = { id: 10, amount: 400, paid_date: '2026-08-05', payment_method: 'cash', receipt_no: 'R-1', notes: null };
    const result = buildPaymentHistory([baseRow], new Map([[1, [entry]]]));
    expect(result[0]!.entries).toEqual([entry]);
  });

  it('returns an empty entries array when no entries exist for that month', () => {
    const result = buildPaymentHistory([baseRow], new Map());
    expect(result[0]!.entries).toEqual([]);
  });

  it('computes balance as expected minus paid', () => {
    const result = buildPaymentHistory([baseRow], new Map());
    expect(result[0]!.balance).toBe(600);
  });

  it('floors balance at 0 when overpaid instead of going negative', () => {
    const overpaid: PaymentHistoryMonthRow = { ...baseRow, amount_paid: 1200 };
    const result = buildPaymentHistory([overpaid], new Map());
    expect(result[0]!.balance).toBe(0);
  });

  it('includes month_label alongside the raw month', () => {
    const result = buildPaymentHistory([baseRow], new Map());
    expect(result[0]!.month_label).toBe('Aug 2026');
  });
});
