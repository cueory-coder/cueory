import { describe, expect, it } from 'vitest';
import { back, isDone, next, showAll, start } from '../../src/islands/stepper';

describe('sentence stepper', () => {
  it('starts with one sentence shown', () => {
    expect(start(3)).toEqual({ shown: 1, total: 3 });
  });

  it('never goes past the last sentence', () => {
    let s = start(2);
    s = next(next(next(s)));
    expect(s.shown).toBe(2);
    expect(isDone(s)).toBe(true);
  });

  it('never goes below one sentence', () => {
    expect(back(back(start(3))).shown).toBe(1);
  });

  it('shows all at once', () => {
    expect(showAll(start(5)).shown).toBe(5);
  });

  it('handles an empty lesson', () => {
    const s = start(0);
    expect(s.shown).toBe(0);
    expect(isDone(s)).toBe(true);
    expect(back(s).shown).toBe(0);
  });
});
