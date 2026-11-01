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
