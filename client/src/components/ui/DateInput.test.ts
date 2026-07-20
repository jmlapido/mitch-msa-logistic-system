import { describe, it, expect } from 'vitest';
import { getCalendarYearRange, isoToDisplay } from './DateInput';

describe('getCalendarYearRange', () => {
  const now = new Date(2026, 6, 20); // 2026-07-20

  it('returns a default +/-10 year window around now when value is empty', () => {
    expect(getCalendarYearRange('', now)).toEqual({ fromYear: 2016, toYear: 2036 });
  });

  it('widens the window downward to include a selected year below the default range', () => {
    expect(getCalendarYearRange('2010-05-01', now)).toEqual({ fromYear: 2010, toYear: 2036 });
  });

  it('widens the window upward to include a selected year above the default range', () => {
    expect(getCalendarYearRange('2040-05-01', now)).toEqual({ fromYear: 2016, toYear: 2040 });
  });

  it('keeps the default window when the selected year is inside it', () => {
    expect(getCalendarYearRange('2026-01-15', now)).toEqual({ fromYear: 2016, toYear: 2036 });
  });
});

describe('isoToDisplay', () => {
  it('formats a valid ISO date to DD/MM/YYYY', () => {
    expect(isoToDisplay('2026-07-20')).toBe('20/07/2026');
  });

  it('returns an empty string for an empty value', () => {
    expect(isoToDisplay('')).toBe('');
  });
});
