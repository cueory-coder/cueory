import { describe, expect, it } from 'vitest';
import { cellLabel, clearTrace, foundWord, isDone, parsePuzzle, pathBetween, shareLine, startSuture, stitch, tapCell, traceInWords, wordsLeft, type Cell, type SuturePuzzle, type SutureState } from '../../src/islands/suture';

// Straight-line puzzle (word search format).
const puzzle: SuturePuzzle = {
  id: 'everyday', sample: true, theme: 'study break',
  grid: ['WATERZ', 'ZZZZZZ', 'STRETCHZZ'.slice(0, 6), 'ZZZZZZ', 'WALKZZ', 'MUSICZ'],
  words: [
    { answer: 'WATER',   path: [[0,0],[0,1],[0,2],[0,3],[0,4]] },
    { answer: 'WALK',    path: [[4,0],[4,1],[4,2],[4,3]] },
    { answer: 'MUSIC',   path: [[5,0],[5,1],[5,2],[5,3],[5,4]] },
  ],
};

// Simpler 4-row puzzle for basic state tests.
const small: SuturePuzzle = {
  id: 'small', sample: true,
  grid: ['CATX', 'DOGY', 'SUNZ', 'ZZZZ'],
  words: [
    { answer: 'CAT', path: [[0,0],[0,1],[0,2]] },
    { answer: 'DOG', path: [[1,0],[1,1],[1,2]] },
    { answer: 'SUN', path: [[2,0],[2,1],[2,2]] },
  ],
};
const copy = () => structuredClone(small);

describe('pathBetween', () => {
  it('returns a horizontal path left to right', () => {
    expect(pathBetween([0, 0], [0, 2])).toEqual([[0,0],[0,1],[0,2]]);
  });
  it('returns a horizontal path right to left', () => {
    expect(pathBetween([0, 2], [0, 0])).toEqual([[0,2],[0,1],[0,0]]);
  });
  it('returns a vertical path top to bottom', () => {
    expect(pathBetween([0, 0], [2, 0])).toEqual([[0,0],[1,0],[2,0]]);
  });
  it('returns null for diagonal', () => {
    expect(pathBetween([0, 0], [2, 1])).toBeNull();
    expect(pathBetween([1, 1], [3, 3])).toBeNull();
  });
  it('returns a single-cell path when from === to', () => {
    expect(pathBetween([1, 1], [1, 1])).toEqual([[1,1]]);
  });
});

