import { describe, expect, it } from 'vitest';
import { printGame, type PrintTarget } from '../../src/islands/gameprint';
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
