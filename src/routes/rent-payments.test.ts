import { describe, it, expect } from 'vitest';
import { writeOffSchema } from './rent-payments';

describe('writeOffSchema', () => {
  it('accepts a non-empty reason', () => {
    const result = writeOffSchema.safeParse({ reason: 'Tenant evicted, unrecoverable' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty reason', () => {
    const result = writeOffSchema.safeParse({ reason: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing reason', () => {
    const result = writeOffSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a reason longer than 500 characters', () => {
    const result = writeOffSchema.safeParse({ reason: 'a'.repeat(501) });
    expect(result.success).toBe(false);
  });
});
