import { describe, expect, it } from 'vitest';
import {
  cellLabel, clearPick, foundWord, isDone, moveCursor, outcomeInWords, parsePuzzle, pathBetween, pick, selection, shareLine,
  startSuture, wordsLeft, type Cell, type SuturePuzzle, type SutureState,
} from '../../src/islands/suture';

// A small themed word search: CAT left to right, DOG right to left, SUN top to bottom.
const small: SuturePuzzle = {
  id: 'small', sample: true, theme: 'everyday things',
  grid: ['CATS', 'GODU', 'XYZN', 'QRST'],
  words: [
    { answer: 'CAT', path: [[0, 0], [0, 1], [0, 2]] },
    { answer: 'DOG', path: [[1, 2], [1, 1], [1, 0]] },
    { answer: 'SUN', path: [[0, 3], [1, 3], [2, 3]] },
  ],
};
const copy = () => structuredClone(small);
const pickAll = (state: SutureState, cells: Cell[]) =>
  cells.reduce((current, cell) => pick(current, small, cell).state, state);

describe('pathBetween', () => {
  it('runs left, right, up and down, both ends included', () => {
    expect(pathBetween([0, 0], [0, 2])).toEqual([[0, 0], [0, 1], [0, 2]]);
    expect(pathBetween([0, 2], [0, 0])).toEqual([[0, 2], [0, 1], [0, 0]]);
    expect(pathBetween([0, 0], [2, 0])).toEqual([[0, 0], [1, 0], [2, 0]]);
    expect(pathBetween([2, 1], [0, 1])).toEqual([[2, 1], [1, 1], [0, 1]]);
    expect(pathBetween([1, 1], [1, 1])).toEqual([[1, 1]]);
  });
  it('has no diagonal or bent lines', () => {
    expect(pathBetween([0, 0], [2, 2])).toBeNull();
    expect(pathBetween([0, 0], [2, 1])).toBeNull();
  });
});

