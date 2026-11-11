import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  emptyState, getResult, hasRotationalSymmetry, hasShortEntries, levelSize, parsePuzzle,
  selectOrToggleCell, type CrosswordLevel,
} from '../../src/islands/cueword';

const files: Record<CrosswordLevel, string> = {
  easy: 'sample-07.json',
  mid: 'sample-08.json',
  hard: 'sample-09.json',
};

describe('crossword levels (Task 627)', () => {
  for (const level of ['easy', 'mid', 'hard'] as const) {
    it(level + ' is the required size with real symmetric blocks and no short entries', () => {
      const raw = JSON.parse(readFileSync(new URL('../../content/games/cueword/' + files[level], import.meta.url), 'utf8'));
      const puzzle = parsePuzzle({ id: files[level].replace('.json', ''), sample: true, level: raw.level, grid: raw.grid, clues: raw.clues });
      expect(puzzle.grid).toHaveLength(levelSize(level));
      expect(puzzle.grid.every((row) => row.length === levelSize(level))).toBe(true);
      expect(puzzle.grid.join('')).toContain('.');
      expect(hasRotationalSymmetry(puzzle.grid)).toBe(true);
      expect(hasShortEntries(puzzle.grid)).toBe(false);
    });
  }

  it('rejects wrong sizes, asymmetric blocks and one- or two-letter entries', () => {
    const raw = JSON.parse(readFileSync(new URL('../../content/games/cueword/sample-07.json', import.meta.url), 'utf8'));
    expect(() => parsePuzzle({ id: 'wrong-size', sample: true, level: 'mid', grid: raw.grid, clues: raw.clues })).toThrow(/7 by 7/);
    const asymmetric = { ...raw, grid: [...raw.grid] }; asymmetric.grid[0] = '.BCDE';
    expect(() => parsePuzzle({ id: 'asymmetric', sample: true, level: 'easy', grid: asymmetric.grid, clues: raw.clues })).toThrow(/symmetry/);
    expect(hasShortEntries(['AB...', 'ABCDE', 'ABCDE', 'ABCDE', '...AB'])).toBe(true);
  });

  it('tapping the selected crossing toggles direction and exposes a plain result hook', () => {
    const raw = JSON.parse(readFileSync(new URL('../../content/games/cueword/sample-07.json', import.meta.url), 'utf8'));
    const puzzle = parsePuzzle({ id: 'easy', sample: true, level: raw.level, grid: raw.grid, clues: raw.clues });
    const state = emptyState(puzzle);
    expect(selectOrToggleCell(state, state.cell).direction).not.toBe(state.direction);
    expect(getResult(state, 12.9)).toEqual({ solved: false, seconds: 12, level: 'easy' });
  });
});
