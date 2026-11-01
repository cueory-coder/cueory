import { describe, expect, it } from 'vitest';
import {
  back,
  counts,
  current,
  flip,
  isRoundOver,
  knowIt,
  loadStars,
  nextRound,
  order,
  reorderRest,
  saveStars,
  start,
  starredIndexes,
  starsStorageKey,
  stillLearning,
  stillLearningCards,
  toggleStar,
} from '../../src/islands/cards';
import { PROGRESS_STORAGE_KEY } from '../../src/scripts/progress';
import type { KeyValueStorage } from '../../src/scripts/storage';

/** Same numbers every run, so shuffled orders can be checked exactly. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

const blockedStorage: KeyValueStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('flashcard rounds', () => {
  it('starts on the first card, question side up, with nothing sorted', () => {
    const s = start([0, 1, 2]);
    expect(current(s)).toBe(0);
    expect(s.flipped).toBe(false);
    expect(s.roundNumber).toBe(1);
    expect(s.touched).toBe(false);
    expect(counts(s)).toEqual({ know: 0, learning: 0, left: 3 });
    expect(isRoundOver(s)).toBe(false);
  });

  it('flips back and forth', () => {
    const s = flip(start([0, 1]));
    expect(s.flipped).toBe(true);
    expect(flip(s).flipped).toBe(false);
  });

  it('"Know it" and "Still learning" sort the card and show the next one question side up', () => {
    let s = knowIt(flip(start([0, 1, 2])));
    expect(current(s)).toBe(1);
    expect(s.flipped).toBe(false);
    s = stillLearning(flip(s));
    expect(current(s)).toBe(2);
    expect(counts(s)).toEqual({ know: 1, learning: 1, left: 1 });
  });

  it('ends the round once every card is sorted, and then ignores study actions', () => {
    const s = knowIt(stillLearning(knowIt(start([0, 1, 2]))));
    expect(isRoundOver(s)).toBe(true);
    expect(current(s)).toBeUndefined();
    expect(counts(s)).toEqual({ know: 2, learning: 1, left: 0 });
    expect(knowIt(s)).toEqual(s);
    expect(stillLearning(s)).toEqual(s);
    expect(flip(s)).toEqual(s);
  });

  it('"Back" returns to the previous card and undoes how it was sorted', () => {
    let s = stillLearning(knowIt(start([0, 1, 2])));
    s = back(s);
    expect(current(s)).toBe(1);
    expect(counts(s)).toEqual({ know: 1, learning: 0, left: 2 });
    s = back(back(s));
    expect(current(s)).toBe(0);
    expect(counts(s)).toEqual({ know: 0, learning: 0, left: 3 });
  });

  it('"Back" on the first card stays put and shows the question side', () => {
    const s = back(flip(start([0, 1])));
    expect(s.pos).toBe(0);
    expect(s.flipped).toBe(false);
  });

  it('the next round is only the "Still learning" pile', () => {
    let s = start([0, 1, 2, 3]);
    s = knowIt(stillLearning(knowIt(stillLearning(s)))); // 0 and 2 still learning
    expect(stillLearningCards(s)).toEqual([0, 2]);
    s = nextRound(s, false);
    expect(s.round).toEqual([0, 2]);
    expect(s.roundNumber).toBe(2);
    expect(s.touched).toBe(false);
    expect(counts(s)).toEqual({ know: 0, learning: 0, left: 2 });
    s = knowIt(knowIt(s));
    expect(isRoundOver(s)).toBe(true);
    expect(stillLearningCards(s)).toEqual([]);
  });

  it('keeps the round order the student saw when listing "Still learning" cards', () => {
    const s = stillLearning(stillLearning(start([2, 0, 1])));
    expect(stillLearningCards(s)).toEqual([2, 0]);
    expect(nextRound(s, false).round).toEqual([0, 2]);
  });

  it('handles an empty deck', () => {
    const s = start([]);
    expect(isRoundOver(s)).toBe(true);
    expect(back(s).pos).toBe(0);
    expect(counts(s)).toEqual({ know: 0, learning: 0, left: 0 });
  });
});

describe('shuffle', () => {
  it('keeps deck order when shuffle is off, without changing the list passed in', () => {
    const input = [2, 0, 1];
    expect(order(input, false)).toEqual([0, 1, 2]);
    expect(input).toEqual([2, 0, 1]);
  });

  it('shuffles into a new order with every card exactly once', () => {
    const input = [0, 1, 2, 3, 4, 5, 6, 7];
    const shuffled = order(input, true, seeded(7));
    expect(shuffled).not.toEqual(input);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(input);
    expect(order(input, true, seeded(7))).toEqual(shuffled);
    expect(input).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('copes with a random source that returns its highest value', () => {
    const shuffled = order([0, 1, 2], true, () => 0.9999999999);
    expect([...shuffled].sort()).toEqual([0, 1, 2]);
  });

  it('turning shuffle on reorders only the cards still to come', () => {
    let s = knowIt(start([0, 1, 2, 3, 4, 5, 6, 7])); // card 0 sorted, card 1 on screen
    s = reorderRest(flip(s), true, seeded(3));
    expect(s.round.slice(0, 2)).toEqual([0, 1]);
    expect(current(s)).toBe(1);
    expect(s.flipped).toBe(true);
    expect(s.marks).toEqual(['know']);
    expect([...s.round.slice(2)].sort()).toEqual([2, 3, 4, 5, 6, 7]);
    expect(s.round.slice(2)).not.toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('turning shuffle off puts the cards still to come back in deck order, keeping a flipped card on screen', () => {
    const s = reorderRest(flip(start([3, 1, 2, 0])), false);
    expect(s.round).toEqual([3, 0, 1, 2]);
    expect(current(s)).toBe(3);
  });

  it('before any card is flipped or sorted, reorders the whole round', () => {
    const all = [0, 1, 2, 3, 4, 5, 6, 7];
    expect(reorderRest(start(all), true, seeded(5)).round).toEqual(order(all, true, seeded(5)));
    expect(reorderRest(start([3, 1, 2, 0]), false).round).toEqual([0, 1, 2, 3]);
  });

  it('keeps the card on screen after "Show question" or "Back" returns to the first card', () => {
    const all = [0, 1, 2, 3, 4, 5, 6, 7];
    const flippedBack = flip(flip(start(all)));
    expect(flippedBack.flipped).toBe(false);
    expect(reorderRest(flippedBack, true, seeded(5)).round[0]).toBe(0);

    const wentBack = back(knowIt(start(all)));
    expect(wentBack.pos).toBe(0);
    const reordered = reorderRest(wentBack, true, seeded(5));
    expect(reordered.round[0]).toBe(0);
    expect([...reordered.round.slice(1)].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('leaves a finished round alone', () => {
    const s = knowIt(start([0]));
    expect(reorderRest(s, true, seeded(1))).toEqual(s);
  });

  it('can shuffle the next round', () => {
    let s = start([0, 1, 2, 3, 4, 5]);
    for (let i = 0; i < 6; i++) s = stillLearning(s);
    const next = nextRound(s, true, seeded(11));
    expect([...next.round].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(next.round).toEqual(order([0, 1, 2, 3, 4, 5], true, seeded(11)));
  });
});

describe('stars', () => {
  const cards = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];

  it('toggles a star on and off without changing the set passed in', () => {
    const none = new Set<string>();
    const one = toggleStar(none, 'c2');
    expect([...one]).toEqual(['c2']);
    expect(none.size).toBe(0);
    expect(toggleStar(one, 'c2').size).toBe(0);
  });

  it('lists starred cards in deck order', () => {
    expect(starredIndexes(cards, new Set(['c3', 'c1']))).toEqual([0, 2]);
    expect(starredIndexes(cards, new Set())).toEqual([]);
  });

  it('saves stars in the guest-progress record (D-69), and removes the record when nothing is left', () => {
    const storage = memoryStorage();
    saveStars(storage, 'deck-a', new Set(['c3', 'c1']));
    expect(JSON.parse(storage.data[PROGRESS_STORAGE_KEY]!).decks['deck-a'].starred).toEqual(['c1', 'c3']);
    expect([...loadStars(storage, 'deck-a', ['c1', 'c2', 'c3'])]).toEqual(['c1', 'c3']);
    saveStars(storage, 'deck-a', new Set());
    expect(storage.data).toEqual({});
  });

  it('moves stars saved before D-69 into the record the next time they change', () => {
    expect(starsStorageKey('deck-a')).toBe('cueory-stars-deck-a');
    const storage = memoryStorage({ [starsStorageKey('deck-a')]: '["c1"]' });
    const stars = loadStars(storage, 'deck-a', ['c1', 'c2']);
    saveStars(storage, 'deck-a', toggleStar(stars, 'c2'));
    expect(storage.data[starsStorageKey('deck-a')]).toBeUndefined();
    expect([...loadStars(storage, 'deck-a', ['c1', 'c2'])]).toEqual(['c1', 'c2']);
  });

  it('reads saved stars back, keeping only cards that are still in the deck', () => {
    const storage = memoryStorage({ [starsStorageKey('deck-a')]: '["c1","gone","c3"]' });
    expect([...loadStars(storage, 'deck-a', ['c1', 'c2', 'c3'])]).toEqual(['c1', 'c3']);
    expect(loadStars(storage, 'deck-b', ['c1']).size).toBe(0);
  });

  it('ignores anything unreadable', () => {
    for (const saved of ['not json', '{"c1":true}', '"c1"', '[1, null, {"id":"c1"}]', 'null']) {
      const storage = memoryStorage({ [starsStorageKey('deck-a')]: saved });
      expect(loadStars(storage, 'deck-a', ['c1']).size).toBe(0);
    }
  });

  it('still works when browser storage is missing or blocked', () => {
    expect(loadStars(undefined, 'deck-a', ['c1']).size).toBe(0);
    expect(loadStars(blockedStorage, 'deck-a', ['c1']).size).toBe(0);
    expect(() => saveStars(blockedStorage, 'deck-a', new Set(['c1']))).not.toThrow();
    expect(() => saveStars(undefined, 'deck-a', new Set(['c1']))).not.toThrow();
  });
});
