import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, signJWT, verifyJWT } from './auth';

describe('hashPassword / verifyPassword', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('secret123');
    expect(await verifyPassword('secret123', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('secret123');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('signJWT / verifyJWT', () => {
  const secret = 'test-secret';
  const payload = { sub: 1, email: 'a@b.com', role: 'admin' as const, name: 'Admin', exp: Math.floor(Date.now() / 1000) + 3600 };

  it('verifies a valid token', async () => {
    const token = await signJWT(payload, secret);
    const result = await verifyJWT(token, secret);
    expect(result?.sub).toBe(1);
    expect(result?.role).toBe('admin');
  });

  it('rejects a tampered token', async () => {
    const token = await signJWT(payload, secret);
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(await verifyJWT(tampered, secret)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const expired = { ...payload, exp: Math.floor(Date.now() / 1000) - 1 };
    const token = await signJWT(expired, secret);
    expect(await verifyJWT(token, secret)).toBeNull();
  });
});
