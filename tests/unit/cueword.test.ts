import { describe, expect, it } from 'vitest';
import { dailyGames } from '../../src/config/games';
import {
  checkAll, checkWord, currentWord, emptyState, erase, isSolved, move, nextWord, numbering,
  parsePuzzle, previousWord, revealCue, selectCell, shareLine, toggleDirection, type, words,
  type CuewordPuzzle,
} from '../../src/islands/cueword';

// Everyday words only. The lower-right square is TO/ON, in both directions.
const puzzle: CuewordPuzzle = {
  id: 'everyday-example', sample: true, grid: ['CAT..', 'ARE..', 'TEN..', '...TO', '...ON'],
  clues: {
    across: [
      { number: 1, text: 'a pet' }, { number: 4, text: 'a form of be' }, { number: 5, text: 'two fives' },
      { number: 6, text: 'toward' }, { number: 8, text: 'the opposite of off' },
    ],
    down: [
      { number: 1, text: 'a pet' }, { number: 2, text: 'a form of be' }, { number: 3, text: 'two fives' },
      { number: 6, text: 'toward' }, { number: 7, text: 'the opposite of off' },
    ],
  },
};
const separated: CuewordPuzzle = {
  id: 'separated-words', sample: true, grid: ['AT.TO', '.....', 'ON.UP'],
  clues: { across: [
    { number: 1, text: 'in a place' }, { number: 2, text: 'toward' },
    { number: 3, text: 'not off' }, { number: 4, text: 'not down' },
  ], down: [] },
};
const copy = () => structuredClone(puzzle);

describe('crossword parsing and numbering', () => {
  it('validates a puzzle without retaining mutable input arrays', () => {
    const data = copy();
    expect(parsePuzzle(data)).toEqual(data);
    const parsed = parsePuzzle(data);
    parsed.grid[0] = '.....';
    parsed.clues.across[0]!.text = 'changed';
    expect(data).toEqual(puzzle);
  });
  it.each([null, [], 'puzzle', {}])('rejects incomplete input %j', (data) => {
    expect(() => parsePuzzle(data)).toThrow();
  });
  it('rejects invalid metadata, shape and letters', () => {
    expect(() => parsePuzzle({ ...copy(), id: '' })).toThrow(/id/);
    expect(() => parsePuzzle({ ...copy(), sample: 'yes' })).toThrow(/sample/);
    expect(() => parsePuzzle({ ...copy(), grid: ['CAT', 'ARE'] })).toThrow(/rows/);
    expect(() => parsePuzzle({ ...copy(), grid: Array(8).fill('CAT') })).toThrow(/rows/);
    const uneven = copy(); uneven.grid[0] = 'CAT';
    expect(() => parsePuzzle(uneven)).toThrow(/equal lengths/);
    const bad = copy(); bad.grid[0] = 'C@T..';
    expect(() => parsePuzzle(bad)).toThrow(/uppercase/);
    bad.grid[0] = 'cat..';
    expect(() => parsePuzzle(bad)).toThrow(/uppercase/);
  });
  it('requires exactly one correctly numbered clue per word', () => {
    const missing = copy(); missing.clues.across.pop();
    expect(() => parsePuzzle(missing)).toThrow(/missing/);
    const extra = copy(); extra.clues.down.push({ number: 99, text: 'extra' });
    expect(() => parsePuzzle(extra)).toThrow(/extra/);
    const duplicate = copy(); duplicate.clues.across.push({ ...duplicate.clues.across[0]! });
    expect(() => parsePuzzle(duplicate)).toThrow(/more than one/);
    const wrongNumber = copy(); wrongNumber.clues.across[0]!.number = 2;
    expect(() => parsePuzzle(wrongNumber)).toThrow(/number/);
    const emptyClue = copy(); emptyClue.clues.down[0]!.text = ' ';
    expect(() => parsePuzzle(emptyClue)).toThrow(/text/);
    expect(() => parsePuzzle({ ...copy(), clues: { across: null, down: [] } })).toThrow(/list/);
  });
  it('rejects isolated one-letter runs, while allowing a cell that crosses a longer word', () => {
    expect(() => parsePuzzle({
      id: 'isolated', sample: true, grid: ['CAT', '...', '..A'],
      clues: { across: [{ number: 1, text: 'a pet' }], down: [] },
    })).toThrow(/one-letter/);
    expect(() => parsePuzzle({ ...separated, grid: ['.....', '.....', '.....'] })).toThrow(/word/);
    expect(parsePuzzle({
      id: 'crossing', sample: true, grid: ['CAT', '.R.', 'TEN'],
      clues: { across: [{ number: 1, text: 'a pet' }, { number: 3, text: 'two fives' }], down: [{ number: 2, text: 'a form of be' }] },
    }).grid[1]).toBe('.R.');
  });
  it('numbers a 5 by 5 grid with gaps in standard reading order', () => {
    expect(numbering(puzzle)).toEqual([
      [1, 2, 3, null, null], [4, null, null, null, null], [5, null, null, null, null],
      [null, null, null, 6, 7], [null, null, null, 8, null],
    ]);
    expect(words(puzzle).map(({ number, direction, answer }) => [number, direction, answer])).toEqual([
      [1, 'across', 'CAT'], [4, 'across', 'ARE'], [5, 'across', 'TEN'], [6, 'across', 'TO'], [8, 'across', 'ON'],
      [1, 'down', 'CAT'], [2, 'down', 'ARE'], [3, 'down', 'TEN'], [6, 'down', 'TO'], [7, 'down', 'ON'],
    ]);
    expect(words(puzzle).find((word) => word.number === 2 && word.direction === 'down')!.cells).toEqual([1, 6, 11]);
  });
});

