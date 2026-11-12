import type { SudokuGrid, SudokuLevel } from './sudoku';

/**
 * Printing one daily game from /play (Task 641). The game's print button marks the page with the game's id
 * (`data-print-game` on the root element), so the game's own @media print rules can leave out everything else on the
 * page, then opens the browser's print dialog. The mark is removed once printing is over, so a later Ctrl+P prints the
 * whole page again. Kept in a plain file so it can be unit tested without a browser.
 */
export interface PrintTarget {
  document: { documentElement: { dataset: DOMStringMap } };
  addEventListener(type: 'afterprint', listener: () => void, options: { once: true }): void;
  print(): void;
}

export function printGame(game: string, target: PrintTarget = window): void {
  const root = target.document.documentElement;
  root.dataset.printGame = game;
  target.addEventListener('afterprint', () => {
    if (root.dataset.printGame === game) delete root.dataset.printGame;
  }, { once: true });
  target.print();
}

/** A print-only Sudoku sheet contains published givens, never student entries or the solution. */
export interface SudokuPrintSheet {
  level: SudokuLevel;
  day: string;
  rows: string[][];
}

export function buildSudokuSheet(puzzle: SudokuGrid, level: SudokuLevel, day: string): SudokuPrintSheet {
  if (puzzle.length !== 81 || puzzle.some((value) => !Number.isInteger(value) || value < 0 || value > 9)) {
    throw new Error('Sudoku print sheet requires exactly 81 numbers from 0 through 9.');
  }
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!['easy', 'medium', 'hard'].includes(level) || !parts) {
    throw new Error('Sudoku print sheet requires a valid level and YYYY-MM-DD day.');
  }
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const date = Number(parts[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDate = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (year < 1 || !maxDate || date < 1 || date > maxDate) {
    throw new Error('Sudoku print sheet requires a real calendar day.');
  }

  return {
    level,
    day,
    rows: Array.from({ length: 9 }, (_, row) =>
      Array.from({ length: 9 }, (_, column) => {
        const given = puzzle[row * 9 + column]!;
        return given ? String(given) : '';
      })),
  };
}
