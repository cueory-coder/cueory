import { describe, expect, it } from 'vitest';
import {
  answerCurrent, checkAnswer, currentIndex, editDistance, nextItem, normalizeAnswer, parseItems, sentenceParts,
  showHint, startFillIn, summary, type FillInItem,
} from '../../src/islands/fillin';

const items: FillInItem[] = [
  { id: 'bees', sentence: 'Bees make [[honey]] from flowers.' },
  { id: 'sky', sentence: 'The sky looks [[blue]] today.' },
  { id: 'birds', sentence: 'Many birds build a [[nest]].' },
];

describe('fill-in items', () => {
  it('validates, copies and splits a list of items', () => {
    const input = structuredClone(items);
    const parsed = parseItems(input);
    input[0]!.sentence = 'changed';
    expect(parsed).toEqual(items);
    expect(sentenceParts(parsed[0]!.sentence)).toEqual({
      before: 'Bees make ', answer: 'honey', after: ' from flowers.',
    });
  });

  it.each([
    ['Bees make honey.', /exactly one answer/],
    ['Bees make [[honey]] and [[wax]].', /exactly one answer/],
    ['Bees make [[]].', /cannot be empty/],
    ['Bees make [[   ]].', /cannot be empty/],
    ['Bees make ]]honey[[.', /exactly one answer/],
  ])('rejects an invalid sentence: %s', (sentence, message) => {
    expect(() => parseItems([{ id: 'sample', sentence }])).toThrow(message);
  });

  it('rejects repeated ids and malformed lists', () => {
    expect(() => parseItems([items[0], items[0]])).toThrow(/repeated/);
    expect(() => parseItems(null)).toThrow(/list/);
    expect(() => parseItems([{ id: '', sentence: 'A [[word]].' }])).toThrow(/id and a sentence/);
    expect(() => parseItems([{ id: 'one', sentence: 7 }])).toThrow(/id and a sentence/);
  });
});

describe('checking an answer', () => {
  it('ignores case, repeated whitespace and punctuation at the end', () => {
    expect(normalizeAnswer('  Honey!!! ')).toBe('honey');
    expect(checkAnswer(' NEW   YORK. ', 'new york')).toBe('right');
    expect(checkAnswer('honey', 'Honey!')).toBe('right');
  });

  it('calls one insertion, deletion, substitution or adjacent swap close', () => {
    for (const typed of ['honeys', 'hony', 'boney', 'hoeny']) {
      expect(checkAnswer(typed, 'honey')).toBe('close');
    }
    expect(editDistance('hoeny', 'honey')).toBe(1);
  });

  it('calls larger differences wrong and never calls a short answer close', () => {
    expect(checkAnswer('moneyed', 'honey')).toBe('wrong');
    expect(checkAnswer('blud', 'blue')).toBe('wrong');
    expect(checkAnswer('', 'honey')).toBe('wrong');
  });
});

describe('fill-in rounds', () => {
  it('brings wrong and hinted items back, then finishes when all are recalled without help', () => {
    let state = startFillIn(items);
    expect(currentIndex(state)).toBe(0);
    expect(state.roundNumber).toBe(1);

    state = showHint(state);
    state = answerCurrent(state, items, 'honey');
    expect(state.result).toBe('right');
    expect(state.learning).toEqual([0]);
    state = nextItem(state);

    state = answerCurrent(state, items, 'green');
    expect(state.result).toBe('wrong');
    expect(state.learning).toEqual([0, 1]);
    state = nextItem(state);

    state = nextItem(answerCurrent(state, items, 'nest'));
    expect(state.round).toEqual([0, 1]);
    expect(state.roundNumber).toBe(2);
    expect(state.learning).toEqual([]);

    state = nextItem(answerCurrent(state, items, 'honey'));
    state = nextItem(answerCurrent(state, items, 'blue'));
    expect(state.done).toBe(true);
    expect(summary(state)).toBe('all 3 recalled in 2 rounds.');
  });

  it('keeps a close answer on the same item for another try', () => {
    let state = answerCurrent(startFillIn(items), items, 'hoeny');
    expect(state.result).toBe('close');
    expect(nextItem(state)).toEqual(state);
    state = answerCurrent(state, items, 'honey');
    expect(state.result).toBe('right');
    expect(state.learning).toEqual([]);
  });

  it('does not hint or answer a finished item twice', () => {
    let state = answerCurrent(startFillIn(items), items, 'honey');
    expect(showHint(state)).toEqual(state);
    expect(answerCurrent(state, items, 'wrong')).toEqual(state);
    expect(nextItem({ ...state, result: 'close' })).toEqual({ ...state, result: 'close' });
  });

  it('handles an empty session', () => {
    const state = startFillIn([]);
    expect(state.done).toBe(true);
    expect(currentIndex(state)).toBeUndefined();
    expect(summary(state)).toBe('all 0 recalled in 0 rounds.');
  });
});
