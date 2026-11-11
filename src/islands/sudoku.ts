/**
 * Pure Sudoku rules for the daily game (Task 625). The templates contain only numbers and no clinical content.
 *
 * Difficulty rule:
 * - easy: 40 givens, tuned for direct singles;
 * - medium: 32 givens, tuned for naked/hidden singles and candidate elimination;
 * - hard: 26 givens, unique but intentionally sparse enough to require search.
 *
 * A seed permutes digits, bands, rows, stacks and columns without changing a template's solution count or technique
 * band. The same day and level therefore produce the same puzzle for everyone.
 */
export type SudokuLevel = 'easy' | 'medium' | 'hard';
export type SudokuGrid = readonly number[];
export type SudokuTechnique = 'naked singles' | 'hidden singles' | 'search';

export const LEVEL_RULES: Readonly<Record<SudokuLevel, { givens: number; technique: string }>> = {
  easy: { givens: 40, technique: 'direct singles' },
  medium: { givens: 32, technique: 'naked and hidden singles, then candidate elimination' },
  hard: { givens: 26, technique: 'candidate elimination and search' },
};

const SIZE = 9;
const CELLS = SIZE * SIZE;
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function readGrid(text: string): number[] {
  const values = [...text.replace(/\s/g, '')].map(Number);
  if (values.length !== CELLS || values.some((value) => !Number.isInteger(value) || value < 0 || value > 9)) {
    throw new Error('Sudoku template must contain 81 digits.');
  }
  return values;
}

const STANDARD_SOLUTION = readGrid(`
534678912
672195348
198342567
859761423
426853791
713924856
961537284
287419635
345286179`);

const STANDARD_PUZZLE = readGrid(`
530070000
600195000
098000060
800060003
400803001
700020006
060000280
000419005
000080079`);

const HARD_SOLUTION = readGrid(`
693784512
487512936
125963874
932651487
568247391
741398625
319475268
856129743
274836159`);

const HARD_PUZZLE = readGrid(`
093700000
007000906
000063070
030051000
060000001
700000000
000005208
050109000
074030150`);

function withAddedGivens(puzzle: number[], solution: number[], indices: readonly number[]): number[] {
  const next = [...puzzle];
  for (const index of indices) next[index] = solution[index]!;
  return next;
}

const TEMPLATES: Readonly<Record<SudokuLevel, { puzzle: number[]; solution: number[] }>> = {
  easy: {
    puzzle: withAddedGivens(STANDARD_PUZZLE, STANDARD_SOLUTION, [2, 3, 5, 6, 7, 8, 10, 11, 15, 16]),
    solution: STANDARD_SOLUTION,
  },
  medium: {
    puzzle: withAddedGivens(STANDARD_PUZZLE, STANDARD_SOLUTION, [2, 3]),
    solution: STANDARD_SOLUTION,
  },
  hard: {
    puzzle: HARD_PUZZLE,
    solution: HARD_SOLUTION,
  },
};