describe('word-path validation', () => {
  it('parses a clean puzzle with theme and no cues, and copies its arrays', () => {
    const input = copy();
    const parsed = parsePuzzle(input);
    expect(parsed.id).toBe('small');
    expect(parsed.theme).toBeUndefined();
    parsed.grid[0] = 'XXXX';
    expect(input.grid[0]).toBe('CATX');
  });
  it('parses a puzzle with optional theme', () => {
    const withTheme = parsePuzzle({ ...copy(), theme: 'study break' });
    expect(withTheme.theme).toBe('study break');
  });
  it.each([null, [], {}, { ...copy(), sample: 'yes' }, { ...copy(), id: '' }])('rejects missing metadata %j', (data) => {
    expect(() => parsePuzzle(data)).toThrow();
  });
  it('rejects a theme over 60 characters', () => {
    expect(() => parsePuzzle({ ...copy(), theme: 'a'.repeat(61) })).toThrow(/60 characters/);
  });
  it('rejects bad grid sizes, uneven rows and nonletters', () => {
    expect(() => parsePuzzle({ ...copy(), grid: ['CAT', 'DOG'] })).toThrow(/rows/);
    expect(() => parsePuzzle({ ...copy(), grid: Array(12).fill('CATR') })).toThrow(/rows/);
    expect(() => parsePuzzle({ ...copy(), grid: ['CATX', 'DOG', 'SUNZ', 'ZZZZ'] })).toThrow(/equal/);
    expect(() => parsePuzzle({ ...copy(), grid: ['C@TX', 'DOGY', 'SUNZ', 'ZZZZ'] })).toThrow(/uppercase/);
  });
  it('accepts grids up to 11 × 11', () => {
    const big = parsePuzzle({
      id: 'big', sample: false,
      grid: Array(11).fill('ABCDEFGHIJK'),
      words: [
        { answer: 'ABCDEFGHIJK', path: Array.from({ length: 11 }, (_, i) => [0, i]) },
        { answer: 'ABC', path: [[1,0],[1,1],[1,2]] },
        { answer: 'DEF', path: [[2,3],[2,4],[2,5]] },
      ],
    });
    expect(big.grid.length).toBe(11);
  });
  it('rejects turning (non-straight) paths', () => {
    const bad = copy();
    // L-shaped path: down then right — not a straight line
    bad.words[0] = { answer: 'CAT', path: [[0,0],[1,0],[1,1]] };
    expect(() => parsePuzzle(bad)).toThrow(/straight line/);
  });
  it('rejects diagonal path cells', () => {
    const bad = copy();
    bad.words[0] = { answer: 'CAT', path: [[0,0],[1,1],[2,2]] };
    expect(() => parsePuzzle(bad)).toThrow(/diagonally/);
  });
  it('requires 3 to 20 words with 3 to 11 letters', () => {
    expect(() => parsePuzzle({ ...copy(), words: small.words.slice(0, 2) })).toThrow(/3 to 20/);
    const bad = copy(); bad.words[0] = { ...bad.words[0]!, answer: 'AT', path: [[0,0],[0,1]] };
    expect(() => parsePuzzle(bad)).toThrow(/3 to 11/);
  });
  it('accepts optional cue when present and rejects empty cue', () => {
    const withCue = parsePuzzle({ ...copy(), words: copy().words.map((w) => ({ ...w, cue: 'a hint' })) });
    expect(withCue.words[0]!.cue).toBe('a hint');
    const bad = copy(); bad.words[0] = { ...bad.words[0]!, cue: '' };
    expect(() => parsePuzzle(bad)).toThrow(/cue/);
  });
  it('rejects a word not in the grid or off its path', () => {
    const bad = copy();
    bad.words[0] = { answer: 'CAT', path: [[0,0],[0,1],[0,3]] };
    expect(() => parsePuzzle(bad)).toThrow();
  });
});

describe('tapCell', () => {
  it('sets anchor on first tap', () => {
    const s = startSuture(small);
    const next = tapCell(s, small, [0, 0]);
    expect(next.anchor).toEqual([0, 0]);
    expect(next.cursor).toEqual([0, 0]);
  });
  it('updates cursor on second tap', () => {
    let s = tapCell(startSuture(small), small, [0, 0]);
    s = tapCell(s, small, [0, 2]);
    expect(s.anchor).toEqual([0, 0]);
    expect(s.cursor).toEqual([0, 2]);
  });
  it('clears anchor when tapping the anchor cell again', () => {
    let s = tapCell(startSuture(small), small, [0, 0]);
    s = tapCell(s, small, [0, 0]);
    expect(s.anchor).toBeNull();
    expect(s.cursor).toBeNull();
  });
  it('ignores taps on found word cells', () => {
    let s = startSuture(small);
    s = tapCell(s, small, [0, 0]);
    s = tapCell(s, small, [0, 2]);
    s = stitch(s, small).state;
    const before = s;
    expect(tapCell(s, small, [0, 1])).toBe(before);
  });
  it('ignores taps after the puzzle is done', () => {
    let s = startSuture(small);
    for (const word of small.words) {
      s = tapCell(s, small, word.path[0]!);
      s = tapCell(s, small, word.path.at(-1)!);
      s = stitch(s, small).state;
    }
    expect(isDone(s)).toBe(true);
    expect(tapCell(s, small, [0, 0])).toBe(s);
  });
});

