import { describe, it, expect } from 'vitest';
import { terminateSchema } from './contracts';

describe('terminateSchema', () => {
  it('accepts a non-empty reason', () => {
    const result = terminateSchema.safeParse({ reason: 'Non-payment' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty reason', () => {
    const result = terminateSchema.safeParse({ reason: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing reason', () => {
    const result = terminateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a reason longer than 500 characters', () => {
    const result = terminateSchema.safeParse({ reason: 'a'.repeat(501) });
    expect(result.success).toBe(false);
  });
});
