import { describe, expect, it } from 'vitest';
import { candidates, conflicts, dailySeed, generatePuzzle, getResult, solve, validate, type Level } from '../../src/islands/sudoku';

describe('sudoku', () => {
  it.each(['easy', 'medium', 'hard'] as Level[])('creates one solution at every level: %s', (level) => {
    const puzzle = generatePuzzle(level, dailySeed(new Date('2026-11-11T00:00:00Z'), level));
    expect(puzzle.givens.filter(Boolean)).toHaveLength({ easy: 40, medium: 32, hard: 26 }[level]);
    expect(solve(puzzle.givens)).toEqual(puzzle.solution);
  });

  it('is deterministic for the same seed and level', () => {
    expect(generatePuzzle('medium', 12345)).toEqual(generatePuzzle('medium', 12345));
    expect(generatePuzzle('medium', 12345).givens).not.toEqual(generatePuzzle('medium', 12346).givens);
  });

  it('reports conflicts and candidates', () => {
    const grid = Array(81).fill(0);
    grid[0] = 4; grid[1] = 4;
    expect([...conflicts(grid)].sort((a, b) => a - b)).toEqual([0, 1]);
    expect(candidates(grid, 2)).not.toContain(4);
    expect(validate(grid).valid).toBe(false);
  });

  it('returns a shareable result payload', () => {
    expect(getResult('hard', 95, 2, true, new Date('2026-11-11T00:00:00Z'))).toEqual({
      game: 'sudoku', level: 'hard', day: '2026-11-11', elapsedSeconds: 95, errors: 2, solved: true,
    });
  });
});
