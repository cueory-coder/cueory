import { site } from '../config/site';

/**
 * Word path (internal id suture, D-71), as a classic themed word search (Task 97, Christian's design 2026-11-01).
 * Each word runs in a straight line up, down, left or right (never diagonally). A student taps a word's first letter,
 * then its last letter; the letters between are filled in for them.
 */
export type Cell = [row: number, col: number];
export interface SuturePuzzle {
  id: string;
  sample: boolean;
  /** The puzzle's title (at most 60 characters). Every content file has one; older puzzles without it still parse. */
  theme?: string;
  grid: string[];
  /** The words are the list the student sees. A cue is optional and only kept so older files still parse. */
  words: { cue?: string; answer: string; path: Cell[] }[];
}
export interface SutureState {
  /** The first letter the student picked, or null when nothing is picked. */
  anchor: Cell | null;
  /** Where the selection currently ends (the hovered or keyboard-focused letter), for the highlight. */
  cursor: Cell | null;
  /** Zero-based indexes into the puzzle's word list, in the order they were found. */
  found: number[];
  /** Picks that were not a word in this puzzle. */
  misses: number;
  totalWords: number;
}
export type PickOutcome =
  | { kind: 'ignored' }
  | { kind: 'first' }
  | { kind: 'cleared' }
  | { kind: 'found'; word: number }
  | { kind: 'miss'; straight: boolean };

export const MAX_SIZE = 11;
export const MAX_WORDS = 20;
export const MAX_THEME = 60;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const same = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1];

/** The straight line of cells from one cell to another, both included, or null when they aren't in one row or column. */
export function pathBetween(from: Cell, to: Cell): Cell[] | null {
  if (from[0] !== to[0] && from[1] !== to[1]) return null;
  const length = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
  const step: Cell = [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1])];
  return Array.from({ length: length + 1 }, (_, i): Cell => [from[0] + step[0] * i, from[1] + step[1] * i]);
}

export function parsePuzzle(data: unknown): SuturePuzzle {
  if (!record(data)) throw new Error('the puzzle must be an object.');
  if (typeof data.id !== 'string' || !data.id.trim() || data.id.length > 128) throw new Error('the puzzle needs a short id.');
  if (typeof data.sample !== 'boolean') throw new Error('the puzzle must say whether it is a sample.');
  let theme: string | undefined;
  if (data.theme !== undefined) {
    if (typeof data.theme !== 'string' || !data.theme.trim()) throw new Error('the theme must be a few words.');
    theme = data.theme.trim();
    if (theme.length > MAX_THEME) throw new Error(`the theme must be at most ${MAX_THEME} characters.`);
  }
  if (!Array.isArray(data.grid) || data.grid.length < 3 || data.grid.length > MAX_SIZE) throw new Error(`the grid must have 3 to ${MAX_SIZE} rows.`);
  const grid = data.grid;
  if (grid.some((row) => typeof row !== 'string' || row.length < 3 || row.length > MAX_SIZE)) throw new Error(`each row must have 3 to ${MAX_SIZE} letters.`);
  if (grid.some((row) => row.length !== grid[0].length)) throw new Error('the grid rows must have equal lengths.');
  if (grid.some((row) => !/^[A-Z]+$/.test(row))) throw new Error('the grid must use only capital letters A to Z.');
  if (!Array.isArray(data.words) || data.words.length < 3 || data.words.length > MAX_WORDS) throw new Error(`the puzzle must have 3 to ${MAX_WORDS} words.`);
  const words: SuturePuzzle['words'] = [];
  const occupied = new Set<string>();
  for (const item of data.words) {
    if (!record(item)) throw new Error('each word must be an object.');
    if (item.cue !== undefined && (typeof item.cue !== 'string' || !item.cue.trim() || item.cue.length > 120)) throw new Error('a cue, when given, must be a short phrase.');
    if (typeof item.answer !== 'string' || !new RegExp(`^[A-Z]{3,${MAX_SIZE}}$`).test(item.answer)) throw new Error(`each word must have 3 to ${MAX_SIZE} capital letters.`);
    if (!Array.isArray(item.path) || item.path.length !== item.answer.length) throw new Error('each path must have one cell per letter.');
    const path: Cell[] = [];
    for (const cell of item.path) {
      if (!Array.isArray(cell) || cell.length !== 2 || !cell.every(Number.isInteger)) throw new Error('each path cell needs a whole-number row and column.');
      const [row, col] = cell as Cell;
      if (row < 0 || col < 0 || row >= grid.length || col >= grid[0].length) throw new Error('a word path leaves the grid.');
      const key = `${row},${col}`;
      if (occupied.has(key)) throw new Error('two words share a letter.');
      occupied.add(key);
      path.push([row, col]);
    }
    const line = pathBetween(path[0]!, path.at(-1)!);
    if (!line || line.length !== path.length || line.some((cell, i) => !same(cell, path[i]!))) {
      throw new Error('each word must run in a straight line up, down, left or right, never diagonally.');
    }
    if (path.map(([row, col]) => grid[row]![col]).join('') !== item.answer) throw new Error('a path does not spell its word.');
    words.push({ ...(typeof item.cue === 'string' ? { cue: item.cue.trim() } : {}), answer: item.answer, path });
  }
  return { id: data.id, sample: data.sample, ...(theme ? { theme } : {}), grid: [...grid], words };
}

