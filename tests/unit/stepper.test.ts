import { describe, expect, it } from 'vitest';
import {
  applyStep, back, isDone, next, showAll, start, stepAnnouncement,
} from '../../src/islands/stepper';

const samples = [
  { text: '[sample sentence one]' },
  { text: '[sample sentence two]' },
  { text: '[sample sentence three]' },
];

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

  it('treats invalid counts as an empty lesson rather than showing a negative step', () => {
    for (const count of [-1, Number.NaN, Infinity, 2.5]) {
      expect(start(count)).toEqual({ shown: 0, total: 0 });
    }
  });

  it('returns the same state at a boundary instead of pretending to move', () => {
    const first = start(3);
    const final = showAll(first);
    expect(back(first)).toBe(first);
    expect(next(final)).toBe(final);
    expect(showAll(final)).toBe(final);
    const empty = start(0);
    expect(next(empty)).toBe(empty);
    expect(showAll(empty)).toBe(empty);
  });

  it('advances and returns without losing earlier revealed sentences', () => {
    const second = applyStep(start(3), 'next');
    expect(second.shown).toBe(2);
    expect(applyStep(second, 'back').shown).toBe(1);
    expect(applyStep(second, 'show-all').shown).toBe(3);
  });

  it('announces only the newly revealed sentence, not the whole list', () => {
    const first = start(3);
    const second = next(first);
    expect(stepAnnouncement(first, second, 'next', samples))
      .toBe('sentence 2 of 3: [sample sentence two]');
    const final = next(second);
    expect(stepAnnouncement(second, final, 'next', samples))
      .toBe('sentence 3 of 3: [sample sentence three]');
  });

  it('announces showing all without reading the entire lesson aloud', () => {
    const first = start(3);
    expect(stepAnnouncement(first, showAll(first), 'show-all', samples))
      .toBe('all 3 sentences are now shown.');
  });

  it('announces the target when going back', () => {
    const second = next(start(3));
    expect(stepAnnouncement(second, back(second), 'back', samples))
      .toBe('back to sentence 1 of 3.');
  });

  it('never announces a movement that did not happen', () => {
    const first = start(3);
    const final = showAll(first);
    const empty = start(0);
    expect(stepAnnouncement(first, back(first), 'back', samples)).toBeNull();
    expect(stepAnnouncement(final, next(final), 'next', samples)).toBeNull();
    expect(stepAnnouncement(final, showAll(final), 'show-all', samples)).toBeNull();
    expect(stepAnnouncement(empty, showAll(empty), 'show-all', [])).toBeNull();
  });

  it('does not invent words when a sentence is missing or blank', () => {
    const first = start(2);
    const second = next(first);
    expect(stepAnnouncement(first, second, 'next', []))
      .toBe('sentence 2 of 2 is now shown.');
    expect(stepAnnouncement(first, second, 'next', [{ text: '[sample]' }, { text: '   ' }]))
      .toBe('sentence 2 of 2 is now shown.');
  });
});
