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


describe('Sudoku print sheet edge cases (W08-3)', () => {
  const source = generateSudoku('edge-case-print', 'medium').puzzle;

  it('accepts leap day, but rejects non-existent dates and year zero', () => {
    const leap = buildSudokuSheet(source, 'medium', '2028-02-29');
    expect(leap.day).toBe('2028-02-29');
    for (const day of ['2026-02-29', '2026-02-30', '2026-04-31', '2026-00-12', '2026-13-01',
      '2026-11-00', '0000-01-01', '2026-11-01T12:00:00', '2026-11-1']) {
      expect(() => buildSudokuSheet(source, 'medium', day), day).toThrow();
    }
  });

  it('rejects fractional, negative, NaN and missing numbers without changing the source', () => {
    const original = [...source];
    for (const invalidValue of [-1, 2.5, Number.NaN, undefined, '5']) {
      const altered = [...source];
      altered[0] = invalidValue as number;
      expect(() => buildSudokuSheet(altered, 'medium', '2026-11-01')).toThrow();
    }
    expect(source).toEqual(original);
  });

  it('repeatedly makes identical blank sheets without carrying any game state', () => {
    const first = buildSudokuSheet(source, 'medium', '2026-11-01');
    first.rows[0]![0] = 'changed in printed copy';
    const second = buildSudokuSheet(source, 'medium', '2026-11-01');
    expect(second.rows[0]![0]).toBe(source[0] ? String(source[0]) : '');
    expect(second.rows.flat().filter(Boolean)).toHaveLength(LEVEL_RULES.medium.givens);
  });
});