describe('crossword play', () => {
  it('starts empty and types uppercase letters, advancing past gaps without mutating old state', () => {
    const start = emptyState(separated);
    let state = type(start, 'a');
    expect(start.entries.every((letter) => letter === '')).toBe(true);
    expect(state.entries[0]).toBe('A');
    expect(state.cell).toBe(1);
    state = type(state, 't');
    expect(state.cell).toBe(3);
    expect(type(state, '12')).toBe(state);
    expect(type(state, 'é')).toBe(state);
    expect(selectCell(state, 2)).toBe(state);
    expect(selectCell(state, -1)).toBe(state);
  });
  it('erases the selected cell and steps back past gaps', () => {
    let state = type(selectCell(emptyState(separated), 3), 't');
    state = erase(selectCell(state, 3));
    expect(state.entries[3]).toBe('');
    expect(state.cell).toBe(1);
  });
  it('moves with each arrow, skips gaps and stops at edges', () => {
    let state = emptyState(separated);
    expect(move(state, 'ArrowLeft')).toBe(state);
    expect(move(state, 'ArrowUp')).toBe(state);
    state = move(state, 'ArrowDown');
    expect(state.cell).toBe(10);
    expect(move(state, 'ArrowUp').cell).toBe(0);
    state = move(state, 'ArrowRight');
    expect(state.cell).toBe(11);
    expect(move(state, 'ArrowRight').cell).toBe(13);
  });
  it('switches directions at a crossing and moves between words in both directions', () => {
    let state = emptyState(puzzle);
    state = toggleDirection(state);
    expect(state.direction).toBe('down');
    expect(type(state, 'c').cell).toBe(5);
    state = toggleDirection(state);
    expect(state.direction).toBe('across');
    expect(currentWord(nextWord(state)).number).toBe(4);
    expect(previousWord(nextWord(state))).toMatchObject({ cell: 0, direction: 'across' });
    expect(currentWord(previousWord(state))).toMatchObject({ number: 7, direction: 'down' });
    expect(toggleDirection(emptyState(separated)).direction).toBe('across');
  });
  it('checks right, wrong and empty letters and clears stale marks on edit', () => {
    let state = type(type(emptyState(puzzle), 'c'), 'x');
    state = checkWord(state);
    expect(state.checks.slice(0, 3)).toEqual(['right', 'wrong', 'empty']);
    expect(state.checks[5]).toBeUndefined();
    const all = checkAll(state);
    expect(all.checks[5]).toBe('empty');
    expect(all.checks[3]).toBeUndefined();
    state = type(selectCell(state, 1), 'a');
    expect(state.checks[1]).toBeUndefined();
    state = erase(selectCell(checkAll(state), 1));
    expect(state.checks[1]).toBeUndefined();
  });
  it('allows three cues, refuses a fourth, and keeps revealed letters immutable', () => {
    const start = emptyState(puzzle);
    let state = revealCue(start, 0);
    expect(start.cued).toEqual([]);
    expect(state.entries[0]).toBe('C');
    expect(state.cued).toEqual([0]);
    expect(revealCue(state, 0)).toBe(state);
    expect(revealCue(state, 3)).toBe(state);
    state = revealCue(revealCue(state, 1), 2);
    expect(state.cued).toHaveLength(3);
    expect(revealCue(state, 5)).toBe(state);
    expect(type(selectCell(state, 0), 'z').entries[0]).toBe('C');
    expect(erase(selectCell(state, 2)).entries[2]).toBe('T');
    expect(checkAll(state).checks[0]).toBe('right');
  });
  it('is solved only when every non-gap cell is correct', () => {
    let state = emptyState(puzzle);
    expect(isSolved(state)).toBe(false);
    for (const [cell, letter] of [...puzzle.grid.join('')].entries()) {
      if (letter !== '.') state = type(selectCell(state, cell), letter);
    }
    expect(isSolved(state)).toBe(true);
    expect(type(state, 'x')).toBe(state);
    expect(erase(state)).toBe(state);
    expect(revealCue(state, 0)).toBe(state);
  });
});

