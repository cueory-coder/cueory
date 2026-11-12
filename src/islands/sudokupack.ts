/**
 * The printable sudoku pack (launch task L3). Numbers only, from the same generator as the daily game, so the pack
 * holds no clinical content. A fixed seed means every build prints the same 30 puzzles in the same order.
 */
import { generateSudoku, type SudokuGrid, type SudokuLevel, type SudokuPuzzle } from './sudoku';

export const SUDOKU_PACK_SEED = 'cueory-print-pack:v1';
export const SUDOKU_PACK_SIZE = 30;
/** Two puzzles share a printed page (one per half page). */
export const PUZZLES_PER_PAGE = 2;
/** Six small answer grids share a printed page at the end. */
export const ANSWERS_PER_PAGE = 6;

/** Levels take turns, so every page of the pack mixes them. */
const LEVEL_ORDER: readonly SudokuLevel[] = ['easy', 'medium', 'hard'];

export interface SudokuPackPuzzle extends SudokuPuzzle {
  /** 1-based number printed above the puzzle and its answer. */
  number: number;
}

export function buildSudokuPack(seed: string = SUDOKU_PACK_SEED, size: number = SUDOKU_PACK_SIZE): SudokuPackPuzzle[] {
  if (!Number.isInteger(size) || size < 0) throw new Error('Pack size must be a whole number.');
  return Array.from({ length: size }, (_, index) => {
    const level = LEVEL_ORDER[index % LEVEL_ORDER.length]!;
    return { ...generateSudoku(`${seed}:${index + 1}`, level), number: index + 1 };
  });
}

/** Splits a list into pages of at most `size` items. */
export function toPages<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('Page size must be at least 1.');
  const pages: T[][] = [];
  for (let start = 0; start < items.length; start += size) pages.push(items.slice(start, start + size));
  return pages;
}

/** The 81 squares as nine rows of nine. */
export function gridRows(grid: SudokuGrid): number[][] {
  if (grid.length !== 81) throw new Error('A sudoku grid has 81 squares.');
  return Array.from({ length: 9 }, (_, row) => grid.slice(row * 9, row * 9 + 9));
}

/** What a screen reader hears for one grid: each row's numbers, with "blank" for an empty square. */
export function gridLabel(title: string, grid: SudokuGrid): string {
  const rows = gridRows(grid).map((row, index) => `row ${index + 1}: ${row.map((value) => (value ? String(value) : 'blank')).join(' ')}`);
  return `${title}. ${rows.join('; ')}`;
}
