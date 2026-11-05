import { describe, expect, it } from 'vitest';
import { HEADER_HIDE_AFTER_PX, nextHeaderState } from '../../src/scripts/headerscroll';

describe('header scroll decision boundaries', () => {
  it('keeps navigation visible through the hide threshold', () => {
    expect(HEADER_HIDE_AFTER_PX).toBe(80);
    expect(nextHeaderState('hidden', 0, 0, false, false)).toBe('visible');
    expect(nextHeaderState('hidden', 80, 79, false, false)).toBe('visible');
    expect(nextHeaderState('visible', 81, 80, false, false)).toBe('hidden');
  });

  it('shows navigation when the user scrolls up and preserves a stationary state', () => {
    expect(nextHeaderState('hidden', 200, 201, false, false)).toBe('visible');
    expect(nextHeaderState('hidden', 200, 200, false, false)).toBe('hidden');
    expect(nextHeaderState('visible', 200, 200, false, false)).toBe('visible');
  });

  it('fails open for invalid positions and negative history', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(nextHeaderState('hidden', value, 100, false, false)).toBe('visible');
      expect(nextHeaderState('hidden', 100, value, false, false)).toBe('visible');
    }
    expect(nextHeaderState('hidden', 200, -1, false, false)).toBe('visible');
  });

  it('keeps navigation visible while focus or an open menu needs it', () => {
    expect(nextHeaderState('hidden', 400, 300, true, false)).toBe('visible');
    expect(nextHeaderState('hidden', 400, 300, false, true)).toBe('visible');
  });
});
