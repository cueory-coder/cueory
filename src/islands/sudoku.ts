import { localDay } from './gameresults';

export type Level = 'easy' | 'medium' | 'hard';
export type Grid = number[];
export type CellSet = Set<number>;

export interface SudokuPuzzle {
  level: Level;
  seed: number;
  givens: Grid;
  solution: Grid;
}

export interface SudokuValidation {
  valid: boolean;
  complete: boolean;
  conflicts: CellSet;
  invalid: CellSet;
  candidates: Map<number, number[]>;
}

export interface SudokuSettings {
  checkOnEntry: boolean;
  showErrors: boolean;
  showTimer: boolean;
  highlightConflicts: boolean;
  highlightUnits: boolean;
  highlightBox: boolean;
  highlightSame: boolean;
  autoCandidates: boolean;
  showCandidates: boolean;
  playSoundOnSolve: boolean;
}

export const SUDOKU_SETTINGS_STORAGE_KEY = 'cueory-sudoku-settings-v1';
export const DEFAULT_SUDOKU_SETTINGS: Readonly<SudokuSettings> = Object.freeze({
  checkOnEntry: false,
  showErrors: true,
  showTimer: true,
  highlightConflicts: true,
  highlightUnits: true,
  highlightBox: true,
  highlightSame: true,
  autoCandidates: false,
  showCandidates: false,
  playSoundOnSolve: false,
});

export function parseSudokuSettings(raw: string | null | undefined): SudokuSettings {
  if (!raw) return { ...DEFAULT_SUDOKU_SETTINGS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SUDOKU_SETTINGS };
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || !record.settings || typeof record.settings !== 'object') return { ...DEFAULT_SUDOKU_SETTINGS };
    const saved = record.settings as Record<string, unknown>;
    return Object.keys(DEFAULT_SUDOKU_SETTINGS).reduce((settings, key) => {
      const defaultValue = DEFAULT_SUDOKU_SETTINGS[key as keyof SudokuSettings];
      const value = saved[key];
      settings[key as keyof SudokuSettings] = typeof value === 'boolean' ? value : defaultValue;
      return settings;
    }, {} as SudokuSettings);
  } catch {
    return { ...DEFAULT_SUDOKU_SETTINGS };
  }
}

export function serializeSudokuSettings(settings: SudokuSettings): string {
  const safe = parseSudokuSettings(JSON.stringify({ version: 1, settings }));
  return JSON.stringify({ version: 1, settings: safe });
}

const SIZE = 9;
const CELL_COUNT = SIZE * SIZE;
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const TARGET_GIVENS: Record<Level, number> = { easy: 40, medium: 32, hard: 26 };
const MAX_SEARCH_NODES = 250000;
const PEERS: readonly number[][] = Array.from({ length: CELL_COUNT }, (_, index) => {
  const row = Math.floor(index / SIZE);
  const column = index % SIZE;
  const boxRow = Math.floor(row / 3) * 3;
  const boxColumn = Math.floor(column / 3) * 3;
  return [...new Set([
    ...Array.from({ length: SIZE }, (_, i) => row * SIZE + i),
    ...Array.from({ length: SIZE }, (_, i) => i * SIZE + column),
    ...Array.from({ length: SIZE }, (_, i) => (boxRow + Math.floor(i / 3)) * SIZE + boxColumn + i % 3),
  ].filter((cell) => cell !== index))];
});

function rng(seed: number) {
  let value = (seed >>> 0) || 1;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values: number[], random: () => number) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function pattern(row: number, column: number) {
  return (row * 3 + Math.floor(row / 3) + column) % SIZE;
}

function solutionFor(seed: number): Grid {
  const random = rng(seed);
  const bands = shuffled([0, 1, 2], random);
  const rows = bands.flatMap((band) => shuffled([0, 1, 2], random).map((row) => band * 3 + row));
  const stacks = shuffled([0, 1, 2], random);
  const columns = stacks.flatMap((stack) => shuffled([0, 1, 2], random).map((column) => stack * 3 + column));
  const digits = shuffled(DIGITS, random);
  return rows.flatMap((row) => columns.map((column) => digits[pattern(row, column)]!));
}

function validCompleteGrid(grid: Grid): boolean {
  if (grid.length !== CELL_COUNT || grid.some((value) => !DIGITS.includes(value))) return false;
  return conflicts(grid).size === 0;
}

function countSolutions(grid: Grid, limit = 2, budget = { nodes: 0 }): number {
  if (++budget.nodes > MAX_SEARCH_NODES) return limit;
  let best = -1;
  let bestChoices: number[] = [];
  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (grid[index] !== 0) continue;
    const choices = candidates(grid, index);
    if (choices.length === 0) return 0;
    if (best === -1 || choices.length < bestChoices.length) {
      best = index;
      bestChoices = choices;
      if (choices.length === 1) break;
    }
  }
  if (best === -1) return 1;
  let count = 0;
  for (const value of bestChoices) {
    grid[best] = value;
    count += countSolutions(grid, limit, budget);
    grid[best] = 0;
    if (count >= limit) return count;
  }
  return count;
}

