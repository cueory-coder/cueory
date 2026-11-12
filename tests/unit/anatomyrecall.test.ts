import { describe, expect, it } from 'vitest';
import {
  RECALL_CHOICES,
  answerRecallChoice,
  answerRecallTyped,
  nextRecall,
  recallChoices,
  recallSettled,
  revealRecall,
  startRecall,
  typedMatches,
  type RecallCatalog,
} from '../../src/islands/anatomyrecall';

// Sample labels only: nothing here is anatomy.
function catalog(entries: Array<[id: string, name: string, group?: string]>): RecallCatalog {
  return {
    ids: entries.map(([id]) => id),
    names: new Map(entries.map(([id, name]) => [id, name])),
    groups: new Map(entries.map(([id, , group]) => [id, group])),
  };
}

const SAMPLE = catalog([
  ['S1', '[sample label] one', 'group a'],
  ['S2', '[sample label] two', 'group a'],
  ['S3', '[sample label] three', 'group a'],
  ['S4', '[sample label] four', 'group b'],
  ['S5', '[sample label] five', 'group b'],
  ['S6', '[sample label] six'],
]);

/** A repeatable random source, so every test is deterministic. */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('name it: choices', () => {
  it('offers the target and three other names, with no name twice', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const choices = recallChoices('S1', SAMPLE, seeded(seed));
      expect(choices).toHaveLength(RECALL_CHOICES);
      expect(choices).toContain('S1');
      expect(new Set(choices.map((id) => SAMPLE.names.get(id))).size).toBe(RECALL_CHOICES);
    }
  });

  it("prefers names from the target's own group", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const choices = recallChoices('S1', SAMPLE, seeded(seed));
      expect(choices).toContain('S2');
      expect(choices).toContain('S3');
    }
  });

  it('does not always put the answer in the same place', () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) positions.add(recallChoices('S1', SAMPLE, seeded(seed)).indexOf('S1'));
    expect(positions.size).toBeGreaterThan(1);
  });

  it("never offers a second structure with the target's name, or two with the same name", () => {
    const twins = catalog([
      ['A', '[sample label] same'],
      ['B', '[sample label] Same'],
      ['C', '[sample label] other'],
      ['D', '[sample label] OTHER'],
      ['E', '[sample label] third'],
    ]);
    for (let seed = 1; seed <= 25; seed++) {
      const choices = recallChoices('A', twins, seeded(seed));
      expect(choices).toContain('A');
      expect(choices).not.toContain('B');
      expect(choices.filter((id) => id === 'C' || id === 'D')).toHaveLength(1);
      expect(choices).toHaveLength(3);
    }
  });

  it('offers nothing to pick when there is only one distinct name', () => {
    expect(recallChoices('A', catalog([['A', '[sample label] only']]), seeded())).toEqual([]);
    expect(recallChoices('A', catalog([['A', '[sample label] x'], ['B', '[sample label] X']]), seeded())).toEqual([]);
  });

  it('stays in range even if the random source returns exactly 1', () => {
    const choices = recallChoices('S1', SAMPLE, () => 1);
    expect(choices).toHaveLength(RECALL_CHOICES);
    expect(choices.every((id) => SAMPLE.ids.includes(id))).toBe(true);
  });
});

describe('name it: typed answers', () => {
  it('accepts the official name whatever the capitals, accents, spacing or punctuation', () => {
    expect(typedMatches('[Sample Label]  ONE', '[sample label] one')).toBe(true);
    expect(typedMatches('sample label one', '[sample label] one')).toBe(true);
    expect(typedMatches('sámple-label one.', '[sample label] one')).toBe(true);
  });

  it('rejects anything else, a part of the name and an empty answer included', () => {
    expect(typedMatches('sample label', '[sample label] one')).toBe(false);
    expect(typedMatches('sample label one two', '[sample label] one')).toBe(false);
    expect(typedMatches('', '[sample label] one')).toBe(false);
    expect(typedMatches('   ', '[sample label] one')).toBe(false);
    expect(typedMatches('...', '...')).toBe(false);
  });
});

