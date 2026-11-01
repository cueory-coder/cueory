import { site } from '../config/site';

export type Cell = [row: number, col: number];
export interface SuturePuzzle {
  id: string;
  sample: boolean;
  /** Display title, shown as the puzzle heading. Optional to keep accepting old files. */
  theme?: string;
  grid: string[];
  words: { cue?: string; answer: string; path: Cell[] }[];
}
export interface SutureState {
  /** First endpoint the player selected; null when nothing is anchored. */
  anchor: Cell | null;
  /** Current second endpoint (updated by each click after the anchor is set). */
  cursor: Cell | null;
  /** Zero-based indexes into the puzzle's word list. */
  found: number[];
  looseStitches: number;
  totalWords: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const same = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1];
const touching = (a: Cell, b: Cell): boolean => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

/** Straight-line path (horizontal or vertical) between two cells, inclusive. Returns null when diagonal. */
export function pathBetween(from: Cell, to: Cell): Cell[] | null {
  const [r1, c1] = from;
  const [r2, c2] = to;
  if (r1 === r2) {
    const step = c2 >= c1 ? 1 : -1;
    const cells: Cell[] = [];
    for (let c = c1; step > 0 ? c <= c2 : c >= c2; c += step) cells.push([r1, c]);
    return cells;
  }
  if (c1 === c2) {
    const step = r2 >= r1 ? 1 : -1;
    const cells: Cell[] = [];
    for (let r = r1; step > 0 ? r <= r2 : r >= r2; r += step) cells.push([r, c1]);
    return cells;
  }
  return null;
}

export function parsePuzzle(data: unknown): SuturePuzzle {
  if (!record(data)) throw new Error('the puzzle must be an object.');
  if (typeof data.id !== 'string' || !data.id.trim() || data.id.length > 128) throw new Error('the puzzle needs a short id.');
  if (typeof data.sample !== 'boolean') throw new Error('the puzzle must say whether it is a sample.');
  if (data.theme !== undefined) {
    if (typeof data.theme !== 'string' || !data.theme.trim()) throw new Error('the theme must be a non-empty string.');
    if (data.theme.length > 60) throw new Error('the theme must be at most 60 characters.');
  }
  if (!Array.isArray(data.grid) || data.grid.length < 3 || data.grid.length > 11) throw new Error('the grid must have 3 to 11 rows.');
  const grid = data.grid;
  if (grid.some((row) => typeof row !== 'string' || row.length < 3 || row.length > 11)) throw new Error('each row must have 3 to 11 letters.');
  if (grid.some((row) => row.length !== grid[0].length)) throw new Error('the grid rows must have equal lengths.');
  if (grid.some((row) => !/^[A-Z]+$/.test(row))) throw new Error('the grid must use only uppercase letters a to z.');
  if (!Array.isArray(data.words) || data.words.length < 3 || data.words.length > 20) throw new Error('the puzzle must have 3 to 20 words.');
  const words: SuturePuzzle['words'] = [];
  const occupied = new Set<string>();
  for (const item of data.words) {
    if (!record(item)) throw new Error('each word must be an object.');
    if (item.cue !== undefined && (typeof item.cue !== 'string' || !item.cue.trim() || item.cue.length > 500)) throw new Error('each word cue must be a short non-empty string.');
    if (typeof item.answer !== 'string' || !/^[A-Z]{3,11}$/.test(item.answer)) throw new Error('each answer must have 3 to 11 uppercase letters.');
    if (!Array.isArray(item.path) || item.path.length !== item.answer.length) throw new Error('each path must have one cell per answer letter.');
    const path: Cell[] = [];
    const used = new Set<string>();
    for (const cell of item.path) {
      if (!Array.isArray(cell) || cell.length !== 2 || !cell.every(Number.isInteger)) throw new Error('each path cell needs a whole-number row and column.');
      const [row, col] = cell as Cell;
      if (row < 0 || col < 0 || row >= grid.length || col >= grid[0].length) throw new Error('a word path leaves the grid.');
      const key = `${row},${col}`;
      if (used.has(key)) throw new Error('a word path repeats a cell.');
      if (occupied.has(key)) throw new Error('two words share a cell.');
      if (path.length && !touching(path.at(-1)!, [row, col])) throw new Error('path steps must touch up, down, left or right, never diagonally.');
      used.add(key);
      occupied.add(key);
      path.push([row, col]);
    }
    if (path.length > 1) {
      const allSameRow = path.every(([r]) => r === path[0]![0]);
      const allSameCol = path.every(([, c]) => c === path[0]![1]);
      if (!allSameRow && !allSameCol) throw new Error('word paths must run in a straight line (all same row or all same column), never diagonally or with turns.');
    }
    if (path.map(([row, col]) => grid[row]![col]).join('') !== item.answer) throw new Error('a path does not spell its answer.');
    words.push({ ...(item.cue !== undefined ? { cue: String(item.cue).trim() } : {}), answer: item.answer, path });
  }
  const theme = data.theme !== undefined ? String(data.theme).trim() : undefined;
  return { id: data.id, sample: data.sample, ...(theme !== undefined ? { theme } : {}), grid: [...grid], words };
}

