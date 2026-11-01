import { describe, expect, it } from 'vitest';
import { cellLabel, clearTrace, foundWord, isDone, parsePuzzle, shareLine, startSuture, stitch, tapCell, traceInWords, wordsLeft, type Cell, type SuturePuzzle, type SutureState } from '../../src/islands/suture';

const puzzle: SuturePuzzle = {
  id: 'everyday', sample: true, grid: ['CATX', 'DOGY', 'SUNZ'],
  words: [
    { cue: 'a purring pet', answer: 'CAT', path: [[0, 0], [0, 1], [0, 2]] },
    { cue: 'a barking pet', answer: 'DOG', path: [[1, 0], [1, 1], [1, 2]] },
    { cue: 'the daytime star', answer: 'SUN', path: [[2, 0], [2, 1], [2, 2]] },
  ],
};
const copy = () => structuredClone(puzzle);
const trace = (state: SutureState, cells: Cell[]) => cells.reduce((next, cell) => tapCell(next, puzzle, cell), state);

describe('word-path validation', () => {
  it('parses a clean puzzle with filler cells, and copies its arrays', () => {
    const input = copy();
    const parsed = parsePuzzle(input);
    expect(parsed).toEqual(puzzle);
    parsed.words[0]!.path[0]![0] = 1;
    parsed.grid[0] = 'XXXX';
    expect(input).toEqual(puzzle);
  });
  it.each([null, [], {}, { ...puzzle, sample: 'yes' }, { ...puzzle, id: '' }])('rejects missing metadata %j', (data) => {
    expect(() => parsePuzzle(data)).toThrow();
  });
  it('rejects bad grid sizes, uneven rows and nonletters', () => {
    expect(() => parsePuzzle({ ...puzzle, grid: ['CAT', 'DOG'] })).toThrow(/rows/);
    expect(() => parsePuzzle({ ...puzzle, grid: Array(8).fill('CAT') })).toThrow(/rows/);
    expect(() => parsePuzzle({ ...puzzle, grid: ['CATX', 'DOG', 'SUNZ'] })).toThrow(/equal/);
    expect(() => parsePuzzle({ ...puzzle, grid: ['C@TX', 'DOGY', 'SUNZ'] })).toThrow(/uppercase/);
    expect(() => parsePuzzle({ ...puzzle, grid: ['catx', 'DOGY', 'SUNZ'] })).toThrow(/uppercase/);
  });
  it('requires three to six words with cues and three to eight letters', () => {
    expect(() => parsePuzzle({ ...puzzle, words: puzzle.words.slice(0, 2) })).toThrow(/3 to 6/);
    expect(() => parsePuzzle({ ...puzzle, words: Array(7).fill(puzzle.words[0]) })).toThrow(/3 to 6/);
    const bad = copy(); bad.words[0]!.answer = 'AT';
    expect(() => parsePuzzle(bad)).toThrow(/3 to 8/);
    bad.words[0]!.answer = 'ABCDEFGHI';
    expect(() => parsePuzzle(bad)).toThrow(/3 to 8/);
    bad.words[0]!.cue = '';
    expect(() => parsePuzzle(bad)).toThrow(/cue/);
  });
  it('rejects diagonal, repeated, off-grid and jumping cells', () => {
    const bad = copy(); bad.words[0]!.path = [[0, 0], [1, 1], [0, 2]];
    expect(() => parsePuzzle(bad)).toThrow(/diagonally/);
    bad.words[0]!.path = [[0, 0], [0, 1], [0, 0]];
    expect(() => parsePuzzle(bad)).toThrow(/repeats/);
    bad.words[0]!.path = [[-1, 0], [0, 1], [0, 2]];
    expect(() => parsePuzzle(bad)).toThrow(/leaves/);
    bad.words[0]!.path = [[0, 0], [0, 2], [0, 3]];
    expect(() => parsePuzzle(bad)).toThrow(/steps/);
    bad.words[0]!.path = [[0.5, 0], [0, 1], [0, 2]];
    expect(() => parsePuzzle(bad)).toThrow(/whole-number/);
  });
  it('rejects wrong path length, a misspelled answer and shared cells', () => {
    const bad = copy(); bad.words[0]!.path.pop();
    expect(() => parsePuzzle(bad)).toThrow(/one cell/);
    bad.words[0] = { ...puzzle.words[0]!, answer: 'CAR' };
    expect(() => parsePuzzle(bad)).toThrow(/spell/);
    bad.words[0] = structuredClone(puzzle.words[0]!);
    bad.words[1] = structuredClone(puzzle.words[0]!);
    expect(() => parsePuzzle(bad)).toThrow(/share/);
  });
  it('accepts a path that turns through orthogonally touching cells', () => {
    const turning = parsePuzzle({
      id: 'turning', sample: true, grid: ['CATXX', 'XRXXX', 'DOGXX', 'XXXXX', 'SUNXX'],
      words: [
        { cue: 'a road vehicle', answer: 'CAR', path: [[0, 0], [0, 1], [1, 1]] },
        { cue: 'a pet', answer: 'DOG', path: [[2, 0], [2, 1], [2, 2]] },
        { cue: 'the daytime star', answer: 'SUN', path: [[4, 0], [4, 1], [4, 2]] },
      ],
    });
    let state = startSuture(turning);
    for (const cell of turning.words[0]!.path) state = tapCell(state, turning, cell);
    expect(stitch(state, turning)).toMatchObject({ found: true, word: 1 });
  });
});

