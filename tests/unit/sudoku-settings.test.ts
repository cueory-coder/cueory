import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUDOKU_SETTINGS,
  SUDOKU_SETTINGS_KEY,
  applySudokuEdit,
  generateSudoku,
  loadSudokuSettings,
  parseSudokuSettings,
  saveSudokuSettings,
  sudokuKeyAction,
} from '../../src/islands/sudoku';

describe('Sudoku saved settings (W08)', () => {
  it('uses all-on defaults except auto candidates for missing and unreadable records', () => {
    expect(DEFAULT_SUDOKU_SETTINGS.autoCandidates).toBe(false);
    expect(Object.entries(DEFAULT_SUDOKU_SETTINGS).every(([key, value]) => key === 'autoCandidates' || value === true)).toBe(true);
    for (const saved of [null, '', '{', 'null', '[]', '42', '"old"', '{}']) {
      expect(parseSudokuSettings(saved)).toEqual(DEFAULT_SUDOKU_SETTINGS);
    }
  });

  it('resets partial, obsolete, or incorrectly typed settings completely', () => {
    for (const saved of [
      JSON.stringify({ showTimer: false }),
      JSON.stringify({ ...DEFAULT_SUDOKU_SETTINGS, legacySetting: false }),
      JSON.stringify({ ...DEFAULT_SUDOKU_SETTINGS, showTimer: 'false' }),
      JSON.stringify({ ...DEFAULT_SUDOKU_SETTINGS, playSound: null }),
    ]) {
      expect(parseSudokuSettings(saved)).toEqual(DEFAULT_SUDOKU_SETTINGS);
    }
  });

  it('round-trips a complete valid record without changing preferences', () => {
    const custom = { ...DEFAULT_SUDOKU_SETTINGS, showTimer: false, playSound: false, autoCandidates: true };
    let storedKey = '';
    let storedValue = '';
    saveSudokuSettings({ setItem(key, value) { storedKey = key; storedValue = value; } }, custom);
    expect(storedKey).toBe(SUDOKU_SETTINGS_KEY);
    expect(loadSudokuSettings({ getItem(key) { expect(key).toBe(SUDOKU_SETTINGS_KEY); return storedValue; } })).toEqual(custom);
  });

  it('does not throw or share mutable defaults if storage is blocked', () => {
    const fresh = loadSudokuSettings(undefined);
    fresh.playSound = false;
    expect(loadSudokuSettings(undefined)).toEqual(DEFAULT_SUDOKU_SETTINGS);
    expect(loadSudokuSettings({ getItem() { throw new Error('blocked'); } })).toEqual(DEFAULT_SUDOKU_SETTINGS);
    expect(() => saveSudokuSettings(undefined, { ...DEFAULT_SUDOKU_SETTINGS })).not.toThrow();
    expect(() => saveSudokuSettings({ setItem() { throw new Error('blocked'); } }, { ...DEFAULT_SUDOKU_SETTINGS })).not.toThrow();
  });
});

describe('Sudoku keyboard and pad parity (W08)', () => {
  it('stops consistently at edges and moves one cell where allowed', () => {
    expect(sudokuKeyAction('ArrowUp', 0)).toEqual({ kind: 'select', index: 0 });
    expect(sudokuKeyAction('ArrowLeft', 0)).toEqual({ kind: 'select', index: 0 });
    expect(sudokuKeyAction('ArrowRight', 8)).toEqual({ kind: 'select', index: 8 });
    expect(sudokuKeyAction('ArrowDown', 80)).toEqual({ kind: 'select', index: 80 });
    expect(sudokuKeyAction('ArrowRight', 7)).toEqual({ kind: 'select', index: 8 });
    expect(sudokuKeyAction('ArrowDown', 0)).toEqual({ kind: 'select', index: 9 });
    expect(sudokuKeyAction('ArrowUp', 9)).toEqual({ kind: 'select', index: 0 });
    expect(sudokuKeyAction('ArrowLeft', 9)).toEqual({ kind: 'select', index: 9 });
    expect(sudokuKeyAction('ArrowRight', 9)).toEqual({ kind: 'select', index: 10 });
    expect(sudokuKeyAction('ArrowDown', 71)).toEqual({ kind: 'select', index: 80 });
  });

  it('maps number keys and every x/clear key to the same actions used by pad buttons', () => {
    const game = generateSudoku('W08-keyboard-pad', 'easy');
    const selected = game.puzzle.indexOf(0);
    const keyboardNumber = sudokuKeyAction('7', selected);
    expect(keyboardNumber).toEqual({ kind: 'enter', value: 7 });
    if (!keyboardNumber || keyboardNumber.kind === 'select') throw new Error('Expected Sudoku edit');
    const fromKeyboard = applySudokuEdit(game.puzzle, game.puzzle, new Set(), selected, keyboardNumber);
    const fromPad = applySudokuEdit(game.puzzle, game.puzzle, new Set(), selected, { kind: 'enter', value: 7 });
    expect(fromKeyboard).toEqual(fromPad);
    expect(fromKeyboard?.entries[selected]).toBe(7);

    for (const key of ['x', 'X', 'Backspace', 'Delete']) {
      const keyboardMark = sudokuKeyAction(key, selected);
      expect(keyboardMark).toEqual({ kind: 'mark' });
      if (!keyboardMark || keyboardMark.kind === 'select') throw new Error('Expected Sudoku mark');
      expect(applySudokuEdit(game.puzzle, game.puzzle, new Set(), selected, keyboardMark))
        .toEqual(applySudokuEdit(game.puzzle, game.puzzle, new Set(), selected, { kind: 'mark' }));
    }
  });

  it('toggles x marks, clears them on number entry, and protects given cells', () => {
    const givens = Array<number>(81).fill(0);
    givens[0] = 5;
    const first = applySudokuEdit(givens, givens, new Set(), 1, { kind: 'mark' });
    expect(first?.marks.has(1)).toBe(true);
    const removed = applySudokuEdit(first!.entries, givens, first!.marks, 1, { kind: 'mark' });
    expect(removed?.marks.has(1)).toBe(false);
    expect(removed?.markRemoved).toBe(true);
    const entered = applySudokuEdit(first!.entries, givens, first!.marks, 1, { kind: 'enter', value: 3 });
    expect(entered?.entries[1]).toBe(3);
    expect(entered?.marks.has(1)).toBe(false);
    expect(applySudokuEdit(givens, givens, new Set(), 0, { kind: 'enter', value: 1 })).toBeUndefined();
    expect(applySudokuEdit(givens, givens, new Set(), 0, { kind: 'mark' })).toBeUndefined();
    expect(givens[0]).toBe(5);
  });

  it('ignores unexpected keys, invalid selections, and out-of-range numbers', () => {
    expect(sudokuKeyAction('0', 1)).toBeUndefined();
    expect(sudokuKeyAction('Enter', 1)).toBeUndefined();
    expect(sudokuKeyAction('1', -1)).toBeUndefined();
    expect(sudokuKeyAction('1', 81)).toBeUndefined();
    const empty = Array<number>(81).fill(0);
    expect(applySudokuEdit(empty, empty, new Set(), 1, { kind: 'enter', value: 0 })).toBeUndefined();
    expect(applySudokuEdit(empty, empty, new Set(), 1, { kind: 'enter', value: 10 })).toBeUndefined();
    expect(applySudokuEdit(empty, empty, new Set(), -1, { kind: 'mark' })).toBeUndefined();
  });
});
