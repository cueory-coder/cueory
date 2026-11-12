import { describe, expect, it } from 'vitest';
import { dailyLine, dailyLineFromClock, msUntilLocalMidnight, MIDNIGHT_MESSAGE } from '../../src/islands/dailyline';

describe('home daily games device-local date (W01-2)', () => {
  it('changes its displayed day exactly at local midnight', () => {
    const before = new Date(2026, 10, 11, 23, 59, 59, 999);
    const after = new Date(2026, 10, 12, 0, 0, 0);
    expect(dailyLine(before)).toContain('wed 11 nov');
    expect(dailyLine(after)).toContain('thu 12 nov');
    expect(msUntilLocalMidnight(before)).toBe(1);
    expect(msUntilLocalMidnight(after)).toBe(24 * 60 * 60 * 1000);
    expect(dailyLine(after)).toContain(MIDNIGHT_MESSAGE);
  });

  it('uses local midnight on daylight-saving transitions, rather than adding 24 hours', () => {
    const originalTZ = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      expect(msUntilLocalMidnight(new Date(2026, 2, 8, 0, 0))).toBe(23 * 60 * 60 * 1000);
      expect(msUntilLocalMidnight(new Date(2026, 10, 1, 0, 0))).toBe(25 * 60 * 60 * 1000);
    } finally {
      if (originalTZ === undefined) delete process.env.TZ;
      else process.env.TZ = originalTZ;
    }
  });

  it('leaves a truthful fallback on invalid or blocked clocks', () => {
    expect(dailyLine(null)).toBe("your device's date is unavailable. " + MIDNIGHT_MESSAGE);
    expect(dailyLine(new Date(Number.NaN))).toBe("your device's date is unavailable. " + MIDNIGHT_MESSAGE);
    expect(dailyLineFromClock(() => { throw new Error('clock blocked'); })).toBe("your device's date is unavailable. " + MIDNIGHT_MESSAGE);
    expect(msUntilLocalMidnight(new Date(Number.NaN))).toBeNull();
    expect(msUntilLocalMidnight(null)).toBeNull();
  });
});
