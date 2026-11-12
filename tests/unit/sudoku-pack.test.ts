import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countSolutions, isCompleteAndValid } from '../../src/islands/sudoku';
import {
  ANSWERS_PER_PAGE,
  PUZZLES_PER_PAGE,
  SUDOKU_PACK_SIZE,
  buildSudokuPack,
  gridLabel,
  gridRows,
  toPages,
} from '../../src/islands/sudokupack';

describe('printable sudoku pack (L3)', () => {
  const pack = buildSudokuPack();

  it('has 30 numbered puzzles', () => {
    expect(SUDOKU_PACK_SIZE).toBe(30);
    expect(pack).toHaveLength(30);
    expect(pack.map((puzzle) => puzzle.number)).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
  });

  it('is the same pack on every build (fixed seed)', () => {
    expect(buildSudokuPack()).toEqual(pack);
    expect(buildSudokuPack('another-seed')[0]!.puzzle).not.toEqual(pack[0]!.puzzle);
  });

  it('mixes levels: they take turns, ten of each', () => {
    expect(pack.slice(0, 6).map((puzzle) => puzzle.level)).toEqual(['easy', 'medium', 'hard', 'easy', 'medium', 'hard']);
    for (const level of ['easy', 'medium', 'hard'] as const) {
      expect(pack.filter((puzzle) => puzzle.level === level)).toHaveLength(10);
    }
  });

  it('every puzzle has exactly one answer, and the answer key matches its givens', () => {
    for (const { puzzle, solution } of pack) {
      expect(countSolutions(puzzle)).toBe(1);
      expect(isCompleteAndValid(solution)).toBe(true);
      puzzle.forEach((value, index) => {
        if (value) expect(solution[index]).toBe(value);
      });
    }
  });

  it('no two puzzles in the pack are the same', () => {
    expect(new Set(pack.map((puzzle) => puzzle.puzzle.join(''))).size).toBe(30);
  });

  it('splits into 15 puzzle pages of two and 5 answer pages of six', () => {
    expect(toPages(pack, PUZZLES_PER_PAGE).map((page) => page.length)).toEqual(Array(15).fill(2));
    expect(toPages(pack, ANSWERS_PER_PAGE).map((page) => page.length)).toEqual(Array(5).fill(6));
    expect(toPages([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(() => toPages([1], 0)).toThrow();
  });

  it('reads a grid as nine rows, with "blank" for empty squares', () => {
    const grid = pack[0]!.puzzle;
    expect(gridRows(grid)).toHaveLength(9);
    expect(gridRows(grid).flat()).toEqual(grid);
    const label = gridLabel('puzzle 1, easy', grid);
    expect(label.startsWith('puzzle 1, easy. row 1: ')).toBe(true);
    expect(label.match(/blank/g)).toHaveLength(81 - pack[0]!.givens);
    expect(() => gridRows([1, 2, 3])).toThrow();
  });

  it('the page uses the shared layout, stays out of search, and has no clinical text', () => {
    const page = readFileSync(new URL('../../src/pages/print/sudoku-pack.astro', import.meta.url), 'utf8');
    expect(page).toContain("import Layout from '../../layouts/Layout.astro'");
    expect(page).toMatch(/<Layout\b[^>]*\bnoindex\b/s);
    expect(page).not.toMatch(/style="/);
  });
});
