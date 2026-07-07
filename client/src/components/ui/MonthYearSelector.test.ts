import { describe, it, expect } from 'vitest';
import { stepMonth, withMonth, withYear, getYearOptions } from './MonthYearSelector';

describe('stepMonth', () => {
  it('steps forward within a year', () => {
    expect(stepMonth('2026-03', 1)).toBe('2026-04');
  });
  it('steps backward within a year', () => {
    expect(stepMonth('2026-03', -1)).toBe('2026-02');
  });
  it('rolls forward across a year boundary', () => {
    expect(stepMonth('2025-12', 1)).toBe('2026-01');
  });
  it('rolls backward across a year boundary', () => {
    expect(stepMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('withMonth', () => {
  it('replaces the month part and keeps the year', () => {
    expect(withMonth('2026-03', '11')).toBe('2026-11');
  });
});

describe('withYear', () => {
  it('replaces the year part and keeps the month', () => {
    expect(withYear('2026-03', 2030)).toBe('2030-03');
  });
});

describe('getYearOptions', () => {
  const now = new Date(2026, 6, 7); // 2026-07-07, matches this plan's "today"

  it('returns a window from currentYear-5 to currentYear+1 when selected year is inside it', () => {
    expect(getYearOptions('2026-03', now)).toEqual([2021, 2022, 2023, 2024, 2025, 2026, 2027]);
  });

  it('widens the window downward to include a selected year below the default range', () => {
    expect(getYearOptions('2015-03', now)).toEqual([2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]);
  });

  it('widens the window upward to include a selected year above the default range', () => {
    expect(getYearOptions('2030-03', now)).toEqual([2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030]);
  });
});
