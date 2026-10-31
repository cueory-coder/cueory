import { describe, expect, it } from 'vitest';
import { back, current, flip, gotIt, isDone, seeAgain, start } from '../../src/islands/cards';

describe('card deck', () => {
  it('starts on the first card, question side up', () => {
    const s = start(3);
    expect(current(s)).toBe(0);
    expect(s.flipped).toBe(false);
    expect(isDone(s)).toBe(false);
  });

  it('flips back and forth', () => {
    const s = flip(start(2));
    expect(s.flipped).toBe(true);
    expect(flip(s).flipped).toBe(false);
  });

  it('"Got it" moves on and shows the next card question side up', () => {
    const s = gotIt(flip(start(2)));
    expect(current(s)).toBe(1);
    expect(s.flipped).toBe(false);
  });

  it('"See again" brings the card back at the end of the round', () => {
    let s = seeAgain(flip(start(3))); // card 0 again
    expect(s.queue).toEqual([0, 1, 2, 0]);
    s = gotIt(gotIt(s));
    expect(current(s)).toBe(0);
    s = gotIt(s);
    expect(isDone(s)).toBe(true);
  });

  it('finishes after every card is marked "Got it"', () => {
    let s = start(2);
    s = gotIt(gotIt(s));
    expect(isDone(s)).toBe(true);
    expect(current(s)).toBeUndefined();
    expect(gotIt(s)).toEqual(s);
    expect(seeAgain(s)).toEqual(s);
    expect(flip(s)).toEqual(s);
  });

  it('goes back one card, never before the first', () => {
    const s = back(gotIt(start(3)));
    expect(current(s)).toBe(0);
    expect(back(s).pos).toBe(0);
  });

  it('handles an empty deck', () => {
    const s = start(0);
    expect(isDone(s)).toBe(true);
    expect(back(s).pos).toBe(0);
  });
});
