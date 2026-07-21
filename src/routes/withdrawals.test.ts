import { describe, it, expect } from 'vitest';
import { withdrawalSchema } from './withdrawals';

describe('withdrawalSchema', () => {
  const base = {
    withdrawn_by: 'Boss',
    amount: 5000,
    withdrawn_date: '2026-07-21',
  };

  it('accepts a cash withdrawal with no cheque number', () => {
    const result = withdrawalSchema.safeParse({ ...base, payment_method: 'cash' });
    expect(result.success).toBe(true);
  });

  it('accepts a cheque withdrawal with a cheque number', () => {
    const result = withdrawalSchema.safeParse({ ...base, payment_method: 'cheque', cheque_number: '000123' });
    expect(result.success).toBe(true);
  });

  it('rejects a cheque withdrawal with no cheque number', () => {
    const result = withdrawalSchema.safeParse({ ...base, payment_method: 'cheque' });
    expect(result.success).toBe(false);
  });

  it('rejects a cheque withdrawal with an empty-string cheque number', () => {
    const result = withdrawalSchema.safeParse({ ...base, payment_method: 'cheque', cheque_number: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive amount', () => {
    const result = withdrawalSchema.safeParse({ ...base, payment_method: 'cash', amount: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects an empty withdrawn_by', () => {
    const result = withdrawalSchema.safeParse({ ...base, payment_method: 'cash', withdrawn_by: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed date', () => {
    const result = withdrawalSchema.safeParse({ ...base, payment_method: 'cash', withdrawn_date: '21-07-2026' });
    expect(result.success).toBe(false);
  });
});
