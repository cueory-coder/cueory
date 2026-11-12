import { describe, expect, it } from 'vitest';
import { buildSudokuSheet, printGame, type PrintTarget } from '../../src/islands/gameprint';
import { generateSudoku, LEVEL_RULES, type SudokuLevel } from '../../src/islands/sudoku';
import { parsePuzzle, printableWords } from '../../src/islands/suture';

/** A stand-in window: records print calls and lets the test fire "afterprint". */
function fakeWindow() {
  const dataset: DOMStringMap = {};
  const after: Array<() => void> = [];
  const calls: string[] = [];
  const target: PrintTarget = {
    document: { documentElement: { dataset } },
    addEventListener: (_type, listener) => { after.push(listener); },
    print: () => { calls.push(dataset.printGame ?? ''); },
  };
  const finish = () => { for (const listener of after.splice(0)) listener(); };
  return { target, dataset, calls, finish };
}

describe('printGame (Task 641)', () => {
  it('marks the page with the game, then opens the print dialog', () => {
    const { target, dataset, calls } = fakeWindow();
    printGame('suture', target);
    expect(calls).toEqual(['suture']);
    expect(dataset.printGame).toBe('suture');
  });

  it('removes the mark once printing is over', () => {
    const { target, dataset, finish } = fakeWindow();
    printGame('suture', target);
    finish();
    expect(dataset.printGame).toBeUndefined();
  });

  it('leaves a newer game mark alone', () => {
    const { target, dataset, finish } = fakeWindow();
    printGame('suture', target);
    dataset.printGame = 'cueword';
    finish();
    expect(dataset.printGame).toBe('cueword');
  });
});

describe('printableWords (Task 641)', () => {
  const puzzle = parsePuzzle({
    id: 'small', sample: true, theme: 'everyday things',
    grid: ['CATS', 'GODU', 'XYZN', 'QRST'],
    words: [
      { answer: 'CAT', path: [[0, 0], [0, 1], [0, 2]] },
      { answer: 'DOG', path: [[1, 2], [1, 1], [1, 0]] },
      { answer: 'SUN', path: [[0, 3], [1, 3], [2, 3]] },
    ],
  });

  it('lists every word in the puzzle order, in capitals like the grid', () => {
    expect(printableWords(puzzle)).toEqual(['CAT', 'DOG', 'SUN']);
  });

  it('gives no paths, cues or found marks', () => {
    const withCue = { words: [{ cue: 'a pet', answer: 'CAT', path: [[0, 0], [0, 1], [0, 2]] as [number, number][] }] };
    expect(printableWords(withCue)).toEqual(['CAT']);
  });

  it('skips empty entries and is empty for no words', () => {
    expect(printableWords({ words: [] })).toEqual([]);
    expect(printableWords({ words: [{ answer: ' ', path: [] }] })).toEqual([]);
  });
});

describe('buildSudokuSheet (W08-3)', () => {
  it.each(['easy', 'medium', 'hard'] as const)('prints %s with only its givens, level and date', (level) => {
    const generated = generateSudoku('print-source', level);
    const prior = [...generated.puzzle];
    const sheet = buildSudokuSheet(generated.puzzle, level, '2026-11-01');
    expect(sheet.level).toBe(level);
    expect(sheet.day).toBe('2026-11-01');
    expect(sheet.rows).toHaveLength(9);
    expect(sheet.rows.every((row) => row.length === 9)).toBe(true);
    expect(sheet.rows.flat()).toEqual(generated.puzzle.map((digit) => digit ? String(digit) : ''));
    expect(sheet.rows.flat().filter(Boolean)).toHaveLength(LEVEL_RULES[level].givens);
    expect(generated.puzzle).toEqual(prior);
  });

  it('does not print a student's entry or the hidden solution', () => {
    const generated = generateSudoku('print-private', 'easy');
    const entries = [...generated.puzzle];
    const firstOpen = entries.findIndex((value) => value === 0);
    entries[firstOpen] = generated.solution[firstOpen]!;
    expect(entries[firstOpen]).not.toBe(0);
    const sheet = buildSudokuSheet(generated.puzzle, 'easy', '2026-11-01');
    expect(sheet.rows[Math.floor(firstOpen / 9)]![firstOpen % 9]).toBe('');
    expect(sheet.rows.flat().filter(Boolean)).toHaveLength(40);
  });

  it('refuses malformed grids, invalid levels and invalid day format', () => {
    const valid = generateSudoku('print-validation', 'medium').puzzle;
    expect(() => buildSudokuSheet([], 'medium', '2026-11-01')).toThrow();
    expect(() => buildSudokuSheet(valid.slice(1), 'medium', '2026-11-01')).toThrow();
    const invalid = [...valid]; invalid[0] = 10;
    expect(() => buildSudokuSheet(invalid, 'medium', '2026-11-01')).toThrow();
    expect(() => buildSudokuSheet(valid, 'other' as SudokuLevel, '2026-11-01')).toThrow();
    expect(() => buildSudokuSheet(valid, 'medium', 'not-a-day')).toThrow();
  });
});