describe('parsePuzzle', () => {
  it('accepts the new shape: a theme, words without cues, and copies its arrays', () => {
    const input = copy();
    const parsed = parsePuzzle(input);
    expect(parsed.theme).toBe('everyday things');
    expect(parsed.words.map((word) => word.answer)).toEqual(['CAT', 'DOG', 'SUN']);
    expect(parsed.words[0]).not.toHaveProperty('cue');
    parsed.grid[0] = 'XXXX';
    parsed.words[0]!.path[0]![0] = 3;
    expect(input.grid[0]).toBe('CATS');
    expect(input.words[0]!.path[0]).toEqual([0, 0]);
  });
  it('still accepts an older file: cues on every word and no theme', () => {
    const { theme: _theme, ...old } = copy();
    const parsed = parsePuzzle({ ...old, words: old.words.map((word) => ({ ...word, cue: '  a pet  ' })) });
    expect(parsed).not.toHaveProperty('theme');
    expect(parsed.words[0]!.cue).toBe('a pet');
  });
  it('accepts a full 11 by 11 grid', () => {
    const grid = ['CATSXXXXXXX', 'GODUXXXXXXX', 'XYZNXXXXXXX', ...Array.from({ length: 8 }, () => 'XXXXXXXXXXX')];
    expect(parsePuzzle({ ...copy(), grid }).grid).toHaveLength(11);
    expect(() => parsePuzzle({ ...copy(), grid: [...grid, 'XXXXXXXXXXX'] })).toThrow('3 to 11 rows');
    expect(() => parsePuzzle({ ...copy(), grid: grid.map((row) => `${row}X`) })).toThrow('3 to 11 letters');
  });
  it('trims the theme and refuses one over 60 characters or blank', () => {
    expect(parsePuzzle({ ...copy(), theme: '  study break  ' }).theme).toBe('study break');
    expect(parsePuzzle({ ...copy(), theme: 'a'.repeat(60) }).theme).toHaveLength(60);
    expect(() => parsePuzzle({ ...copy(), theme: 'a'.repeat(61) })).toThrow('at most 60 characters');
    expect(() => parsePuzzle({ ...copy(), theme: '   ' })).toThrow('theme');
    expect(() => parsePuzzle({ ...copy(), theme: 7 })).toThrow('theme');
  });
  it.each([null, [], {}, { ...copy(), sample: 'yes' }, { ...copy(), id: '' }])('refuses missing details %j', (data) => {
    expect(() => parsePuzzle(data)).toThrow();
  });
  it('refuses a word that is not in the grid where its path says', () => {
    const data = copy();
    data.words[0] = { answer: 'COT', path: [[0, 0], [0, 1], [0, 2]] };
    expect(() => parsePuzzle(data)).toThrow('does not spell');
  });
  it('refuses a path that leaves the grid or has the wrong length', () => {
    const outside = copy();
    outside.words[0] = { answer: 'CAT', path: [[0, 2], [0, 3], [0, 4]] };
    expect(() => parsePuzzle(outside)).toThrow('leaves the grid');
    const short = copy();
    short.words[0] = { answer: 'CAT', path: [[0, 0], [0, 1]] };
    expect(() => parsePuzzle(short)).toThrow('one cell per letter');
  });
  it('refuses diagonal, bent and gapped paths', () => {
    const diagonal = { ...copy(), grid: ['CATS', 'GADU', 'XYTN', 'QRST'] };
    diagonal.words = [{ answer: 'CAT', path: [[0, 0], [1, 1], [2, 2]] }, ...copy().words.slice(1)];
    expect(() => parsePuzzle(diagonal)).toThrow('straight line');
    const bent = { ...copy(), grid: ['CATS', 'XODU', 'XYZN', 'QRST'] };
    bent.words = [{ answer: 'CAT', path: [[0, 0], [0, 1], [0, 2]] }, { answer: 'DOX', path: [[1, 2], [1, 1], [1, 0]] }, { answer: 'SUN', path: [[0, 3], [1, 3], [2, 3]] }];
    expect(parsePuzzle(bent).words).toHaveLength(3);
    bent.words[1] = { answer: 'DOY', path: [[1, 2], [1, 1], [2, 1]] };
    expect(() => parsePuzzle(bent)).toThrow('straight line');
    const gapped = copy();
    gapped.words[0] = { answer: 'CTS', path: [[0, 0], [0, 2], [0, 3]] };
    expect(() => parsePuzzle(gapped)).toThrow('straight line');
  });
  it('refuses two words on one letter, bad letters and bad word counts', () => {
    const shared = copy();
    shared.words[2] = { answer: 'TSU', path: [[0, 2], [0, 3], [1, 3]] };
    expect(() => parsePuzzle(shared)).toThrow();
    expect(() => parsePuzzle({ ...copy(), grid: ['cats', 'GODU', 'XYZN', 'QRST'] })).toThrow('capital letters');
    expect(() => parsePuzzle({ ...copy(), grid: ['CATS', 'GOD', 'XYZN', 'QRST'] })).toThrow('equal lengths');
    expect(() => parsePuzzle({ ...copy(), words: copy().words.slice(0, 2) })).toThrow('3 to 20 words');
    expect(() => parsePuzzle({ ...copy(), words: [...copy().words, { answer: 'AT', path: [[0, 1], [0, 2]] }] })).toThrow();
  });
  it('refuses a blank or very long cue', () => {
    const blank = copy();
    blank.words[0] = { ...blank.words[0]!, cue: '  ' };
    expect(() => parsePuzzle(blank)).toThrow('cue');
    const long = copy();
    long.words[0] = { ...long.words[0]!, cue: 'a'.repeat(121) };
    expect(() => parsePuzzle(long)).toThrow('cue');
  });
});

describe('picking the first and last letter', () => {
  it('finds a word from its first letter to its last, or the other way round', () => {
    let state = startSuture(small);
    const first = pick(state, small, [0, 0]);
    expect(first.outcome).toEqual({ kind: 'first' });
    expect(first.state.anchor).toEqual([0, 0]);
    const last = pick(first.state, small, [0, 2]);
    expect(last.outcome).toEqual({ kind: 'found', word: 1 });
    expect(last.state.found).toEqual([0]);
    expect(last.state.anchor).toBeNull();
    state = pickAll(last.state, [[1, 0], [1, 2]]);
    expect(state.found).toEqual([0, 1]);
    expect(wordsLeft(state)).toBe(1);
  });
  it('counts a wrong pick, straight or diagonal, as a miss and clears the pick', () => {
    const start = startSuture(small);
    const straight = pick(pick(start, small, [3, 0]).state, small, [3, 3]);
    expect(straight.outcome).toEqual({ kind: 'miss', straight: true });
    expect(straight.state.misses).toBe(1);
    expect(straight.state.anchor).toBeNull();
    const diagonal = pick(pick(straight.state, small, [0, 0]).state, small, [2, 2]);
    expect(diagonal.outcome).toEqual({ kind: 'miss', straight: false });
    expect(diagonal.state.misses).toBe(2);
    // Part of a word is not the word.
    expect(pick(pick(start, small, [0, 0]).state, small, [0, 1]).outcome.kind).toBe('miss');
  });
  it('clears the pick when the first letter is picked again, and through clearPick', () => {
    const first = pick(startSuture(small), small, [0, 0]).state;
    const again = pick(first, small, [0, 0]);
    expect(again.outcome).toEqual({ kind: 'cleared' });
    expect(again.state.anchor).toBeNull();
    expect(clearPick(first).anchor).toBeNull();
    const idle = startSuture(small);
    expect(clearPick(idle)).toBe(idle);
  });
  it('ignores a found letter as a first pick, a cell off the grid, and anything once done', () => {
    const found = pickAll(startSuture(small), [[0, 0], [0, 2]]);
    expect(pick(found, small, [0, 1])).toEqual({ state: found, outcome: { kind: 'ignored' } });
    expect(pick(found, small, [9, 9]).outcome.kind).toBe('ignored');
    expect(pick(found, small, [0.5, 1] as Cell).outcome.kind).toBe('ignored');
    const done = pickAll(found, [[1, 0], [1, 2], [2, 3], [0, 3]]);
    expect(isDone(done)).toBe(true);
    expect(pick(done, small, [3, 0])).toEqual({ state: done, outcome: { kind: 'ignored' } });
  });
  it('never finds a word twice', () => {
    const once = pickAll(startSuture(small), [[0, 0], [0, 2]]);
    const twice = pick(pick(once, small, [3, 0]).state, small, [3, 0]);
    expect(twice.state.found).toEqual([0]);
  });
});

