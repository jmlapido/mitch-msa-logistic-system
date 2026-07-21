import { describe, it, expect } from 'vitest';
import { commissionSchema } from './commissions';

describe('commissionSchema', () => {
  const base = {
    name: 'John Agent',
    amount: 500,
    paid_date: '2026-07-21',
  };

  it('accepts a cash payment with no cheque number', () => {
    const result = commissionSchema.safeParse({ ...base, payment_method: 'cash' });
    expect(result.success).toBe(true);
  });

  it('accepts a cheque payment with a cheque number', () => {
    const result = commissionSchema.safeParse({ ...base, payment_method: 'cheque', cheque_number: '000123' });
    expect(result.success).toBe(true);
  });

  it('rejects a cheque payment with no cheque number', () => {
    const result = commissionSchema.safeParse({ ...base, payment_method: 'cheque' });
    expect(result.success).toBe(false);
  });

  it('rejects a cheque payment with an empty-string cheque number', () => {
    const result = commissionSchema.safeParse({ ...base, payment_method: 'cheque', cheque_number: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive amount', () => {
    const result = commissionSchema.safeParse({ ...base, payment_method: 'cash', amount: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = commissionSchema.safeParse({ ...base, payment_method: 'cash', name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed date', () => {
    const result = commissionSchema.safeParse({ ...base, payment_method: 'cash', paid_date: '21-07-2026' });
    expect(result.success).toBe(false);
  });
});
