import { site } from '../config/site';

export type Cell = [row: number, col: number];
export interface SuturePuzzle {
  id: string;
  sample: boolean;
  grid: string[];
  words: { cue: string; answer: string; path: Cell[] }[];
}
export interface SutureState {
  trace: Cell[];
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

export function parsePuzzle(data: unknown): SuturePuzzle {
  if (!record(data)) throw new Error('the puzzle must be an object.');
  if (typeof data.id !== 'string' || !data.id.trim() || data.id.length > 128) throw new Error('the puzzle needs a short id.');
  if (typeof data.sample !== 'boolean') throw new Error('the puzzle must say whether it is a sample.');
  if (!Array.isArray(data.grid) || data.grid.length < 3 || data.grid.length > 7) throw new Error('the grid must have 3 to 7 rows.');
  const grid = data.grid;
  if (grid.some((row) => typeof row !== 'string' || row.length < 3 || row.length > 7)) throw new Error('each row must have 3 to 7 letters.');
  if (grid.some((row) => row.length !== grid[0].length)) throw new Error('the grid rows must have equal lengths.');
  if (grid.some((row) => !/^[A-Z]+$/.test(row))) throw new Error('the grid must use only uppercase letters a to z.');
  if (!Array.isArray(data.words) || data.words.length < 3 || data.words.length > 6) throw new Error('the puzzle must have 3 to 6 words.');
  const words: SuturePuzzle['words'] = [];
  const occupied = new Set<string>();
  for (const item of data.words) {
    if (!record(item) || typeof item.cue !== 'string' || !item.cue.trim() || item.cue.length > 500) throw new Error('each word needs a short cue.');
    if (typeof item.answer !== 'string' || !/^[A-Z]{3,8}$/.test(item.answer)) throw new Error('each answer must have 3 to 8 uppercase letters.');
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
    if (path.map(([row, col]) => grid[row][col]).join('') !== item.answer) throw new Error('a path does not spell its answer.');
    words.push({ cue: item.cue.trim(), answer: item.answer, path });
  }
  return { id: data.id, sample: data.sample, grid: [...grid], words };
}

export function startSuture(puzzle: SuturePuzzle): SutureState {
  const parsed = parsePuzzle(puzzle);
  return { trace: [], found: [], looseStitches: 0, totalWords: parsed.words.length };
}

export function wordsLeft(state: SutureState): number { return state.totalWords - state.found.length; }
export function isDone(state: SutureState): boolean { return state.totalWords > 0 && wordsLeft(state) === 0; }

export function foundWord(state: SutureState, puzzle: SuturePuzzle, cell: Cell): number | undefined {
  const index = state.found.find((word) => puzzle.words[word]!.path.some((part) => same(part, cell)));
  return index === undefined ? undefined : index + 1;
}

export function tapCell(state: SutureState, puzzle: SuturePuzzle, cell: Cell): SutureState {
  const [row, col] = cell;
  if (isDone(state) || !Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= puzzle.grid.length || col >= puzzle.grid[0]!.length) return state;
  if (foundWord(state, puzzle, cell) !== undefined) return state;
  const last = state.trace.at(-1);
  if (last && same(last, cell)) return { ...state, trace: state.trace.slice(0, -1) };
  if (state.trace.some((part) => same(part, cell)) || (last && !touching(last, cell))) return state;
  return { ...state, trace: [...state.trace, [row, col]] };
}

export function clearTrace(state: SutureState): SutureState {
  return state.trace.length ? { ...state, trace: [] } : state;
}

export function stitch(state: SutureState, puzzle: SuturePuzzle): { state: SutureState; found: boolean; word?: number } {
  if (isDone(state) || !state.trace.length) return { state, found: false };
  const matches = (path: Cell[]) => path.length === state.trace.length && path.every((cell, i) => same(cell, state.trace[i]!));
  const index = puzzle.words.findIndex((word, i) => !state.found.includes(i) && (matches(word.path) || matches([...word.path].reverse())));
  if (index < 0) return { state: { ...state, trace: [], looseStitches: state.looseStitches + 1 }, found: false };
  return { state: { ...state, trace: [], found: [...state.found, index] }, found: true, word: index + 1 };
}

export function cellLabel(state: SutureState, puzzle: SuturePuzzle, cell: Cell): string {
  const [row, col] = cell;
  const word = foundWord(state, puzzle, cell);
  const trace = state.trace.findIndex((part) => same(part, cell));
  return `row ${row + 1}, column ${col + 1}, letter ${puzzle.grid[row]![col]}${word !== undefined ? `, in word ${word}` : trace >= 0 ? `, trace step ${trace + 1}` : ''}`;
}

export function traceInWords(state: SutureState, puzzle: SuturePuzzle): string {
  return state.trace.length ? `trace: ${state.trace.map(([row, col]) => puzzle.grid[row]![col]!.toLowerCase()).join(', ')}.` : 'no letters traced.';
}

export function shareLine(state: SutureState, dateLabel: string, gameName: string): string {
  const clean = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
  return `${site.wordmarkName} ${clean(gameName)}, ${clean(dateLabel)}: stitched ${state.found.length} of ${state.totalWords} words with ${state.looseStitches} loose ${state.looseStitches === 1 ? 'stitch' : 'stitches'}.`;
}