describe('tracing and stitching', () => {
  it('adds touching cells, ignores non-touching/repeated cells, and removes the last one', () => {
    const start = startSuture(puzzle);
    let state = tapCell(start, puzzle, [0, 0]);
    expect(start.trace).toEqual([]);
    expect(tapCell(state, puzzle, [0, 2])).toBe(state);
    expect(tapCell(state, puzzle, [1, 1])).toBe(state);
    expect(tapCell(state, puzzle, [-1, 0])).toBe(state);
    state = tapCell(state, puzzle, [0, 1]);
    expect(tapCell(state, puzzle, [0, 0])).toBe(state);
    state = tapCell(state, puzzle, [0, 1]);
    expect(state.trace).toEqual([[0, 0]]);
    expect(clearTrace(state).trace).toEqual([]);
  });
  it('finds exact paths in either direction, and locks found cells', () => {
    let state = trace(startSuture(puzzle), puzzle.words[0]!.path);
    const first = stitch(state, puzzle);
    expect(first).toMatchObject({ found: true, word: 1 });
    expect(first.state.trace).toEqual([]);
    expect(first.state.found).toEqual([0]);
    expect(tapCell(first.state, puzzle, [0, 0])).toBe(first.state);
    state = trace(first.state, [...puzzle.words[1]!.path].reverse());
    expect(stitch(state, puzzle)).toMatchObject({ found: true, word: 2, state: { found: [0, 1] } });
  });
  it('clears and counts a loose stitch, without losing found words or ending the puzzle', () => {
    let state = stitch(trace(startSuture(puzzle), puzzle.words[0]!.path), puzzle).state;
    state = trace(state, [[1, 3], [2, 3]]);
    const loose = stitch(state, puzzle);
    expect(loose.found).toBe(false);
    expect(loose.state).toMatchObject({ trace: [], found: [0], looseStitches: 1 });
    expect(isDone(loose.state)).toBe(false);
    expect(stitch(loose.state, puzzle).state).toBe(loose.state);
  });
  it('finishes only after all words, with no game over from loose stitches', () => {
    let state = startSuture(puzzle);
    for (let i = 0; i < 10; i++) state = stitch(tapCell(state, puzzle, [0, 3]), puzzle).state;
    expect(isDone(state)).toBe(false);
    expect(wordsLeft(state)).toBe(3);
    for (const word of puzzle.words) state = stitch(trace(state, word.path), puzzle).state;
    expect(isDone(state)).toBe(true);
    expect(wordsLeft(state)).toBe(0);
    expect(tapCell(state, puzzle, [0, 3])).toBe(state);
    expect(stitch(state, puzzle).state).toBe(state);
  });
  it('labels coordinates, letters, trace order and found-word numbers in words', () => {
    let state = trace(startSuture(puzzle), [[0, 0], [0, 1]]);
    expect(cellLabel(state, puzzle, [0, 1])).toBe('row 1, column 2, letter A, trace step 2');
    expect(traceInWords(state, puzzle)).toBe('trace: c, a.');
    state = stitch(tapCell(state, puzzle, [0, 2]), puzzle).state;
    expect(cellLabel(state, puzzle, [0, 1])).toBe('row 1, column 2, letter A, in word 1');
    expect(foundWord(state, puzzle, [0, 1])).toBe(1);
    expect(foundWord(state, puzzle, [1, 0])).toBeUndefined();
    expect(traceInWords(state, puzzle)).toBe('no letters traced.');
  });
  it('shares a configured name in one plain line, never a grid or squares', () => {
    let state = startSuture(puzzle);
    state = stitch(tapCell(state, puzzle, [0, 3]), puzzle).state;
    for (const word of puzzle.words) state = stitch(trace(state, word.path), puzzle).state;
    const line = shareLine(state, 'SUN\n1 NOV', 'sample word path');
    expect(line).toBe('cueory sample word path, sun 1 nov: stitched 3 of 3 words with 1 loose stitch.');
    expect(line).not.toMatch(/[\n\r\u25a0-\u25ff]|🟩|🟨/u);
    expect(shareLine(startSuture(puzzle), 'sun 1 nov', 'another name')).toContain('with 0 loose stitches.');
  });
});
