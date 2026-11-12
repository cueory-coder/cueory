import { describe, expect, it } from 'vitest';
import { daysUntil, examLine, validExamDate } from '../../src/islands/examdate';

// ── daysUntil ─────────────────────────────────────────────────────────────────

describe('daysUntil', () => {
  it('returns 0 when exam and today are the same day', () => {
    expect(daysUntil('2026-11-01', '2026-11-01')).toBe(0);
  });

  it('returns 1 for tomorrow', () => {
    expect(daysUntil('2026-11-02', '2026-11-01')).toBe(1);
  });

  it('returns a negative number for a past date', () => {
    expect(daysUntil('2026-10-31', '2026-11-01')).toBe(-1);
  });

  it('counts across a month end (Oct 31 → Nov 1 = 1 day)', () => {
    expect(daysUntil('2026-11-01', '2026-10-31')).toBe(1);
  });

  it('counts across a year end (Dec 31 → Jan 1 = 1 day)', () => {
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
  });

  it('counts a full non-leap year correctly (365 days)', () => {
    expect(daysUntil('2027-11-01', '2026-11-01')).toBe(365);
  });

  it('counts across a leap-year Feb 28 → Feb 29 (1 day)', () => {
    expect(daysUntil('2028-02-29', '2028-02-28')).toBe(1);
  });

  it('counts a leap year correctly (366 days)', () => {
    expect(daysUntil('2029-01-01', '2028-01-01')).toBe(366);
  });

  it('returns the same value regardless of what time zone the runtime is in (DST spring-forward day)', () => {
    // US DST spring-forward: 2027-03-14. Calendar day count must be 1, not 0.
    expect(daysUntil('2027-03-14', '2027-03-13')).toBe(1);
  });

  it('returns the same value on a DST fall-back day (2026-11-01 in the US)', () => {
    expect(daysUntil('2026-11-02', '2026-11-01')).toBe(1);
  });

  it('throws on an invalid exam date', () => {
    expect(() => daysUntil('not-a-date', '2026-11-01')).toThrow();
  });

  it('throws on an invalid today date', () => {
    expect(() => daysUntil('2026-11-01', 'not-a-date')).toThrow();
  });

  it('throws on a non-existent date like Feb 30', () => {
    expect(() => daysUntil('2026-02-30', '2026-01-01')).toThrow();
  });
});

// ── examLine ──────────────────────────────────────────────────────────────────

describe('examLine', () => {
  it('returns "your exam is today" when exam is today', () => {
    expect(examLine('2026-11-01', '2026-11-01')).toBe('your exam is today');
  });

  it('returns "your exam is tomorrow" when exam is one day away', () => {
    expect(examLine('2026-11-02', '2026-11-01')).toBe('your exam is tomorrow');
  });

  it('returns the number of days for future exams beyond tomorrow', () => {
    expect(examLine('2026-11-15', '2026-11-01')).toBe('your exam is in 14 days');
  });

  it('returns the passed message for a past exam', () => {
    expect(examLine('2026-10-31', '2026-11-01')).toBe(
      'your exam date has passed — you can change it in settings',
    );
  });

  it('never uses exclamation marks', () => {
    expect(examLine('2026-11-02', '2026-11-01')).not.toContain('!');
    expect(examLine('2026-11-01', '2026-11-01')).not.toContain('!');
  });

  it('never uses pressure words like "only" or "hurry"', () => {
    const line = examLine('2026-11-03', '2026-11-01');
    expect(line).not.toMatch(/\bonly\b|\bhurry\b/i);
  });

  it('is all lowercase', () => {
    const line = examLine('2026-11-15', '2026-11-01');
    expect(line).toBe(line.toLowerCase());
  });

  it('handles the end of a year (Dec 31 → Jan 1)', () => {
    expect(examLine('2027-01-01', '2026-12-31')).toBe('your exam is tomorrow');
  });

  it('handles a leap-day exam', () => {
    expect(examLine('2028-02-29', '2028-02-28')).toBe('your exam is tomorrow');
  });
});

// ── validExamDate ─────────────────────────────────────────────────────────────