describe('stitch', () => {
  it('finds a word stitched forward', () => {
    let s = tapCell(startSuture(small), small, [0, 0]);
    s = tapCell(s, small, [0, 2]);
    const result = stitch(s, small);
    expect(result.found).toBe(true);
    expect(result.word).toBe(1);
    expect(result.state.found).toEqual([0]);
    expect(result.state.anchor).toBeNull();
  });
  it('finds a word stitched in reverse', () => {
    let s = tapCell(startSuture(small), small, [0, 2]);
    s = tapCell(s, small, [0, 0]);
    const result = stitch(s, small);
    expect(result.found).toBe(true);
    expect(result.word).toBe(1);
  });
  it('registers a loose stitch on a non-matching path', () => {
    let s = tapCell(startSuture(small), small, [0, 0]);
    s = tapCell(s, small, [0, 1]);
    const result = stitch(s, small);
    expect(result.found).toBe(false);
    expect(result.state.looseStitches).toBe(1);
    expect(result.state.anchor).toBeNull();
  });
  it('registers a loose stitch on a diagonal selection', () => {
    let s = tapCell(startSuture(small), small, [0, 0]);
    s = { ...s, cursor: [2, 2] as Cell };
    const result = stitch(s, small);
    expect(result.found).toBe(false);
    expect(result.state.looseStitches).toBe(1);
  });
  it('does nothing when no anchor is set', () => {
    const s = startSuture(small);
    expect(stitch(s, small).state).toBe(s);
    expect(stitch(s, small).found).toBe(false);
  });
  it('finishes only after all words', () => {
    let s = startSuture(small);
    expect(isDone(s)).toBe(false);
    for (const word of small.words) {
      s = tapCell(s, small, word.path[0]!);
      s = tapCell(s, small, word.path.at(-1)!);
      s = stitch(s, small).state;
    }
    expect(isDone(s)).toBe(true);
    expect(wordsLeft(s)).toBe(0);
  });
});

describe('clearTrace', () => {
  it('clears anchor and cursor', () => {
    let s = tapCell(startSuture(small), small, [0, 0]);
    s = tapCell(s, small, [0, 2]);
    expect(clearTrace(s).anchor).toBeNull();
    expect(clearTrace(s).cursor).toBeNull();
  });
  it('returns the same reference when nothing is selected', () => {
    const s = startSuture(small);
    expect(clearTrace(s)).toBe(s);
  });
});

describe('foundWord and cellLabel', () => {
  it('labels coordinates, letters, selection state and found-word numbers', () => {
    let s = tapCell(startSuture(small), small, [0, 0]);
    s = tapCell(s, small, [0, 2]);
    expect(cellLabel(s, small, [0, 0])).toContain('selected first');
    expect(cellLabel(s, small, [0, 1])).toContain('highlighted');
    s = stitch(s, small).state;
    expect(cellLabel(s, small, [0, 1])).toContain('in word 1');
    expect(foundWord(s, small, [0, 1])).toBe(1);
    expect(foundWord(s, small, [1, 0])).toBeUndefined();
  });
  it('traceInWords shows the active selection path', () => {
    let s = tapCell(startSuture(small), small, [0, 0]);
    s = tapCell(s, small, [0, 2]);
    expect(traceInWords(s, small)).toBe('selected: c, a, t.');
    expect(traceInWords(startSuture(small), small)).toBe('no letters selected.');
  });
});

describe('shareLine', () => {
  it('shares a configured name in one plain line, never a grid or squares', () => {
    let s = startSuture(small);
    for (const word of small.words) {
      s = tapCell(s, small, word.path[0]!);
      s = tapCell(s, small, word.path.at(-1)!);
      s = stitch(s, small).state;
    }
    const line = shareLine(s, 'SUN\n1 NOV', 'sample word path');
    expect(line).toBe('cueory sample word path, sun 1 nov: stitched 3 of 3 words with 0 loose stitches.');
    expect(line).not.toMatch(/[\n\r■-◿]|🟩|🟨/u);
  });
  it('uses singular "stitch" when looseStitches is 1', () => {
    let s = startSuture(small);
    s = tapCell(s, small, [0, 0]);
    s = tapCell(s, small, [0, 1]);
    s = stitch(s, small).state; // loose stitch
    expect(shareLine(s, 'nov', 'game')).toContain('1 loose stitch.');
  });
});
