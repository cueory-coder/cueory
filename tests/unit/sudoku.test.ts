import { describe, expect, it } from 'vitest';
import {
  LEVEL_RULES,
  advanceSudokuSeconds,
  candidates,
  conflictIndices,
  countSolutions,
  dailySudokuSeed,
  generateSudoku,
  getResult,
  isCompleteAndValid,
  solveSudoku,
  sudokuCellPresentation,
  type SudokuLevel,
} from '../../src/islands/sudoku';

const levels: SudokuLevel[] = ['easy', 'medium', 'hard'];

describe('daily Sudoku generator (Task 625)', () => {
  it.each(levels)('%s has the documented number of givens and exactly one solution', (level) => {
    for (const seed of ['2026-11-01', '2026-11-02', 'phone-check']) {
      const generated = generateSudoku(seed, level);
      expect(generated.givens).toBe(LEVEL_RULES[level].givens);
      expect(countSolutions(generated.puzzle)).toBe(1);
      expect(solveSudoku(generated.puzzle)).toEqual(generated.solution);
      expect(isCompleteAndValid(generated.solution)).toBe(true);
    }
  });

  it('is deterministic for a seed and changes the board for another seed', () => {
    const first = generateSudoku('same-day', 'medium');
    expect(generateSudoku('same-day', 'medium')).toEqual(first);
    expect(generateSudoku('next-day', 'medium').puzzle).not.toEqual(first.puzzle);
  });

  it('keeps the levels in distinct given-count and documented technique bands', () => {
    const easy = generateSudoku('band-check', 'easy');
    const medium = generateSudoku('band-check', 'medium');
    const hard = generateSudoku('band-check', 'hard');
    expect(easy.givens).toBeGreaterThan(medium.givens);
    expect(medium.givens).toBeGreaterThan(hard.givens);
    expect(easy.technique).toBe('naked singles');
    expect(medium.technique).toBe('hidden singles');
    expect(hard.technique).toBe('search');
    expect(LEVEL_RULES.easy.technique).toContain('singles');
    expect(LEVEL_RULES.medium.technique).toContain('candidate');
    expect(LEVEL_RULES.hard.technique).toContain('search');
  });

  it('builds one stable seed for a local day and level', () => {
    expect(dailySudokuSeed('2026-11-01', 'easy')).toBe('cueory-sudoku:2026-11-01:easy');
    expect(dailySudokuSeed('2026-11-01', 'easy')).not.toBe(dailySudokuSeed('2026-11-01', 'hard'));
  });

  it('exposes a stable result for the shared results and share-card island', () => {
    expect(getResult({ day: '2026-11-01', level: 'medium', solved: true, seconds: 125, errors: 2 })).toEqual({
      game: 'sudoku',
      day: '2026-11-01',
      level: 'medium',
      solved: true,
      seconds: 125,
      time: '02:05',
      errors: 2,
    });
  });
});

describe('Sudoku validation and candidates', () => {
  const grid = [
    5, 3, 0, 0, 7, 0, 0, 0, 0,
    6, 0, 0, 1, 9, 5, 0, 0, 0,
    0, 9, 8, 0, 0, 0, 0, 6, 0,
    8, 0, 0, 0, 6, 0, 0, 0, 3,
    4, 0, 0, 8, 0, 3, 0, 0, 1,
    7, 0, 0, 0, 2, 0, 0, 0, 6,
    0, 6, 0, 0, 0, 0, 2, 8, 0,
    0, 0, 0, 4, 1, 9, 0, 0, 5,
    0, 0, 0, 0, 8, 0, 0, 7, 9,
  ];

  it('calculates the possible values for a known empty square', () => {
    expect(candidates(grid, 2)).toEqual([1, 2, 4]);
    expect(candidates(grid, 0)).toEqual([]);
  });

  it('marks every side of row, column and box conflicts', () => {
    const rowConflict = [...grid];
    rowConflict[2] = 5;
    expect(conflictIndices(rowConflict)).toEqual(expect.arrayContaining([0, 2]));
    const boxConflict = [...grid];
    boxConflict[10] = 9;
    expect(conflictIndices(boxConflict)).toEqual(expect.arrayContaining([10, 19]));
  });

  it('rejects a conflicting grid and solves the known grid', () => {
    const bad = [...grid];
    bad[2] = 5;
    expect(solveSudoku(bad)).toBeUndefined();
    const solved = solveSudoku(grid);
    expect(solved).toBeDefined();
    expect(isCompleteAndValid(solved!)).toBe(true);
  });
});


