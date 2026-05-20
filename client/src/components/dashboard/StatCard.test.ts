import { describe, it, expect } from 'vitest';
import { deltaClass } from './StatCard';

describe('deltaClass', () => {
  it('returns green for up', () => {
    expect(deltaClass('up')).toContain('green');
  });
  it('returns red for down', () => {
    expect(deltaClass('down')).toContain('red');
  });
  it('returns muted for neutral', () => {
    expect(deltaClass('neutral')).toContain('muted');
  });
});
