import { describe, expect, it } from 'vitest';
import { dayLabel } from '../../src/islands/daily';

describe('dayLabel', () => {
  it.each([
    [new Date(2026, 10, 1, 15), 'sun 1 nov'],
    [new Date(2026, 11, 24, 9), 'thu 24 dec'],
    [new Date(2024, 1, 29, 23, 59, 59), 'thu 29 feb'],
    [new Date(2024, 0, 1), 'mon 1 jan'],
    [new Date(2024, 11, 31), 'tue 31 dec'],
  ])('formats %s as a lowercase weekday, day and month', (date, label) => {
    expect(dayLabel(date)).toBe(label);
  });

  it('keeps the visitor-facing day number unpadded', () => {
    expect(dayLabel(new Date(2026, 2, 7))).toBe('sat 7 mar');
  });

  it('keeps the invalid-date result explicit instead of throwing', () => {
    expect(dayLabel(new Date(Number.NaN))).toBe('invalid date NaN invalid date');
  });
});