describe('name it: a round', () => {
  const pool = ['S1', 'S2', 'S3'];

  it('asks only about structures in the pool, each once, then ends', () => {
    const random = seeded(7);
    let state = startRecall(pool, SAMPLE, random);
    const asked: string[] = [];
    while (state.target) {
      asked.push(state.target);
      expect(state.choices).toContain(state.target);
      expect(state.feedback).toBeNull();
      state = nextRecall(state, SAMPLE, random);
    }
    expect([...asked].sort()).toEqual(pool);
    expect(state.choices).toEqual([]);
    expect(state.asked).toHaveLength(pool.length);
    // "next" after the end changes nothing more.
    expect(nextRecall(state, SAMPLE, random).target).toBeNull();
  });

  it('drops repeats from the pool and copes with an empty one', () => {
    expect(startRecall(['S1', 'S1', 'S2'], SAMPLE, seeded()).pool).toEqual(['S1', 'S2']);
    const empty = startRecall([], SAMPLE, seeded());
    expect(empty.target).toBeNull();
    expect(empty.choices).toEqual([]);
    expect(revealRecall(empty)).toBe(empty);
    expect(answerRecallTyped(empty, 'anything', SAMPLE)).toBe(empty);
  });

  it('marks a right pick and then ignores further answers', () => {
    const state = startRecall(pool, SAMPLE, seeded(3));
    const right = answerRecallChoice(state, state.target!, SAMPLE);
    expect(right.feedback).toEqual({ kind: 'right', how: 'picked' });
    expect(recallSettled(right)).toBe(true);
    const other = right.choices.find((id) => id !== right.target)!;
    expect(answerRecallChoice(right, other, SAMPLE)).toBe(right);
    expect(answerRecallTyped(right, 'something', SAMPLE)).toBe(right);
  });

  it('names a wrong pick in words and lets the student try again', () => {
    const state = startRecall(pool, SAMPLE, seeded(3));
    const other = state.choices.find((id) => id !== state.target)!;
    const wrong = answerRecallChoice(state, other, SAMPLE);
    expect(wrong.feedback).toEqual({ kind: 'wrong', how: 'picked', answer: SAMPLE.names.get(other) });
    expect(recallSettled(wrong)).toBe(false);
    expect(answerRecallChoice(wrong, wrong.target!, SAMPLE).feedback).toEqual({ kind: 'right', how: 'picked' });
  });

  it('ignores a pick that was never offered', () => {
    const state = startRecall(pool, SAMPLE, seeded(3));
    expect(answerRecallChoice(state, 'NOT-OFFERED', SAMPLE)).toBe(state);
  });

  it('checks a typed answer against the official name only', () => {
    const state = startRecall(pool, SAMPLE, seeded(3));
    const official = SAMPLE.names.get(state.target!)!;
    expect(answerRecallTyped(state, official.toUpperCase(), SAMPLE).feedback).toEqual({ kind: 'right', how: 'typed' });
    expect(answerRecallTyped(state, '  not it  ', SAMPLE).feedback).toEqual({ kind: 'wrong', how: 'typed', answer: 'not it' });
    expect(answerRecallTyped(state, '   ', SAMPLE)).toBe(state);
  });

  it('keeps an echoed wrong answer short', () => {
    const state = startRecall(pool, SAMPLE, seeded(3));
    const wrong = answerRecallTyped(state, 'x'.repeat(500), SAMPLE);
    expect(wrong.feedback?.kind).toBe('wrong');
    expect(wrong.feedback && 'answer' in wrong.feedback ? wrong.feedback.answer.length : 0).toBe(200);
  });

  it('"show me" settles the question without calling it right', () => {
    const state = startRecall(pool, SAMPLE, seeded(3));
    const shown = revealRecall(state);
    expect(shown.feedback).toEqual({ kind: 'shown' });
    expect(recallSettled(shown)).toBe(true);
    expect(answerRecallChoice(shown, shown.target!, SAMPLE)).toBe(shown);
  });

  it('falls back to the id when a structure has no name', () => {
    const bare: RecallCatalog = { ids: ['X1', 'X2'], names: new Map(), groups: new Map() };
    const state = startRecall(['X1'], bare, seeded());
    expect(state.choices.sort()).toEqual(['X1', 'X2']);
    expect(answerRecallTyped(state, 'x1', bare).feedback).toEqual({ kind: 'right', how: 'typed' });
  });
});