export function startSuture(puzzle: SuturePuzzle): SutureState {
  return { anchor: null, cursor: null, found: [], misses: 0, totalWords: puzzle.words.length };
}

export function wordsLeft(state: SutureState): number { return state.totalWords - state.found.length; }
export function isDone(state: SutureState): boolean { return state.totalWords > 0 && wordsLeft(state) === 0; }

const inGrid = (puzzle: SuturePuzzle, [row, col]: Cell): boolean =>
  Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0 && row < puzzle.grid.length && col < puzzle.grid[0]!.length;

/** The one-based number of the found word that uses this letter, if any. */
export function foundWord(state: SutureState, puzzle: SuturePuzzle, cell: Cell): number | undefined {
  const index = state.found.find((i) => puzzle.words[i]!.path.some((part) => same(part, cell)));
  return index === undefined ? undefined : index + 1;
}

/** The letters the current selection covers: the straight line from the first pick to the cursor, or just the first pick. */
export function selection(state: SutureState): Cell[] {
  if (!state.anchor) return [];
  if (!state.cursor || same(state.anchor, state.cursor)) return [state.anchor];
  return pathBetween(state.anchor, state.cursor) ?? [state.anchor];
}

/** Move the end of the selection (hover or keyboard), so the letters in between highlight as the student goes. */
export function moveCursor(state: SutureState, puzzle: SuturePuzzle, cell: Cell): SutureState {
  if (!state.anchor || !inGrid(puzzle, cell) || (state.cursor && same(state.cursor, cell))) return state;
  return { ...state, cursor: [cell[0], cell[1]] };
}

export function clearPick(state: SutureState): SutureState {
  return state.anchor || state.cursor ? { ...state, anchor: null, cursor: null } : state;
}

/**
 * Pick a letter. The first pick marks a word's first letter; picking it again clears it. The second pick is the last
 * letter: if the straight line between the two is one of the words (either way round), it is found; if not, it is a miss.
 */
export function pick(state: SutureState, puzzle: SuturePuzzle, cell: Cell): { state: SutureState; outcome: PickOutcome } {
  if (isDone(state) || !inGrid(puzzle, cell)) return { state, outcome: { kind: 'ignored' } };
  const at: Cell = [cell[0], cell[1]];
  if (!state.anchor) {
    if (foundWord(state, puzzle, at) !== undefined) return { state, outcome: { kind: 'ignored' } };
    return { state: { ...state, anchor: at, cursor: at }, outcome: { kind: 'first' } };
  }
  if (same(state.anchor, at)) return { state: clearPick(state), outcome: { kind: 'cleared' } };
  const line = pathBetween(state.anchor, at);
  const cleared = { ...state, anchor: null, cursor: null };
  const index = line
    ? puzzle.words.findIndex((word, i) => !state.found.includes(i) && word.path.length === line.length &&
        (word.path.every((part, j) => same(part, line[j]!)) || word.path.every((part, j) => same(part, line[line.length - 1 - j]!))))
    : -1;
  if (index < 0) return { state: { ...cleared, misses: state.misses + 1 }, outcome: { kind: 'miss', straight: line !== null } };
  return { state: { ...cleared, found: [...state.found, index] }, outcome: { kind: 'found', word: index + 1 } };
}

/** What a screen reader hears for a letter: where it is, the letter, and whether it is picked or in a found word. */
export function cellLabel(state: SutureState, puzzle: SuturePuzzle, cell: Cell): string {
  const [row, col] = cell;
  const base = `row ${row + 1}, column ${col + 1}, ${puzzle.grid[row]![col]}`;
  const word = foundWord(state, puzzle, cell);
  if (word !== undefined) return `${base}, found: ${puzzle.words[word - 1]!.answer.toLowerCase()}`;
  if (state.anchor && same(state.anchor, cell)) return `${base}, first letter picked`;
  return base;
}

/** The plain-words line for what happened after a pick. */
export function outcomeInWords(state: SutureState, puzzle: SuturePuzzle, outcome: PickOutcome): string {
  switch (outcome.kind) {
    case 'first':
      return `first letter: ${puzzle.grid[state.anchor![0]]![state.anchor![1]]!.toLowerCase()}. now pick the last letter.`;
    case 'cleared':
      return 'pick cleared.';
    case 'found': {
      const line = `found: ${puzzle.words[outcome.word - 1]!.answer.toLowerCase()}, ${state.found.length} of ${state.totalWords}.`;
      return isDone(state) ? `${line} all words found.` : line;
    }
    case 'miss':
      return outcome.straight ? 'not a word in this puzzle.' : 'not a word in this puzzle. words run up, down, left or right.';
    default:
      return '';
  }
}

/** The result as plain words: no grid of squares or circles, nothing that copies another game's share format. */
export function shareLine(state: SutureState, dateLabel: string, gameName: string): string {
  const clean = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
  return `${site.wordmarkName} ${clean(gameName)}, ${clean(dateLabel)}: found ${state.found.length} of ${state.totalWords} words with ${state.misses} wrong ${state.misses === 1 ? 'pick' : 'picks'}.`;
}
