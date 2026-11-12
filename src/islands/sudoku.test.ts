import { describe, expect, it } from 'vitest';
import { candidates, conflicts, dailySeed, generatePuzzle, getResult, solve, validate, type Level } from '../../src/islands/sudoku';

const levels: Level[] = ['easy', 'medium', 'hard'];
const expected = { easy: 40, medium: 32, hard: 26 };

function isCompleteSudoku(grid: number[]) {
  if (grid.length !== 81 || grid.some((value) => value < 1 || value > 9)) return false;
  for (let row = 0; row < 9; row += 1) {
    if (new Set(grid.slice(row * 9, row * 9 + 9)).size !== 9) return false;
  }
  for (let column = 0; column < 9; column += 1) {
    if (new Set(Array.from({ length: 9 }, (_, row) => grid[row * 9 + column])).size !== 9) return false;
  }
  for (let box = 0; box < 9; box += 1) {
    const values = Array.from({ length: 9 }, (_, i) => grid[(Math.floor(box / 3) * 3 + Math.floor(i / 3)) * 9 + (box % 3) * 3 + i % 3]);
    if (new Set(values).size !== 9) return false;
  }
  return true;
}

describe('sudoku', () => {
  it.each(levels)('creates a valid exact-one-solution puzzle at every level: %s', (level) => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const puzzle = generatePuzzle(level, seed);
      expect(isCompleteSudoku(puzzle.solution)).toBe(true);
      expect(puzzle.givens.filter(Boolean)).toHaveLength(expected[level]);
      expect(solve(puzzle.givens)).toEqual(puzzle.solution);
    }
  }, 30_000);

  it('is deterministic for the same seed and level', () => {
    expect(generatePuzzle('medium', 12345)).toEqual(generatePuzzle('medium', 12345));
    expect(generatePuzzle('medium', 12345).givens).not.toEqual(generatePuzzle('medium', 12346).givens);
  });

  it('uses the same local day as daily puzzle selection', () => {
    const date = new Date(2026, 10, 11, 0, 30);
    expect(getResult('hard', 95, 2, true, date).day).toBe('2026-11-11');
  });

  it('reports conflicts and candidates', () => {
    const grid = Array(81).fill(0);
    grid[0] = 4; grid[1] = 4;
    expect([...conflicts(grid)].sort((a, b) => a - b)).toEqual([0, 1]);
    expect(candidates(grid, 2)).not.toContain(4);
    expect(validate(grid).valid).toBe(false);
  });
});


describe('saved game stats compatibility', () => {
  it('drops legacy triage entries without losing current game history', async () => {
    const { parseStats } = await import('./gamestats');
    const text = JSON.stringify({ version: 1, results: [
      { game: 'triage', day: '2026-11-10', solved: true, tries: 1 },
      { game: 'pulse', day: '2026-11-11', solved: true, tries: 3 },
    ] });
    expect(parseStats(text)).toEqual([{ game: 'pulse', day: '2026-11-11', solved: true, tries: 3 }]);
  });
});