function hash(text: string): number {
  let value = 2166136261;
  for (const character of text) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function random(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(values: readonly T[], next: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(next() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

function transform(template: SudokuGrid, seed: string): number[] {
  const next = random(hash(seed));
  const digitOrder = shuffle(DIGITS, next);
  const digitMap = [0, ...digitOrder];
  const rowBands = shuffle([0, 1, 2], next);
  const rows = rowBands.flatMap((band) => shuffle([0, 1, 2], next).map((row) => band * 3 + row));
  const columnStacks = shuffle([0, 1, 2], next);
  const columns = columnStacks.flatMap((stack) => shuffle([0, 1, 2], next).map((column) => stack * 3 + column));
  const transpose = next() >= 0.5;
  const result = Array<number>(CELLS).fill(0);
  for (let row = 0; row < SIZE; row++) {
    for (let column = 0; column < SIZE; column++) {
      const sourceRow = transpose ? rows[column]! : rows[row]!;
      const sourceColumn = transpose ? columns[row]! : columns[column]!;
      result[row * SIZE + column] = digitMap[template[sourceRow * SIZE + sourceColumn]!]!;
    }
  }
  return result;
}

export interface SudokuPuzzle {
  level: SudokuLevel;
  seed: string;
  puzzle: number[];
  solution: number[];
  givens: number;
  technique: SudokuTechnique;
}

export function generateSudoku(seed: string, level: SudokuLevel): SudokuPuzzle {
  const template = TEMPLATES[level];
  const puzzle = transform(template.puzzle, `${seed}:${level}`);
  const solution = transform(template.solution, `${seed}:${level}`);
  return {
    level,
    seed,
    puzzle,
    solution,
    givens: puzzle.filter(Boolean).length,
    technique: solvingTechnique(puzzle),
  };
}

export function dailySudokuSeed(day: string, level: SudokuLevel): string {
  return `cueory-sudoku:${day}:${level}`;
}

function peers(index: number): number[] {
  const row = Math.floor(index / SIZE);
  const column = index % SIZE;
  const boxRow = Math.floor(row / 3) * 3;
  const boxColumn = Math.floor(column / 3) * 3;
  const values = new Set<number>();
  for (let offset = 0; offset < SIZE; offset++) {
    values.add(row * SIZE + offset);
    values.add(offset * SIZE + column);
  }
  for (let rowOffset = 0; rowOffset < 3; rowOffset++) {
    for (let columnOffset = 0; columnOffset < 3; columnOffset++) {
      values.add((boxRow + rowOffset) * SIZE + boxColumn + columnOffset);
    }
  }
  values.delete(index);
  return [...values];
}

export function candidates(grid: SudokuGrid, index: number): number[] {
  if (grid.length !== CELLS || index < 0 || index >= CELLS || grid[index]) return [];
  const used = new Set(peers(index).map((peer) => grid[peer]).filter(Boolean));
  return DIGITS.filter((digit) => !used.has(digit));
}

export function conflictIndices(grid: SudokuGrid): number[] {
  if (grid.length !== CELLS) return [];
  const conflicts = new Set<number>();
  for (let index = 0; index < CELLS; index++) {
    const value = grid[index];
    if (!value) continue;
    for (const peer of peers(index)) {
      if (grid[peer] === value) {
        conflicts.add(index);
        conflicts.add(peer);
      }
    }
  }
  return [...conflicts].sort((a, b) => a - b);
}

export function isCompleteAndValid(grid: SudokuGrid): boolean {
  return grid.length === CELLS && grid.every((value) => value >= 1 && value <= 9) && conflictIndices(grid).length === 0;
}

function bestEmpty(grid: number[]): { index: number; values: number[] } | undefined {
  let best: { index: number; values: number[] } | undefined;
  for (let index = 0; index < CELLS; index++) {
    if (grid[index]) continue;
    const values = candidates(grid, index);
    if (values.length === 0) return { index, values };
    if (!best || values.length < best.values.length) best = { index, values };
    if (values.length === 1) break;
  }
  return best;
}

export function solveSudoku(input: SudokuGrid): number[] | undefined {
  if (input.length !== CELLS || input.some((value) => !Number.isInteger(value) || value < 0 || value > 9) || conflictIndices(input).length) return;
  const grid = [...input];
  const visit = (): boolean => {
    const empty = bestEmpty(grid);
    if (!empty) return true;
    for (const value of empty.values) {
      grid[empty.index] = value;
      if (visit()) return true;
    }
    grid[empty.index] = 0;
    return false;
  };
  return visit() ? grid : undefined;
}

export function countSolutions(input: SudokuGrid, limit = 2): number {
  if (input.length !== CELLS || conflictIndices(input).length) return 0;
  const grid = [...input];
  let count = 0;
  const visit = () => {
    if (count >= limit) return;
    const empty = bestEmpty(grid);
    if (!empty) {
      count++;
      return;
    }
    for (const value of empty.values) {
      grid[empty.index] = value;
      visit();
      if (count >= limit) break;
    }
    grid[empty.index] = 0;
  };
  visit();
  return count;
}

function singlesSolve(input: SudokuGrid, hidden: boolean): boolean {
  const grid = [...input];
  while (true) {
    let changed = false;
    for (let index = 0; index < CELLS; index++) {
      if (grid[index]) continue;
      const values = candidates(grid, index);
      if (values.length === 0) return false;
      if (values.length === 1) {
        grid[index] = values[0]!;
        changed = true;
      }
    }
    if (changed) continue;
    if (!hidden) break;
    const units: number[][] = [];
    for (let row = 0; row < SIZE; row++) units.push(Array.from({ length: SIZE }, (_, column) => row * SIZE + column));
    for (let column = 0; column < SIZE; column++) units.push(Array.from({ length: SIZE }, (_, row) => row * SIZE + column));
    for (let boxRow = 0; boxRow < 3; boxRow++) {
      for (let boxColumn = 0; boxColumn < 3; boxColumn++) {
        units.push(Array.from({ length: SIZE }, (_, offset) => (boxRow * 3 + Math.floor(offset / 3)) * SIZE + boxColumn * 3 + (offset % 3)));
      }
    }
    for (const unit of units) {
      for (const digit of DIGITS) {
        const cells = unit.filter((index) => !grid[index] && candidates(grid, index).includes(digit));
        if (cells.length === 1) {
          grid[cells[0]!] = digit;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return isCompleteAndValid(grid);
}

export function solvingTechnique(grid: SudokuGrid): SudokuTechnique {
  if (singlesSolve(grid, false)) return 'naked singles';
  if (singlesSolve(grid, true)) return 'hidden singles';
  return 'search';
}

export interface SudokuResult {
  game: 'sudoku';
  day: string;
  level: SudokuLevel;
  solved: boolean;
  seconds: number;
  time: string;
  errors: number;
}

export function getResult(input: {
  day: string;
  level: SudokuLevel;
  solved: boolean;
  seconds: number;
  errors: number;
}): SudokuResult {
  const minutes = Math.floor(input.seconds / 60);
  const seconds = input.seconds % 60;
  return {
    game: 'sudoku',
    day: input.day,
    level: input.level,
    solved: input.solved,
    seconds: input.seconds,
    time: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    errors: input.errors,
  };
}