export function candidates(grid: Grid, index: number): number[] {
  if (grid[index] !== 0) return [];
  const used = new Set<number>();
  for (const peer of PEERS[index] ?? []) {
    const value = grid[peer];
    if (value) used.add(value);
  }
  return DIGITS.filter((digit) => !used.has(digit));
}

export function solve(grid: Grid): Grid | null {
  if (grid.length !== CELL_COUNT || grid.some((value) => !Number.isInteger(value) || value < 0 || value > 9)) return null;
  if (conflicts(grid).size) return null;
  const next = [...grid];
  let best = -1;
  let bestChoices: number[] = [];
  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (next[index] !== 0) continue;
    const choices = candidates(next, index);
    if (choices.length === 0) return null;
    if (best === -1 || choices.length < bestChoices.length) { best = index; bestChoices = choices; }
  }
  if (best === -1) return next;
  for (const value of bestChoices) {
    next[best] = value;
    const solved = solve(next);
    if (solved) return solved;
    next[best] = 0;
  }
  return null;
}

export function conflicts(grid: Grid): CellSet {
  const result = new Set<number>();
  const units = [
    ...Array.from({ length: SIZE }, (_, row) => Array.from({ length: SIZE }, (_, column) => row * SIZE + column)),
    ...Array.from({ length: SIZE }, (_, column) => Array.from({ length: SIZE }, (_, row) => row * SIZE + column)),
    ...Array.from({ length: SIZE }, (_, box) => Array.from({ length: SIZE }, (_, i) => (Math.floor(box / 3) * 3 + Math.floor(i / 3)) * SIZE + (box % 3) * 3 + i % 3)),
  ];
  for (const unit of units) {
    const seen = new Map<number, number[]>();
    for (const cell of unit) {
      const value = grid[cell];
      if (value) seen.set(value, [...(seen.get(value) ?? []), cell]);
    }
    for (const cells of seen.values()) if (cells.length > 1) cells.forEach((cell) => result.add(cell));
  }
  return result;
}

export function validate(grid: Grid): SudokuValidation {
  const invalid = new Set<number>(grid.map((value, index) => (value < 0 || value > 9 || !Number.isInteger(value) ? index : -1)).filter((index) => index >= 0));
  const conflictCells = conflicts(grid);
  const candidateMap = new Map<number, number[]>();
  grid.forEach((value, index) => { if (value === 0) candidateMap.set(index, candidates(grid, index)); });
  const complete = grid.length === CELL_COUNT && grid.every((value) => value > 0) && conflictCells.size === 0 && invalid.size === 0;
  return { valid: conflictCells.size === 0 && invalid.size === 0, complete, conflicts: conflictCells, invalid, candidates: candidateMap };
}

function buildPuzzle(level: Level, seed: number): SudokuPuzzle | null {
  const solution = solutionFor(seed);
  if (!validCompleteGrid(solution)) return null;
  const givens = [...solution];
  const random = rng(seed ^ 0x9e3779b9);
  const target = TARGET_GIVENS[level];
  for (const index of shuffled(Array.from({ length: CELL_COUNT }, (_, i) => i), random)) {
    if (givens.filter(Boolean).length <= target) break;
    const previous = givens[index]!;
    givens[index] = 0;
    if (countSolutions(givens) !== 1) givens[index] = previous;
  }
  return givens.filter(Boolean).length === target && countSolutions([...givens]) === 1
    ? { level, seed, givens, solution }
    : null;
}

export function generatePuzzle(level: Level, seed: number): SudokuPuzzle {
  const normalized = Number.isFinite(seed) ? Math.trunc(seed) : 1;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const attemptSeed = normalized + attempt * 0x45d9f3b;
    const puzzle = buildPuzzle(level, attemptSeed);
    if (puzzle) return puzzle;
  }
  const fallbackSeeds: Record<Level, number> = { easy: 17, medium: 31, hard: 47 };
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const puzzle = buildPuzzle(level, fallbackSeeds[level] + attempt);
    if (puzzle) return { ...puzzle, seed: normalized };
  }
  const solution = solutionFor(fallbackSeeds[level]);
  return { level, seed: normalized, givens: [...solution], solution };
}

export function dailySeed(date = new Date(), level: Level = 'easy'): number {
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  const offset = level === 'easy' ? 17 : level === 'medium' ? 31 : 47;
  return Math.floor(day) + offset;
}

export function getResult(level: Level, elapsedSeconds: number, errors: number, solved: boolean, date = new Date()) {
  return { game: 'sudoku', level, day: localDay(date), elapsedSeconds, errors, solved };
}

export const givenCounts = TARGET_GIVENS;