export function startSuture(puzzle: SuturePuzzle): SutureState {
  return { anchor: null, cursor: null, found: [], looseStitches: 0, totalWords: puzzle.words.length };
}

export function wordsLeft(state: SutureState): number { return state.totalWords - state.found.length; }
export function isDone(state: SutureState): boolean { return state.totalWords > 0 && wordsLeft(state) === 0; }

export function foundWord(state: SutureState, puzzle: SuturePuzzle, cell: Cell): number | undefined {
  const index = state.found.find((i) => puzzle.words[i]!.path.some((part) => same(part, cell)));
  return index === undefined ? undefined : index + 1;
}

/**
 * Tap a cell: if no anchor is set, set it. If anchor is the same cell, clear both.
 * Otherwise, update the cursor to this cell.
 */
export function tapCell(state: SutureState, puzzle: SuturePuzzle, cell: Cell): SutureState {
  const [row, col] = cell;
  if (isDone(state) || !Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= puzzle.grid.length || col >= puzzle.grid[0]!.length) return state;
  if (foundWord(state, puzzle, cell) !== undefined) return state;
  if (state.anchor === null) return { ...state, anchor: [row, col], cursor: [row, col] };
  if (same(state.anchor, cell)) return { ...state, anchor: null, cursor: null };
  return { ...state, cursor: [row, col] };
}

export function clearTrace(state: SutureState): SutureState {
  return (state.anchor || state.cursor) ? { ...state, anchor: null, cursor: null } : state;
}

/**
 * Stitch: check the straight-line path between anchor and cursor against the word list.
 * A path that matches a word (forward or reverse) scores a find. Otherwise a loose stitch.
 */
export function stitch(state: SutureState, puzzle: SuturePuzzle): { state: SutureState; found: boolean; word?: number } {
  if (isDone(state) || !state.anchor || !state.cursor) return { state, found: false };
  const path = same(state.anchor, state.cursor) ? null : pathBetween(state.anchor, state.cursor);
  if (!path) return { state: { ...state, anchor: null, cursor: null, looseStitches: state.looseStitches + 1 }, found: false };
  const letters = path.map(([r, c]) => puzzle.grid[r]![c]).join('');
  const matches = (word: { answer: string; path: Cell[] }, i: number) =>
    !state.found.includes(i) && (word.answer === letters || word.answer === [...letters].reverse().join(''));
  const index = puzzle.words.findIndex(matches);
  if (index < 0) return { state: { ...state, anchor: null, cursor: null, looseStitches: state.looseStitches + 1 }, found: false };
  return { state: { ...state, anchor: null, cursor: null, found: [...state.found, index] }, found: true, word: index + 1 };
}

export function cellLabel(state: SutureState, puzzle: SuturePuzzle, cell: Cell): string {
  const [row, col] = cell;
  const word = foundWord(state, puzzle, cell);
  const letter = puzzle.grid[row]![col];
  if (word !== undefined) return `row ${row + 1}, column ${col + 1}, letter ${letter}, in word ${word}`;
  const isAnchor = state.anchor && same(state.anchor, cell);
  const activePath = state.anchor && state.cursor && !same(state.anchor, state.cursor)
    ? pathBetween(state.anchor, state.cursor)
    : null;
  const inPath = activePath?.some((c) => same(c, cell)) ?? false;
  return `row ${row + 1}, column ${col + 1}, letter ${letter}${isAnchor ? ', selected first' : inPath ? ', highlighted' : ''}`;
}

export function traceInWords(state: SutureState, puzzle: SuturePuzzle): string {
  if (!state.anchor) return 'no letters selected.';
  const path = state.cursor && !same(state.anchor, state.cursor)
    ? pathBetween(state.anchor, state.cursor)
    : [state.anchor];
  if (!path) return 'words run up, down, left or right.';
  return `selected: ${path.map(([row, col]) => puzzle.grid[row]![col]!.toLowerCase()).join(', ')}.`;
}

export function shareLine(state: SutureState, dateLabel: string, gameName: string): string {
  const clean = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
  return `${site.wordmarkName} ${clean(gameName)}, ${clean(dateLabel)}: stitched ${state.found.length} of ${state.totalWords} words with ${state.looseStitches} loose ${state.looseStitches === 1 ? 'stitch' : 'stitches'}.`;
}
