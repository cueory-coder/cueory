import { site } from '../config/site';

export type Direction = 'across' | 'down';
export type CellMark = 'right' | 'wrong' | 'empty';
export interface CuewordPuzzle {
  id: string;
  sample: boolean;
  grid: string[];
  clues: { across: { number: number; text: string }[]; down: { number: number; text: string }[] };
}
export interface CuewordWord {
  number: number;
  direction: Direction;
  /** Zero-based indexes in the flattened grid, including gaps. */
  cells: number[];
  answer: string;
}
export interface CuewordState {
  puzzle: CuewordPuzzle;
  entries: string[];
  cell: number;
  direction: Direction;
  cued: number[];
  checks: (CellMark | undefined)[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Standard numbering: scan starting cells left to right, top to bottom, sharing a number at crossings. */
function structure(grid: readonly string[]): { numbers: (number | null)[]; words: CuewordWord[] } {
  const width = grid[0]!.length;
  const numbers: (number | null)[] = Array(grid.length * width).fill(null);
  const found: CuewordWord[] = [];
  let next = 1;
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < width; col++) {
      if (grid[row]![col] === '.') continue;
      const across = (col === 0 || grid[row]![col - 1] === '.') && col + 1 < width && grid[row]![col + 1] !== '.';
      const down = (row === 0 || grid[row - 1]![col] === '.') && row + 1 < grid.length && grid[row + 1]![col] !== '.';
      if (!across && !down) continue;
      const number = next++;
      numbers[row * width + col] = number;
      for (const direction of ['across', 'down'] as const) {
        if (!(direction === 'across' ? across : down)) continue;
        const cells: number[] = [];
        let r = row, c = col;
        while (r < grid.length && c < width && grid[r]![c] !== '.') {
          cells.push(r * width + c);
          if (direction === 'across') c++;
          else r++;
        }
        found.push({ number, direction, cells, answer: cells.map((cell) => grid[Math.floor(cell / width)]![cell % width]).join('') });
      }
    }
  }
  found.sort((a, b) => a.direction === b.direction ? a.number - b.number : a.direction === 'across' ? -1 : 1);
  return { numbers, words: found };
}

export function parsePuzzle(data: unknown): CuewordPuzzle {
  if (!record(data)) throw new Error('the puzzle must be an object.');
  if (typeof data.id !== 'string' || !data.id.trim() || data.id.length > 128) throw new Error('the puzzle needs a short id.');
  if (typeof data.sample !== 'boolean') throw new Error('the puzzle must say whether it is a sample.');
  if (!Array.isArray(data.grid) || data.grid.length < 3 || data.grid.length > 15) throw new Error('the grid must have 3 to 15 rows.');
  const grid = data.grid;
  if (grid.some((row) => typeof row !== 'string' || row.length < 3 || row.length > 15)) throw new Error('each row must have 3 to 15 cells.');
  if (grid.some((row) => row.length !== grid[0].length)) throw new Error('the grid rows must have equal lengths.');
  if (grid.some((row) => !/^[A-Z.]+$/.test(row))) throw new Error('use a to z in uppercase, or a dot for a gap.');
  const { words: found } = structure(grid);
  const covered = new Set(found.flatMap((word) => word.cells));
  const letters = grid.join('');
  if (!covered.size) throw new Error('the grid must contain a word.');
  if (found.some((word) => word.cells.length < 3)) throw new Error('every entry must have at least three letters.');
  if ([...letters].some((letter, cell) => letter !== '.' && !covered.has(cell))) {
    throw new Error('a one-letter run must cross a word in the other direction.');
  }
  if (!record(data.clues)) throw new Error('the puzzle needs across and down clues.');
  const clues: CuewordPuzzle['clues'] = { across: [], down: [] };
  for (const direction of ['across', 'down'] as const) {
    const items = data.clues[direction];
    if (!Array.isArray(items) || items.length > 49) throw new Error(`the ${direction} clues must be a list.`);
    const expected = new Set(found.filter((word) => word.direction === direction).map((word) => word.number));
    const seen = new Set<number>();
    for (const item of items) {
      if (!record(item) || !Number.isInteger(item.number) || typeof item.number !== 'number' || item.number < 1) {
        throw new Error(`each ${direction} clue needs a whole-number label.`);
      }
      if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > 500) throw new Error('each clue needs short, nonempty text.');
      if (!expected.has(item.number)) throw new Error(`an extra ${direction} clue has no word with that number.`);
      if (seen.has(item.number)) throw new Error(`a ${direction} word has more than one clue.`);
      seen.add(item.number);
      clues[direction].push({ number: item.number, text: item.text.trim() });
    }
    if (seen.size !== expected.size) throw new Error(`a ${direction} word is missing its clue.`);
  }
  return { id: data.id, sample: data.sample, grid: [...grid], clues };
}

export function numbering(puzzle: CuewordPuzzle): (number | null)[][] {
  const flat = structure(puzzle.grid).numbers;
  const width = puzzle.grid[0]!.length;
  return puzzle.grid.map((_, row) => flat.slice(row * width, (row + 1) * width));
}

export function words(puzzle: CuewordPuzzle): CuewordWord[] {
  return structure(puzzle.grid).words;
}

