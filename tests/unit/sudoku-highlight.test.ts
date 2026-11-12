import { describe, expect, it } from 'vitest';
import { sudokuCellClasses, type SudokuHighlightState } from '../../src/islands/sudokuhighlight';

const allOn = { highlightRowColumn: true, highlightBox: true, highlightIdentical: true, highlightConflicts: true };
const givens = Array<number>(81).fill(0);
givens[0] = 5; // row 1, column 1
const entries = [...givens];
entries[40] = 5; // row 5, column 5: same number as the given in square 0
entries[80] = 7;
const base: SudokuHighlightState = { selected: 0, entries, givens, conflicts: new Set(), paused: false, settings: allOn };
const has = (index: number, name: string, state: SudokuHighlightState = base) => sudokuCellClasses(index, state).includes(name);

describe('sudoku highlight classes (Christian, 2026-11-12)', () => {
  it('marks the selected square, and only it, as selected', () => {
    expect(has(0, 'is-selected')).toBe(true);
    expect(sudokuCellClasses(0, base).filter((name) => name === 'is-selected')).toHaveLength(1);
    expect(Array.from({ length: 81 }, (_, index) => has(index, 'is-selected')).filter(Boolean)).toHaveLength(1);
  });

  it('tints the whole row, column and 3 × 3 box of the selected square, but not the square itself', () => {
    for (const index of [1, 8, 9, 72]) expect(has(index, 'is-related'), `square ${index}`).toBe(true);
    for (const index of [10, 20]) expect(has(index, 'is-box-related'), `square ${index}`).toBe(true);
    expect(has(0, 'is-related')).toBe(false);
    expect(has(0, 'is-box-related')).toBe(false);
    for (const index of [30, 40, 80]) {
      expect(has(index, 'is-related')).toBe(false);
      expect(has(index, 'is-box-related')).toBe(false);
    }
    const tinted = Array.from({ length: 81 }, (_, index) => has(index, 'is-related') || has(index, 'is-box-related')).filter(Boolean);
    expect(tinted).toHaveLength(20); // 8 in the row + 8 in the column + 4 more in the box
  });

  it('marks every square holding the selected number, including the selected one', () => {
    expect(has(0, 'is-identical')).toBe(true);
    expect(has(40, 'is-identical')).toBe(true);
    expect(has(80, 'is-identical')).toBe(false);
    expect(has(1, 'is-identical')).toBe(false); // empty squares never match
  });

  it('marks nothing as identical when the selected square is empty', () => {
    const state = { ...base, selected: 1 };
    expect(Array.from({ length: 81 }, (_, index) => has(index, 'is-identical', state)).some(Boolean)).toBe(false);
  });

  it('keeps givens and entered numbers apart and keeps the conflict sign', () => {
    expect(has(0, 'is-given')).toBe(true);
    expect(has(40, 'is-entered')).toBe(true);
    expect(has(40, 'is-given')).toBe(false);
    const state = { ...base, conflicts: new Set([40]) };
    expect(has(40, 'is-conflict', state)).toBe(true);
    expect(has(40, 'is-conflict', { ...state, settings: { ...allOn, highlightConflicts: false } })).toBe(false);
  });

  it('follows each gameboard setting', () => {
    const off = { ...base, settings: { ...allOn, highlightRowColumn: false, highlightBox: false, highlightIdentical: false } };
    expect(has(1, 'is-related', off)).toBe(false);
    expect(has(10, 'is-box-related', off)).toBe(false);
    expect(has(40, 'is-identical', off)).toBe(false);
    expect(has(0, 'is-selected', off)).toBe(true);
  });

  it('shows no tint or match while paused, so the hidden board gives nothing away', () => {
    const paused = { ...base, paused: true };
    for (let index = 0; index < 81; index++) {
      expect(has(index, 'is-related', paused)).toBe(false);
      expect(has(index, 'is-box-related', paused)).toBe(false);
      expect(has(index, 'is-identical', paused)).toBe(false);
    }
  });

  it('draws the thick 3 × 3 box lines after columns 3 and 6 and rows 3 and 6', () => {
    expect(has(2, 'sudoku-box-right')).toBe(true);
    expect(has(5, 'sudoku-box-right')).toBe(true);
    expect(has(3, 'sudoku-box-right')).toBe(false);
    expect(has(18, 'sudoku-box-bottom')).toBe(true);
    expect(has(45, 'sudoku-box-bottom')).toBe(true);
  });
});
