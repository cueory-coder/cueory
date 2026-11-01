import { describe, expect, it } from 'vitest';
import { waitsForReveal } from '../../src/scripts/reveal';

describe('home page sections fade in once (D-62)', () => {
  it('only a section that starts below the window waits to fade in; one already on screen never hides', () => {
    expect(waitsForReveal(900, 900)).toBe(true);
    expect(waitsForReveal(1400, 900)).toBe(true);
    expect(waitsForReveal(899, 900)).toBe(false);
    expect(waitsForReveal(-200, 900)).toBe(false);
  });
});