function playable(state: CuewordState, cell: number): boolean {
  return Number.isInteger(cell) && cell >= 0 && cell < state.entries.length && state.puzzle.grid.join('')[cell] !== '.';
}

export function currentWord(state: CuewordState): CuewordWord {
  return words(state.puzzle).find((word) => word.direction === state.direction && word.cells.includes(state.cell))!;
}

export function selectCell(state: CuewordState, cell: number, direction = state.direction): CuewordState {
  if (!playable(state, cell)) return state;
  const options = words(state.puzzle).filter((word) => word.cells.includes(cell));
  return { ...state, cell, direction: options.find((word) => word.direction === direction)?.direction ?? options[0]!.direction };
}

export function emptyState(puzzle: CuewordPuzzle): CuewordState {
  const parsed = parsePuzzle(puzzle);
  const first = words(parsed)[0]!;
  const count = parsed.grid.length * parsed.grid[0]!.length;
  return { puzzle: parsed, entries: Array(count).fill(''), cell: first.cells[0]!, direction: first.direction, cued: [], checks: Array(count).fill(undefined) };
}

/** Move along one row or column, passing over gaps and stopping at the edge. */
function step(state: CuewordState, direction: Direction, delta: -1 | 1): CuewordState {
  const width = state.puzzle.grid[0]!.length;
  let row = Math.floor(state.cell / width), col = state.cell % width;
  while (true) {
    if (direction === 'across') col += delta;
    else row += delta;
    if (row < 0 || col < 0 || row >= state.puzzle.grid.length || col >= width) return state;
    const cell = row * width + col;
    if (playable(state, cell)) return selectCell(state, cell, direction);
  }
}

export function type(state: CuewordState, letter: string): CuewordState {
  if (!/^[a-z]$/i.test(letter) || isSolved(state)) return state;
  // A cued letter is locked. Typing on one moves on and types into the next open cell in the same direction, so the
  // letter is never dropped (the director's review of #51); at the end of the row or column, nothing changes.
  let at = state;
  while (at.cued.includes(at.cell)) {
    const next = step(at, at.direction, 1);
    if (next.cell === at.cell) return state;
    at = next;
  }
  const entries = [...at.entries], checks = [...at.checks];
  entries[at.cell] = letter.toUpperCase();
  checks[at.cell] = undefined;
  return step({ ...at, entries, checks }, at.direction, 1);
}

export function erase(state: CuewordState): CuewordState {
  if (isSolved(state)) return state;
  const entries = [...state.entries], checks = [...state.checks];
  if (!state.cued.includes(state.cell)) {
    entries[state.cell] = '';
    checks[state.cell] = undefined;
  }
  return step({ ...state, entries, checks }, state.direction, -1);
}

export function move(state: CuewordState, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'): CuewordState {
  return step(state, key === 'ArrowLeft' || key === 'ArrowRight' ? 'across' : 'down', key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1);
}

export function toggleDirection(state: CuewordState): CuewordState {
  return selectCell(state, state.cell, state.direction === 'across' ? 'down' : 'across');
}

function changeWord(state: CuewordState, delta: -1 | 1): CuewordState {
  const list = words(state.puzzle);
  const word = currentWord(state);
  const index = list.findIndex((candidate) => candidate.number === word.number && candidate.direction === word.direction);
  const next = list[(index + delta + list.length) % list.length]!;
  return selectCell(state, next.cells[0]!, next.direction);
}
export const nextWord = (state: CuewordState): CuewordState => changeWord(state, 1);
export const previousWord = (state: CuewordState): CuewordState => changeWord(state, -1);

function mark(state: CuewordState, cell: number): CellMark {
  const answer = state.puzzle.grid.join('')[cell];
  return !state.entries[cell] ? 'empty' : state.entries[cell] === answer ? 'right' : 'wrong';
}

export function checkWord(state: CuewordState, word = currentWord(state)): CuewordState {
  const checks = [...state.checks];
  for (const cell of word.cells) checks[cell] = mark(state, cell);
  return { ...state, checks };
}

export function checkAll(state: CuewordState): CuewordState {
  return { ...state, checks: state.entries.map((_, cell) => playable(state, cell) ? mark(state, cell) : undefined) };
}

export function isSolved(state: CuewordState): boolean {
  return [...state.puzzle.grid.join('')].every((answer, cell) => answer === '.' || state.entries[cell] === answer);
}

export function revealCue(state: CuewordState, cell: number): CuewordState {
  if (!playable(state, cell) || state.cued.length >= 3 || state.cued.includes(cell) || isSolved(state)) return state;
  const entries = [...state.entries], checks = [...state.checks];
  entries[cell] = state.puzzle.grid.join('')[cell]!;
  checks[cell] = 'right';
  return { ...state, entries, checks, cued: [...state.cued, cell] };
}

export function shareLine(result: { solved: boolean; seconds: number; cues: number }, dateLabel: string, gameName: string): string {
  const seconds = Math.max(0, Math.floor(result.seconds));
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const day = dateLabel.replace(/\s+/g, ' ').trim().toLowerCase();
  const name = gameName.replace(/\s+/g, ' ').trim().toLowerCase();
  return `${site.wordmarkName} ${name}, ${day}: ${result.solved ? `solved in ${time}` : 'not solved this time'} with ${result.cues} ${result.cues === 1 ? 'cue' : 'cues'}.`;
}