describe('validExamDate', () => {
  it('accepts today', () => {
    expect(validExamDate('2026-11-01', '2026-11-01')).toBeNull();
  });

  it('accepts tomorrow', () => {
    expect(validExamDate('2026-11-02', '2026-11-01')).toBeNull();
  });

  it('accepts a date exactly 3 years ahead', () => {
    expect(validExamDate('2029-11-01', '2026-11-01')).toBeNull();
  });

  it('rejects a past date', () => {
    expect(validExamDate('2026-10-31', '2026-11-01')).not.toBeNull();
  });

  it('rejects a date more than 3 years ahead', () => {
    expect(validExamDate('2029-11-02', '2026-11-01')).not.toBeNull();
  });

  it('rejects a non-existent date (Feb 31)', () => {
    expect(validExamDate('2026-02-31', '2026-01-01')).not.toBeNull();
  });

  it('rejects a non-existent date (Feb 30 in a non-leap year)', () => {
    expect(validExamDate('2027-02-30', '2026-11-01')).not.toBeNull();
  });

  it('accepts Feb 29 in a leap year', () => {
    expect(validExamDate('2028-02-29', '2026-11-01')).toBeNull();
  });

  it('rejects Feb 29 in a non-leap year', () => {
    expect(validExamDate('2027-02-29', '2026-11-01')).not.toBeNull();
  });

  it('rejects a free-text string', () => {
    expect(validExamDate('next june', '2026-11-01')).not.toBeNull();
  });

  it('rejects an empty string', () => {
    expect(validExamDate('', '2026-11-01')).not.toBeNull();
  });

  it('rejects a partial date like "2026-11"', () => {
    expect(validExamDate('2026-11', '2026-11-01')).not.toBeNull();
  });

  it('returns a plain lowercase reason, no exclamation marks', () => {
    const reason = validExamDate('2026-10-31', '2026-11-01');
    expect(reason).not.toBeNull();
    expect(reason!).not.toContain('!');
    expect(reason!).toBe(reason!.toLowerCase());
  });
});

describe('exam-date calendar edge cases (S18)', () => {
  const dates = [
    { label: 'today', exam: '2026-11-11', today: '2026-11-11', days: 0, line: 'your exam is today' },
    { label: 'tomorrow', exam: '2026-11-12', today: '2026-11-11', days: 1, line: 'your exam is tomorrow' },
    { label: 'twelve days away', exam: '2026-11-23', today: '2026-11-11', days: 12, line: 'your exam is in 12 days' },
    { label: 'yesterday', exam: '2026-11-10', today: '2026-11-11', days: -1, line: 'your exam date has passed — you can change it in settings' },
    { label: 'one year ago', exam: '2025-11-11', today: '2026-11-11', days: -365, line: 'your exam date has passed — you can change it in settings' },
    { label: 'two-day year boundary', exam: '2027-01-02', today: '2026-12-31', days: 2, line: 'your exam is in 2 days' },
    { label: 'leap day to March', exam: '2028-03-01', today: '2028-02-29', days: 1, line: 'your exam is tomorrow' },
    { label: 'leap-year February 28 to March', exam: '2028-03-01', today: '2028-02-28', days: 2, line: 'your exam is in 2 days' },
    { label: 'regular February 28 to March', exam: '2029-03-01', today: '2029-02-28', days: 1, line: 'your exam is tomorrow' },
    { label: 'spring daylight-saving weekend', exam: '2027-03-15', today: '2027-03-13', days: 2, line: 'your exam is in 2 days' },
    { label: 'fall daylight-saving weekend', exam: '2026-11-02', today: '2026-10-31', days: 2, line: 'your exam is in 2 days' },
    { label: 'far-future day within the four-digit date range', exam: '2099-12-31', today: '2026-11-11', days: 26713, line: 'your exam is in 26713 days' },
  ] as const;

  it.each(dates)('$label: keeps the wording consistent with calendar-day counting', ({ exam, today, days, line }) => {
    expect(daysUntil(exam, today)).toBe(days);
    expect(examLine(exam, today)).toBe(line);
  });

  it.each([
    '2026-00-11', '2026-13-11', '2026-04-31', '2026-02-29', '1900-02-29',
    '0000-01-01', '2026-1-11', '2026/11/11', '2026-11-11T00:00', '2026-11-11 ',
  ])('rejects an invalid or non-canonical date: %s', (bad) => {
    expect(validExamDate(bad, '2026-11-11')).toBe('enter a date in the format yyyy-mm-dd');
    expect(() => daysUntil(bad, '2026-11-11')).toThrow(/exam must be a real/);
    expect(() => examLine(bad, '2026-11-11')).toThrow(/exam must be a real/);
  });

  it('rejects invalid today dates even when the exam date is valid', () => {
    expect(() => daysUntil('2026-11-11', '2026-02-30')).toThrow(/today must be a real/);
    expect(() => examLine('2026-11-11', '2026-02-30')).toThrow(/today must be a real/);
    expect(() => validExamDate('2026-11-11', '2026-02-30')).toThrow(/today must be a real/);
  });

  it('uses the last valid February date for the three-year limit from leap day', () => {
    expect(validExamDate('2028-02-29', '2028-02-29')).toBeNull();
    expect(validExamDate('2031-02-27', '2028-02-29')).toBeNull();
    expect(validExamDate('2031-02-28', '2028-02-29')).toBeNull();
    expect(validExamDate('2031-03-01', '2028-02-29')).toBe('the date must be within 3 years');
    expect(validExamDate('2028-02-28', '2028-02-29')).toBe('the date must be today or in the future');
  });

  it('rejects the day after the three-year limit, even across a leap year', () => {
    expect(validExamDate('2029-01-01', '2026-01-01')).toBeNull();
    expect(validExamDate('2029-01-02', '2026-01-01')).toBe('the date must be within 3 years');
    expect(validExamDate('2030-02-28', '2027-02-28')).toBeNull();
    expect(validExamDate('2030-03-01', '2027-02-28')).toBe('the date must be within 3 years');
  });
});