describe('Sudoku generator performance and varied days (W08)', () => {
  // 300 ms is a loose average generation-time budget across a warmed batch of 24 puzzles,
  // not a wall-clock deadline for any one call or a benchmark for student devices.
  const seeds = Array.from({ length: 24 }, (_, index) => `2026-11-${String(index + 1).padStart(2, '0')}`);
  it.each(levels)('%s generates unique, solvable puzzles for 24 days', (level) => {
    for (const seed of seeds) {
      const puzzle = generateSudoku(dailySudokuSeed(seed, level), level);
      expect(puzzle.givens).toBe(LEVEL_RULES[level].givens);
      expect(countSolutions(puzzle.puzzle), `${level} ${seed} must have one solution`).toBe(1);
      expect(solveSudoku(puzzle.puzzle)).toEqual(puzzle.solution);
    }
  });

  it.each(levels)('%s generates 24 puzzles within a 300 ms average time budget', (level) => {
    // Warm the generator before timing so a cold JIT call cannot fail the whole batch.
    // One shared window is less sensitive to an individual CI scheduling spike.
    generateSudoku(dailySudokuSeed('warm-up', level), level);
    const started = performance.now();
    for (const seed of seeds) generateSudoku(dailySudokuSeed(seed, level), level);
    const averageMs = (performance.now() - started) / seeds.length;
    expect(averageMs, `${level}: average generation took ${averageMs.toFixed(1)} ms`).toBeLessThan(300);
  });

  it.each(['', 'not-a-day', '2026-02-30', '0000-00-00', '2026-11-01\\n'])('treats an unusual day %j as an opaque deterministic seed', (day) => {
    const seed = dailySudokuSeed(day, 'hard');
    const first = generateSudoku(seed, 'hard');
    expect(generateSudoku(seed, 'hard')).toEqual(first);
    expect(countSolutions(first.puzzle)).toBe(1);
    expect(first.givens).toBe(LEVEL_RULES.hard.givens);
  });
});

describe('W08-2 pause and resume', () => {
  it('shows only givens while paused and restores entries, X marks and conflicts', () => {
    const { puzzle } = generateSudoku('pause-restore', 'easy');
    const entryIndex = puzzle.indexOf(0);
    const markIndex = puzzle.findIndex((value, index) => value === 0 && index !== entryIndex);
    const givenIndex = puzzle.findIndex((value) => value !== 0);
    const row = Math.floor(entryIndex / 9);
    const conflictDigit = puzzle.slice(row * 9, row * 9 + 9).find((value) => value !== 0)!;
    const entries = [...puzzle];
    entries[entryIndex] = conflictDigit;
    const marks = new Set([markIndex]);
    const conflicts = conflictIndices(entries);
    expect(conflicts).toContain(entryIndex);
    const entry = sudokuCellPresentation(entries, puzzle, marks, entryIndex, false);
    const mark = sudokuCellPresentation(entries, puzzle, marks, markIndex, false);
    expect(entry).toEqual({ given: false, value: conflictDigit, marked: false, hidden: false });
    expect(mark).toEqual({ given: false, value: 0, marked: true, hidden: false });
    expect(sudokuCellPresentation(entries, puzzle, marks, givenIndex, true)).toEqual({
      given: true, value: puzzle[givenIndex], marked: false, hidden: false,
    });
    for (const index of [entryIndex, markIndex]) {
      expect(sudokuCellPresentation(entries, puzzle, marks, index, true)).toEqual({
        given: false, value: 0, marked: false, hidden: true,
      });
    }
    expect(sudokuCellPresentation(entries, puzzle, marks, entryIndex, false)).toEqual(entry);
    expect(sudokuCellPresentation(entries, puzzle, marks, markIndex, false)).toEqual(mark);
    expect(entries[entryIndex]).toBe(conflictDigit);
    expect(marks.has(markIndex)).toBe(true);
    expect(conflictIndices(entries)).toEqual(conflicts);
  });

  it('takes visible givens from the puzzle, not from mutable entries', () => {
    const { puzzle } = generateSudoku('pause-givens', 'medium');
    const index = puzzle.findIndex((value) => value !== 0);
    const entries = [...puzzle];
    entries[index] = 0;
    expect(sudokuCellPresentation(entries, puzzle, new Set(), index, true).value).toBe(puzzle[index]);
  });

  it('stops the clock while paused or solved, resuming from its previous second', () => {
    expect(advanceSudokuSeconds(19, true, false)).toBe(19);
    expect(advanceSudokuSeconds(19, true, true)).toBe(19);
    expect(advanceSudokuSeconds(19, false, true)).toBe(19);
    expect(advanceSudokuSeconds(19, false, false)).toBe(20);
  });
});


describe('W08-2: paused displays across all difficulty levels', () => {
  it.each(levels)('%s keeps all and only its original givens visible while paused', (level) => {
    const puzzle = generateSudoku('pause-every-square', level).puzzle;
    const entries = puzzle.map((value) => value || 9);
    const emptyIndices = puzzle.flatMap((value, index) => value === 0 ? [index] : []);
    const marks = new Set(emptyIndices);
    const preservedEntries = [...entries];
    const preservedMarks = [...marks];

    const cells = puzzle.map((_, index) => sudokuCellPresentation(entries, puzzle, marks, index, true));
    expect(cells.filter((cell) => cell.value > 0)).toHaveLength(LEVEL_RULES[level].givens);
    expect(cells.every((cell, index) =>
      puzzle[index]
        ? cell.given && cell.value === puzzle[index] && !cell.hidden && !cell.marked
        : !cell.given && cell.value === 0 && cell.hidden && !cell.marked
    )).toBe(true);
    expect(entries).toEqual(preservedEntries);
    expect([...marks]).toEqual(preservedMarks);
    expect(emptyIndices.every((index) => sudokuCellPresentation(entries, puzzle, marks, index, false).value === 9)).toBe(true);
  });
});