describe('highlight as the student goes', () => {
  it('highlights the straight line from the first letter to the cursor', () => {
    const first = pick(startSuture(small), small, [0, 0]).state;
    expect(selection(first)).toEqual([[0, 0]]);
    const moved = moveCursor(first, small, [0, 2]);
    expect(selection(moved)).toEqual([[0, 0], [0, 1], [0, 2]]);
    expect(selection(moveCursor(first, small, [2, 2]))).toEqual([[0, 0]]);
  });
  it('does nothing without a first letter, off the grid, or on the same cell', () => {
    const idle = startSuture(small);
    expect(moveCursor(idle, small, [1, 1])).toBe(idle);
    expect(selection(idle)).toEqual([]);
    const first = pick(idle, small, [0, 0]).state;
    expect(moveCursor(first, small, [7, 7])).toBe(first);
    expect(moveCursor(first, small, [0, 0])).toBe(first);
  });
});

describe('words for screen readers and the live line', () => {
  it('labels each letter with its place, its letter and its state', () => {
    const start = startSuture(small);
    expect(cellLabel(start, small, [0, 0])).toBe('row 1, column 1, C');
    const first = pick(start, small, [0, 0]).state;
    expect(cellLabel(first, small, [0, 0])).toBe('row 1, column 1, C, first letter picked');
    const found = pick(first, small, [0, 2]).state;
    expect(cellLabel(found, small, [0, 1])).toBe('row 1, column 2, A, found: cat');
    expect(foundWord(found, small, [0, 1])).toBe(1);
    expect(foundWord(found, small, [1, 1])).toBeUndefined();
  });
  it('says each outcome in words, never by color alone', () => {
    const first = pick(startSuture(small), small, [0, 0]);
    expect(outcomeInWords(first.state, small, first.outcome)).toBe('first letter: c. now pick the last letter.');
    const found = pick(first.state, small, [0, 2]);
    expect(outcomeInWords(found.state, small, found.outcome)).toBe('found: cat, 1 of 3.');
    const miss = pick(pick(found.state, small, [3, 0]).state, small, [3, 3]);
    expect(outcomeInWords(miss.state, small, miss.outcome)).toBe('not a word in this puzzle.');
    const diagonal = pick(pick(found.state, small, [3, 0]).state, small, [2, 1]);
    expect(outcomeInWords(diagonal.state, small, diagonal.outcome)).toBe('not a word in this puzzle. words run up, down, left or right.');
    expect(outcomeInWords(first.state, small, { kind: 'cleared' })).toBe('pick cleared.');
    const almost = pickAll(found.state, [[1, 0], [1, 2], [2, 3]]);
    const last = pick(almost, small, [0, 3]);
    expect(outcomeInWords(last.state, small, last.outcome)).toBe('found: sun, 3 of 3. all words found.');
  });
  it('shares the result as one plain sentence', () => {
    const done = pickAll(startSuture(small), [[3, 0], [3, 3], [0, 0], [0, 2], [1, 0], [1, 2], [0, 3], [2, 3]]);
    expect(shareLine(done, 'Sun 1 Nov', 'Word  Path')).toBe('cueory word path, sun 1 nov: found 3 of 3 words with 1 wrong pick.');
    expect(shareLine(startSuture(small), 'sun 1 nov', 'word path')).toBe('cueory word path, sun 1 nov: found 0 of 3 words with 0 wrong picks.');
  });
});
