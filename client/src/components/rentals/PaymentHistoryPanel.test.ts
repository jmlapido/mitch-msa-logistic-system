import { describe, it, expect } from 'vitest';
import { defaultMonthExpanded } from './PaymentHistoryPanel';

describe('defaultMonthExpanded', () => {
  it('expands overdue months', () => {
    expect(defaultMonthExpanded('overdue', 0)).toBe(true);
  });

  it('expands partial months', () => {
    expect(defaultMonthExpanded('partial', 200)).toBe(true);
  });

  it('expands a pending month that still has an outstanding balance', () => {
    expect(defaultMonthExpanded('pending', 500)).toBe(true);
  });

  it('collapses a fully collected month', () => {
    expect(defaultMonthExpanded('collected', 0)).toBe(false);
  });

  it('collapses a written-off month with no remaining balance', () => {
    expect(defaultMonthExpanded('written_off', 0)).toBe(false);
  });

  it('collapses a written-off month even when it still has an outstanding balance', () => {
    expect(defaultMonthExpanded('written_off', 500)).toBe(false);
  });
});
