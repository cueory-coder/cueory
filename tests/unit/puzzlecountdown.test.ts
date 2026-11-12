import { describe, expect, it } from 'vitest';
import { nextPuzzleAt, puzzleCountdown } from '../../src/islands/puzzlecountdown';

describe('next local puzzle day', () => {
  it.each([
    new Date(2026, 0, 31, 23, 59, 59),
    new Date(2026, 11, 31, 23, 59, 59),
    new Date(2028, 1, 28, 23, 59, 59),
    new Date(2028, 1, 29, 23, 59, 59),
    new Date(2026, 2, 8, 0),
    new Date(2026, 10, 1, 0),
  ])('uses the next calendar midnight for %s', (now) => {
    const target = new Date(nextPuzzleAt(now));
    const expected = new Date(now);
    expected.setDate(expected.getDate() + 1);
    expected.setHours(0, 0, 0, 0);
    expect(target.getTime()).toBe(expected.getTime());
    expect(target.getHours()).toBe(0);
  });

  it('rejects an invalid clock date', () => expect(() => nextPuzzleAt(new Date(NaN))).toThrow(RangeError));

  it('keeps fractional seconds until the deadline and clamps an overdue result to zero', () => {
    expect(puzzleCountdown(1001, 1000)).toMatchObject({ seconds: 1, text: '00:00:01' });
    expect(puzzleCountdown(1000, 1000)).toMatchObject({ seconds: 0, text: '00:00:00' });
    expect(puzzleCountdown(1000, 9000)).toMatchObject({ seconds: 0, text: '00:00:00' });
  });

  it('recomputes from the wall clock after a suspended tab rather than counting interval callbacks', () => {
    expect(puzzleCountdown(90_000, 0).text).toBe('00:01:30');
    expect(puzzleCountdown(90_000, 75_000).text).toBe('00:00:15');
    expect(puzzleCountdown(90_000, 95_000).seconds).toBe(0);
  });

  it('represents a 25-hour day without wrapping and supplies spoken text', () => {
    expect(puzzleCountdown(90_061_000, 0)).toEqual({ seconds: 90061, text: '25:01:01', spoken: '25 hours, 1 minute, 1 second' });
  });
});
