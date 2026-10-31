import { describe, expect, it } from 'vitest';
import {
  hasNextRound,
  isPicked,
  isRoundOver,
  matchedCount,
  nextRound,
  PAIRS_PER_ROUND,
  pick,
  planRounds,
  roundCount,
  startMatching,
  type MatchCard,
} from '../../src/islands/matching';

/** Same numbers every run, so random orders can be checked exactly. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const deck: MatchCard[] = [
  { front: 'Term one', back: 'Meaning one' },
  { front: 'Term two', back: 'Meaning two' },
  { front: 'Term three', back: 'Meaning three' },
];

describe('a Matching round', () => {
  it('shows every card of a small deck once as a term and once as a meaning, in random order', () => {
    const s = startMatching(deck, seeded(3));
    expect([...s.terms].sort()).toEqual([0, 1, 2]);
    expect([...s.meanings].sort()).toEqual([0, 1, 2]);
    expect(startMatching(deck, seeded(3))).toEqual(s);
    expect(matchedCount(s)).toBe(0);
    expect(isRoundOver(s)).toBe(false);
  });

  it('matches a term and its meaning, picked in either order', () => {
    let s = startMatching(deck, seeded(1));
    s = pick(s, 'term', 1);
    expect(isPicked(s, 'term', 1)).toBe(true);
    s = pick(s, 'meaning', 1);
    expect(s.matchedTerms).toEqual([1]);
    expect(s.matchedMeanings).toEqual([1]);
    expect(s.last).toEqual({ term: 1, meaning: 1, correct: true });
    expect(s.picked).toBeNull();

    s = pick(pick(s, 'meaning', 2), 'term', 2);
    expect(matchedCount(s)).toBe(2);
    expect(s.misses).toBe(0);
  });

  it('counts a wrong pair as a miss and keeps both items in play', () => {
    let s = startMatching(deck, seeded(1));
    s = pick(pick(s, 'term', 0), 'meaning', 2);
    expect(s.last).toEqual({ term: 0, meaning: 2, correct: false });
    expect(s.misses).toBe(1);
    expect(matchedCount(s)).toBe(0);
    s = pick(pick(s, 'term', 0), 'meaning', 0);
    expect(matchedCount(s)).toBe(1);
  });

  it('moves the pick within a list, and lets go when the same item is picked again', () => {
    let s = startMatching(deck, seeded(1));
    s = pick(s, 'term', 0);
    s = pick(s, 'term', 2);
    expect(isPicked(s, 'term', 2)).toBe(true);
    expect(isPicked(s, 'term', 0)).toBe(false);
    s = pick(s, 'term', 2);
    expect(s.picked).toBeNull();
  });

  it('ignores items already matched or not in the round', () => {
    let s = startMatching(deck, seeded(1));
    s = pick(pick(s, 'term', 0), 'meaning', 0);
    expect(pick(s, 'term', 0)).toEqual(s);
    expect(pick(s, 'meaning', 0)).toEqual(s);
    expect(pick(s, 'term', 7)).toEqual(s);
  });

  it('is over once every term is matched, and a small deck has no next round', () => {
    let s = startMatching(deck, seeded(1));
    for (const i of [2, 0, 1]) s = pick(pick(s, 'term', i), 'meaning', i);
    expect(isRoundOver(s)).toBe(true);
    expect(hasNextRound(s)).toBe(false);
    expect(nextRound(s)).toEqual(s);
    expect(roundCount(s)).toBe(1);
  });

  it('puts cards that read the same on either side into different rounds, so every round can be finished', () => {
    // (A, X), (A, Y), (B, Y): any two of them share a term or a meaning.
    const twins: MatchCard[] = [
      { front: 'A', back: 'X' },
      { front: 'a.', back: 'Y' },
      { front: 'B', back: 'y' },
    ];
    expect(planRounds(twins)).toEqual([[0, 2], [1]]);
    let s = startMatching(twins, seeded(2));
    expect([...s.terms].sort()).toEqual([0, 2]);
    s = pick(pick(s, 'term', 0), 'meaning', 2);
    expect(s.last?.correct).toBe(false);
    s = pick(pick(s, 'term', 0), 'meaning', 0);
    s = pick(pick(s, 'term', 2), 'meaning', 2);
    expect(isRoundOver(s)).toBe(true);
    s = nextRound(s, seeded(3));
    expect(s.terms).toEqual([1]);
    s = pick(pick(s, 'meaning', 1), 'term', 1);
    expect(isRoundOver(s)).toBe(true);
    expect(hasNextRound(s)).toBe(false);
  });
});

describe('a big deck', () => {
  const big: MatchCard[] = Array.from({ length: 14 }, (_, i) => ({ front: `T${i}`, back: `M${i}` }));

  it(`plays ${PAIRS_PER_ROUND} pairs a round, taking the next cards each time`, () => {
    let s = startMatching(big, seeded(5));
    expect(roundCount(s)).toBe(3);
    expect([...s.terms].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(nextRound(s)).toEqual(s);

    const finish = () => {
      for (const i of [...s.terms]) s = pick(pick(s, 'term', i), 'meaning', i);
    };
    finish();
    expect(hasNextRound(s)).toBe(true);
    s = nextRound(s, seeded(6));
    expect(s.roundNumber).toBe(2);
    expect([...s.terms].sort((a, b) => a - b)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(s.misses).toBe(0);
    finish();
    s = nextRound(s, seeded(7));
    expect([...s.meanings].sort((a, b) => a - b)).toEqual([12, 13]);
    finish();
    expect(isRoundOver(s)).toBe(true);
    expect(hasNextRound(s)).toBe(false);
  });
});
