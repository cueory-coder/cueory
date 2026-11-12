import { describe, expect, it } from 'vitest';
import {
  LEVEL_RULES,
  candidates,
  conflictIndices,
  countSolutions,
  dailySudokuSeed,
  generateSudoku,
  getResult,
  isCompleteAndValid,
  solveSudoku,
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
  // 300 ms is a loose per-puzzle budget for a shared CI runner, not a user-device benchmark.
  // Counting solutions is checked separately because the on-device generator does not do it.
  const seeds = Array.from({ length: 24 }, (_, index) => `2026-11-${String(index + 1).padStart(2, '0')}`);
  it.each(levels)('%s generates a unique puzzle for 24 days within 300 ms per board', (level) => {
    for (const seed of seeds) {
      const started = performance.now();
      const puzzle = generateSudoku(dailySudokuSeed(seed, level), level);
      const elapsed = performance.now() - started;
      expect(elapsed, `${level} ${seed}: generator took ${elapsed.toFixed(1)} ms`).toBeLessThan(300);
      expect(puzzle.givens).toBe(LEVEL_RULES[level].givens);
      expect(countSolutions(puzzle.puzzle), `${level} ${seed} must have one solution`).toBe(1);
      expect(solveSudoku(puzzle.puzzle)).toEqual(puzzle.solution);
    }
  });

  it.each(['', 'not-a-day', '2026-02-30', '0000-00-00', '2026-11-01\\n'])('treats an unusual day %j as an opaque deterministic seed', (day) => {
    const seed = dailySudokuSeed(day, 'hard');
    const first = generateSudoku(seed, 'hard');
    expect(generateSudoku(seed, 'hard')).toEqual(first);
    expect(countSolutions(first.puzzle)).toBe(1);
    expect(first.givens).toBe(LEVEL_RULES.hard.givens);
  });
});
