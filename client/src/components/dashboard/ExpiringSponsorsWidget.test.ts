import { describe, it, expect } from 'vitest';
import { daysBadgeClass } from './ExpiringSponsorsWidget';

describe('daysBadgeClass', () => {
  it('red for < 14 days',   () => expect(daysBadgeClass(13)).toContain('red'));
  it('amber for 14-29',     () => expect(daysBadgeClass(20)).toContain('yellow'));
  it('blue for >= 30',      () => expect(daysBadgeClass(45)).toContain('blue'));
});
