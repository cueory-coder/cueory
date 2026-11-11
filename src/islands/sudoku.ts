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

const SIZE = 9;
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const TARGET_GIVENS: Record<Level, number> = { easy: 40, medium: 32, hard: 26 };

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
  const rows = shuffled([0, 1, 2, 3, 4, 5, 6, 7, 8], random);
  const columns = [...shuffled([0, 1, 2], random).flatMap((band) => shuffled([0, 1, 2], random).map((row) => band * 3 + row))];
  const digits = shuffled(DIGITS, random);
  return rows.flatMap((row) => columns.map((column) => digits[pattern(row, column)]!));
}

function peers(index: number) {
  const row = Math.floor(index / SIZE);
  const column = index % SIZE;
  const boxRow = Math.floor(row / 3) * 3;
  const boxColumn = Math.floor(column / 3) * 3;
  return new Set([
    ...Array.from({ length: SIZE }, (_, i) => row * SIZE + i),
    ...Array.from({ length: SIZE }, (_, i) => i * SIZE + column),
    ...Array.from({ length: 9 }, (_, i) => (boxRow + Math.floor(i / 3)) * SIZE + boxColumn + (i % 3)),
  ].filter((cell) => cell !== index));
}

function countSolutions(grid: Grid, limit = 2): number {
  const next = [...grid];
  const empty = next.findIndex((value) => value === 0);
  if (empty === -1) return 1;
  const choices = candidates(next, empty);
  let count = 0;
  for (const value of choices) {
    next[empty] = value;
    count += countSolutions(next, limit);
    next[empty] = 0;
    if (count >= limit) return count;
  }
  return count;
}

export function candidates(grid: Grid, index: number): number[] {
  if (grid[index] !== 0) return [];
  const used = new Set<number>();
  for (const peer of peers(index)) {
    if (grid[peer]) used.add(grid[peer]!);
  }
  return DIGITS.filter((digit) => !used.has(digit));
}

export function solve(grid: Grid): Grid | null {
  if (grid.length !== 81 || grid.some((value) => !Number.isInteger(value) || value < 0 || value > 9)) return null;
  if (conflicts(grid).size) return null;
  const next = [...grid];
  const empty = next.findIndex((value) => value === 0);
  if (empty === -1) return next;
  for (const value of candidates(next, empty)) {
    next[empty] = value;
    const solved = solve(next);
    if (solved) return solved;
    next[empty] = 0;
  }
  return null;
}

export function conflicts(grid: Grid): CellSet {
  const result = new Set<number>();
  const units = [
    ...Array.from({ length: 9 }, (_, row) => Array.from({ length: 9 }, (_, column) => row * 9 + column)),
    ...Array.from({ length: 9 }, (_, column) => Array.from({ length: 9 }, (_, row) => row * 9 + column)),
    ...Array.from({ length: 9 }, (_, box) => Array.from({ length: 9 }, (_, i) => (Math.floor(box / 3) * 3 + Math.floor(i / 3)) * 9 + (box % 3) * 3 + i % 3)),
  ];
  for (const unit of units) {
    const seen = new Map<number, number[]>();
    unit.forEach((cell) => {
      const value = grid[cell];
      if (value) seen.set(value, [...(seen.get(value) ?? []), cell]);
    });
    seen.forEach((cells) => { if (cells.length > 1) cells.forEach((cell) => result.add(cell)); });
  }
  return result;
}

export function validate(grid: Grid): SudokuValidation {
  const conflictCells = conflicts(grid);
  const invalid = new Set<number>(grid.map((value, index) => (value < 0 || value > 9 || !Number.isInteger(value) ? index : -1)).filter((index) => index >= 0));
  const candidateMap = new Map<number, number[]>();
  grid.forEach((value, index) => { if (value === 0) candidateMap.set(index, candidates(grid, index)); });
  const complete = grid.length === 81 && grid.every((value) => value > 0) && conflictCells.size === 0 && invalid.size === 0;
  return { valid: conflictCells.size === 0 && invalid.size === 0, complete, conflicts: conflictCells, invalid, candidates: candidateMap };
}

export function generatePuzzle(level: Level, seed: number): SudokuPuzzle {
  const solution = solutionFor(seed);
  const givens = [...solution];
  const random = rng(seed ^ 0x9e3779b9);
  const order = shuffled(Array.from({ length: 81 }, (_, index) => index), random);
  const target = TARGET_GIVENS[level];
  for (const index of order) {
    if (givens.filter(Boolean).length <= target) break;
    const previous = givens[index]!;
    givens[index] = 0;
    if (countSolutions(givens) !== 1) givens[index] = previous;
  }
  return { level, seed, givens, solution };
}

export function dailySeed(date = new Date(), level: Level = 'easy'): number {
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  const offset = level === 'easy' ? 17 : level === 'medium' ? 31 : 47;
  return Math.floor(day) + offset;
}

export function getResult(level: Level, elapsedSeconds: number, errors: number, solved: boolean, date = new Date()) {
  return { game: 'sudoku', level, day: date.toISOString().slice(0, 10), elapsedSeconds, errors, solved };
}

export const givenCounts = TARGET_GIVENS;
