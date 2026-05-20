import { describe, it, expect } from 'vitest';
import { barColor } from './RentBarChart';

describe('barColor', () => {
  it('green for >= 80', () => expect(barColor(80)).toBe('#22c55e'));
  it('green for 100',   () => expect(barColor(100)).toBe('#22c55e'));
  it('amber for 50-79', () => expect(barColor(61)).toBe('#f59e0b'));
  it('red for < 50',    () => expect(barColor(45)).toBe('#ef4444'));
  it('red for 0',       () => expect(barColor(0)).toBe('#ef4444'));
});