describe('crossword sharing', () => {
  it('shares one plain line with elapsed time and cue count, without squares or a grid', () => {
    const name = dailyGames.find((game) => game.id === 'cueword')!.name;
    const line = shareLine({ solved: true, seconds: 252, cues: 1 }, 'sun 1 nov', name);
    expect(line).toBe(`cueory ${name}, sun 1 nov: solved in 4:12 with 1 cue.`);
    expect(shareLine({ solved: false, seconds: 0, cues: 0 }, 'SUN\n1 NOV', name)).toBe(`cueory ${name}, sun 1 nov: not solved this time with 0 cues.`);
    expect(line).not.toMatch(/[\n\r\u25a0-\u25ff]|🟩|🟨/u);
  });
  it('takes the visible name from game settings, so a rename needs one edit', () => {
    const game = dailyGames.find((item) => item.id === 'cueword')!;
    const original = game.name;
    try {
      game.name = 'new sample name';
      expect(shareLine({ solved: true, seconds: 5, cues: 3 }, 'sun 1 nov', game.name)).toContain('cueory new sample name,');
    } finally { game.name = original; }
  });
});

describe('typing past a cued letter (the director\'s review of #51)', () => {
  const puzzle = {
    id: 'cab',
    sample: true,
    grid: ['CAT', 'A.O', 'BOX'],
    clues: {
      across: [
        { number: 1, text: 'a pet that purrs' },
        { number: 3, text: 'a box' },
      ],
      down: [
        { number: 1, text: 'a taxi' },
        { number: 2, text: 'a short word for poison' },
      ],
    },
  };

  it('types into the next open cell instead of dropping the letter on a cued one', () => {
    let state = revealCue(emptyState(puzzle), 1);
    state = type(state, 'c');
    expect(state.cell).toBe(1);
    state = type(state, 't');
    expect(state.entries.slice(0, 3)).toEqual(['C', 'A', 'T']);
  });

  it('changes nothing when only cued cells are left before the edge', () => {
    let state = selectCell(revealCue(emptyState(puzzle), 2), 2, 'across');
    expect(type(state, 'x')).toBe(state);
  });
});
