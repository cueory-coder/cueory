/**
 * Which highlight classes each sudoku square gets (global.css styles them with tokens from tokens.css).
 * - is-selected: the chosen square (strong outline, the focal point).
 * - is-related / is-box-related: the other squares in its row and column / its 3 × 3 box (a clear tint).
 * - is-identical: every square holding the selected square's number (strongest fill plus bold, so not color alone).
 * - is-conflict: a number that clashes in its row, column or box (a dashed ring, a sign that isn't color).
 * Pure, so tap, mouse and keyboard selection all go through the same rules and it can be unit tested.
 */
import type { SudokuSettings } from './sudoku';

export type SudokuHighlightSettings = Pick<SudokuSettings, 'highlightRowColumn' | 'highlightBox' | 'highlightIdentical' | 'highlightConflicts'>;

export interface SudokuHighlightState {
  selected: number;
  entries: readonly number[];
  givens: readonly number[];
  conflicts: ReadonlySet<number>;
  paused: boolean;
  settings: SudokuHighlightSettings;
}

export function sudokuCellClasses(index: number, state: SudokuHighlightState): string[] {
  const { selected, entries, givens, conflicts, paused, settings } = state;
  const row = Math.floor(index / 9); const column = index % 9;
  const selectedRow = Math.floor(selected / 9); const selectedColumn = selected % 9;
  const value = entries[index] ?? 0; const selectedValue = entries[selected] ?? 0;
  const given = (givens[index] ?? 0) !== 0;
  const isSelected = index === selected;
  // While paused every square is hidden, so nothing may hint at where numbers sit.
  const show = !paused && !isSelected;
  const related = show && settings.highlightRowColumn && (row === selectedRow || column === selectedColumn);
  const box = show && settings.highlightBox && Math.floor(row / 3) === Math.floor(selectedRow / 3) &&
    Math.floor(column / 3) === Math.floor(selectedColumn / 3);
  const identical = !paused && settings.highlightIdentical && selectedValue !== 0 && value === selectedValue;
  const classes = ['sudoku-cell'];
  if (given) classes.push('is-given');
  else if (value) classes.push('is-entered');
  if (isSelected) classes.push('is-selected');
  if (related) classes.push('is-related');
  if (box) classes.push('is-box-related');
  if (identical) classes.push('is-identical');
  if (settings.highlightConflicts && conflicts.has(index)) classes.push('is-conflict');
  if (column === 2 || column === 5) classes.push('sudoku-box-right');
  if (row === 2 || row === 5) classes.push('sudoku-box-bottom');
  return classes;
}
