/**
 * Sample-puzzle runway for maintainers. This module is Node-only: it reads the
 * public, labeled sample files, never private daily puzzle data.
 *
 * The three live sample-driven games select sorted files by day, starting
 * 2026-11-01, then wrap with modulo. Sudoku instead generates a daily board.
 * The old triage/sort samples are audited but are NOT used by today's sudoku.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUNWAY_START = '2026-11-01';
const START_UTC = Date.UTC(2026, 10, 1);
const DAY_MS = 86_400_000;

export type SampleFolder = 'pulse' | 'cueword' | 'suture' | 'triage';
export type RunwayGame = SampleFolder | 'cueword-easy' | 'cueword-mid' | 'cueword-hard' | 'sudoku';
export type RunwaySource = 'rotating-samples' | 'generated' | 'legacy-samples';

export interface SampleFile {
  /** The filename, as sorted by the game page (not the puzzle's text). */
  name: string;
  /** Parsed JSON, or null when its JSON is malformed. */
  data: unknown;
}

export interface DuplicateDay {
  day: string;
  files: string[];
}
export interface RepeatedPuzzle {
  firstDay: string;
  repeatedDay: string;
}

export interface PuzzleRunway {
  game: RunwayGame;
  source: RunwaySource;
  /** First and last dates in the initial non-repeating sample window. */
  firstDay: string | null;
  lastDay: string | null;
  /** Number of valid, non-repeated sample days remaining, including today. */
  daysLeft: number | null;
  /** For each active crossword level this counts that level's sorted pool only. */
  sampleCount: number;
  gaps: string[];
  duplicates: DuplicateDay[];
  repeats: RepeatedPuzzle[];
  /** Invalid filenames, labels or basic puzzle payloads. */
  invalidFiles: string[];
  /** Files whose alphabetic order differs from their numbered day slot. */
  outOfOrder: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Match pulse.ts dayNumber: local calendar days, not elapsed 24-hour periods. */
export function runwayDayNumber(date: Date): number {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new RangeError('a valid date is required');
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - START_UTC) / DAY_MS);
}

/** Slot 1 is 2026-11-01, slot 2 is 2026-11-02, etc. */
function slotDate(slot: number): string {
  return new Date(START_UTC + (slot - 1) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * What counts as the same *playable* puzzle, without reporting answers or
 * public clue text. A changed clue does not make the same crossword grid new.
 */
/** Mirror the crossword and word-path parsers without bundler-only imports.
 * The runway CLI is run directly with Node's type stripping, so it cannot
 * import the games' extensionless application modules. Keep these structural
 * checks in step with cueword.parsePuzzle and suture.parsePuzzle.
 */
function validGrid(value: unknown, maximum: number, allowGaps: boolean): value is string[] {
  return Array.isArray(value) && value.length >= 3 && value.length <= maximum &&
    value.every((row: unknown) => typeof row === 'string' && row.length >= 3 && row.length <= maximum &&
      (allowGaps ? /^[A-Z.]+$/.test(row) : /^[A-Z]+$/.test(row))) &&
    value.every((row: string) => row.length === value[0].length);
}

function playableCrossword(data: Record<string, unknown>): boolean {
  const grid = data.grid;
  const clues = data.clues;
  if (!validGrid(grid, 15, true) || !isRecord(clues)) return false;
  // Match cueword.parsePuzzle: old samples may omit a level, while
  // easy/mid/hard require 5/7/15-square grids and valid block patterns.
  if (data.level !== undefined) {
    const size = data.level === 'easy' ? 5 : data.level === 'mid' ? 7 : data.level === 'hard' ? 15 : null;
    if (size === null || grid.length !== size || grid[0]!.length !== size) return false;
    const flat = grid.join('');
    if ([...flat].some((letter, index) => (letter === '.') !== (flat[flat.length - 1 - index] === '.'))) return false;
    const across = grid.flatMap((row) => row.split('.'));
    const down = Array.from({ length: grid[0]!.length }, (_, column) =>
      grid.map((row) => row[column]).join('')).flatMap((column) => column.split('.'));
    if ([...across, ...down].some((entry) => entry.length > 0 && entry.length < 3)) return false;
  }
  const width = grid[0]!.length;
  const expected = { across: new Set<number>(), down: new Set<number>() };
  const covered = new Set<number>();
  let number = 0;
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < width; col++) {
      if (grid[row]![col] === '.') continue;
      const across = (col === 0 || grid[row]![col - 1] === '.') && col + 1 < width && grid[row]![col + 1] !== '.';
      const down = (row === 0 || grid[row - 1]![col] === '.') && row + 1 < grid.length && grid[row + 1]![col] !== '.';
      if (!across && !down) continue;
      number++;
      if (across) {
        expected.across.add(number);
        for (let c = col; c < width && grid[row]![c] !== '.'; c++) covered.add(row * width + c);
      }
      if (down) {
        expected.down.add(number);
        for (let r = row; r < grid.length && grid[r]![col] !== '.'; r++) covered.add(r * width + col);
      }
    }
  }
  if (!covered.size || grid.some((line, row) => [...line].some((letter, col) =>
    letter !== '.' && !covered.has(row * width + col)))) return false;
  return (['across', 'down'] as const).every((direction) => {
    const entries = clues[direction];
    const allowed = expected[direction];
    if (!Array.isArray(entries) || entries.length !== allowed.size || entries.length > 49) return false;
    const seen = new Set<number>();
    return entries.every((entry: unknown) => {
      if (!isRecord(entry) || typeof entry.number !== 'number' || !Number.isInteger(entry.number) ||
        !allowed.has(entry.number) || seen.has(entry.number) ||
        typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 500) return false;
      seen.add(entry.number);
      return true;
    });
  });
}

function playableWordPath(data: Record<string, unknown>): boolean {
  const grid = data.grid;
  if (!validGrid(grid, 11, false)) return false;
  if (data.theme !== undefined && (typeof data.theme !== 'string' || !data.theme.trim() || data.theme.trim().length > 60)) return false;
  if (!Array.isArray(data.words) || data.words.length < 3 || data.words.length > 20) return false;
  const occupied = new Set<string>();
  for (const word of data.words) {
    if (!isRecord(word) || typeof word.answer !== 'string' || !/^[A-Z]{3,11}$/.test(word.answer) ||
      !Array.isArray(word.path) || word.path.length !== word.answer.length ||
      (word.cue !== undefined && (typeof word.cue !== 'string' || !word.cue.trim() || word.cue.length > 120))) return false;
    let previousRow = -1, previousCol = -1, deltaRow = 0, deltaCol = 0;
    for (let index = 0; index < word.path.length; index++) {
      const cell: unknown = word.path[index];
      if (!Array.isArray(cell) || cell.length !== 2 || !cell.every(Number.isInteger)) return false;
      const [row, col] = cell as [number, number];
      if (row < 0 || col < 0 || row >= grid.length || col >= grid[0]!.length ||
        grid[row]![col] !== word.answer[index]) return false;
      const position = `${row},${col}`;
      if (occupied.has(position)) return false;
      occupied.add(position);
      if (index > 0) {
        const dr = row - previousRow, dc = col - previousCol;
        if (Math.abs(dr) + Math.abs(dc) !== 1) return false;
        if (index === 1) { deltaRow = dr; deltaCol = dc; }
        else if (dr !== deltaRow || dc !== deltaCol) return false;
      }
      previousRow = row;
      previousCol = col;
    }
  }
  return true;
}

/** A changed clue does not make an unchanged playable puzzle new. */
function playableIdentity(game: SampleFolder, data: unknown): string | null {
  if (!isRecord(data) || data.status !== 'sample') return null;
  if (game === 'pulse') {
    return typeof data.word === 'string' && /^[a-z]{5}$/.test(data.word) &&
      typeof data.cue === 'string' && !!data.cue.trim()
      ? JSON.stringify(['pulse', data.word]) : null;
  }
  if (game === 'cueword') {
    return playableCrossword(data) ? JSON.stringify(['cueword', data.grid]) : null;
  }
  if (game === 'suture') {
    if (!playableWordPath(data)) return null;
    const answers = (data.words as { answer: string }[]).map((word) => word.answer);
    return JSON.stringify(['suture', data.grid, answers.sort()]);
  }
  if (!Array.isArray(data.groups) || data.groups.length === 0 || typeof data.oddOne !== 'string') return null;
  const groups = data.groups.map((group: unknown) => {
    if (!isRecord(group) || typeof group.name !== 'string' || !Array.isArray(group.terms)
      || !group.terms.every((term) => typeof term === 'string')) return null;
    return [group.name, [...group.terms].sort()] as const;
  });
  return groups.length > 0 && groups.every((group) => group !== null)
    ? JSON.stringify(['triage', groups.sort((a, b) => a![0].localeCompare(b![0])), data.oddOne]) : null;
}

/** Pure audit for one rotating file list. Position mode is for filtered difficulty pools. */
export function analyzePuzzleRunway(
  game: SampleFolder, input: readonly SampleFile[], asOf: Date,
  slotMode: 'numbered' | 'position' = 'numbered',
): PuzzleRunway {
  const today = runwayDayNumber(asOf) + 1;
  // Astro /play sorts the collection IDs lexicographically before rotating.
  const files = [...input].sort((a, b) => a.name.localeCompare(b.name));
  const slots = new Map<number, string[]>();
  const seenPuzzles = new Map<string, number>();
  const gaps: string[] = [];
  const repeats: RepeatedPuzzle[] = [];
  const invalidFiles = new Set<string>();
  const outOfOrder: string[] = [];
  // The game selects by position, not by the number embedded in the filename.
  // Once a position is unsafe, never promise more consecutive fresh days.
  const unsafePositions = new Set<number>();

  for (const [position, file] of files.entries()) {
    const match = /^sample-(\d+)\.json$/.exec(file.name);
    // Level selectors rotate their own sorted pool. Global filename numbers
    // are not per-level calendar slots, so count positions in that pool.
    const slot = slotMode === 'position' ? position + 1 : match ? Number(match[1]) : NaN;
    const validName = slotMode === 'position'
      ? /^sample-(?:\d{2}|(?:easy|mid|hard)-\d{2})\.json$/.test(file.name)
      : match !== null;
    if (!validName || !Number.isSafeInteger(slot) || slot < 1 || slot > 10_000) {
      invalidFiles.add(file.name);
      unsafePositions.add(position);
      continue;
    }
    // Keep a malformed but numeric name in the day map too, so duplicate days
    // such as sample-01.json + sample-1.json cannot hide behind a naming error.
    if (slotMode === 'numbered' && !/^sample-\d{2,}\.json$/.test(file.name)) {
      invalidFiles.add(file.name);
      unsafePositions.add(position);
    }
    if (slotMode === 'numbered' && slot !== position + 1) {
      outOfOrder.push(file.name);
      unsafePositions.add(position);
    }
    slots.set(slot, [...(slots.get(slot) ?? []), file.name]);
    const identity = playableIdentity(game, file.data);
    if (identity === null) {
      invalidFiles.add(file.name);
      unsafePositions.add(position);
      continue;
    }
    const firstPosition = seenPuzzles.get(identity);
    if (firstPosition !== undefined) {
      repeats.push({ firstDay: slotDate(firstPosition + 1), repeatedDay: slotDate(position + 1) });
      unsafePositions.add(position);
    } else {
      seenPuzzles.set(identity, position);
    }
  }

  const lastSlot = Math.max(0, ...slots.keys());
  const duplicates = [...slots].filter(([, names]) => names.length > 1)
    .map(([slot, names]) => ({ day: slotDate(slot), files: names }))
    .sort((a, b) => a.day.localeCompare(b.day));
  // Duplicated numbered days are unsafe from their first appearance.
  const duplicateNames = new Set(duplicates.flatMap((entry) => entry.files));
  for (const [position, file] of files.entries()) {
    if (duplicateNames.has(file.name)) unsafePositions.add(position);
  }
  for (let slot = 1; slot <= lastSlot; slot++) {
    if (!slots.has(slot)) gaps.push(slotDate(slot));
  }

  // A broken filename, missing day, bad file, or repeated puzzle makes the
  // remainder of the initial cycle unsafe to promise, even if later files
  // are individually valid. Actual play uses sorted list positions and wraps.
  const uninterruptedDays = unsafePositions.size ? Math.min(...unsafePositions) : files.length;
  const daysLeft = Math.max(0, uninterruptedDays - Math.max(0, today - 1));

  return {
    game,
    source: game === 'triage' ? 'legacy-samples' : 'rotating-samples',
    firstDay: uninterruptedDays ? slotDate(1) : null,
    lastDay: uninterruptedDays ? slotDate(uninterruptedDays) : null,
    daysLeft,
    sampleCount: files.length,
    gaps,
    duplicates,
    repeats,
    invalidFiles: [...invalidFiles],
    outOfOrder,
  };
}

/** Read, but never edit, the public game files. */
export function readGameSampleFiles(game: SampleFolder): SampleFile[] {
  const directory = new URL('../../content/games/' + game + '/', import.meta.url);
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      try {
        return { name, data: JSON.parse(readFileSync(new URL(name, directory), 'utf8')) as unknown };
      } catch {
        return { name, data: null };
      }
    });
}

/** Active daily games plus a separate, clearly labeled legacy sample inventory. */
export function puzzleRunways(asOf: Date = new Date()): PuzzleRunway[] {
  runwayDayNumber(asOf);
  const report = (game: SampleFolder) => analyzePuzzleRunway(game, readGameSampleFiles(game), asOf);
  // CuewordToday filters by difficulty *before* rotating. Unleveled legacy
  // crosswords are not offered by the current game and must not extend the runway.
  const crossword = readGameSampleFiles('cueword');
  const crosswordLevel = (level: 'easy' | 'mid' | 'hard'): PuzzleRunway => ({
    ...analyzePuzzleRunway('cueword', crossword.filter((item) =>
      isRecord(item.data) && item.data.level === level), asOf, 'position'),
    game: `cueword-${level}`,
  });
  return [
    report('pulse'),
    crosswordLevel('easy'),
    crosswordLevel('mid'),
    crosswordLevel('hard'),
    { game: 'sudoku', source: 'generated', firstDay: null, lastDay: null, daysLeft: null,
      sampleCount: 0, gaps: [], duplicates: [], repeats: [], invalidFiles: [], outOfOrder: [] },
    report('suture'),
    report('triage'), // Retired sort samples, NOT today's Sudoku.
  ];
}

/** Prints only counts, dates and filenames, never puzzle answers or clues. */
export function runwayLines(asOf: Date = new Date()): string[] {
  return puzzleRunways(asOf).map((row) => {
    const duration = row.daysLeft === null ? 'generated each day (no sample limit)' : String(row.daysLeft) + ' fresh sample days left';
    const window = row.firstDay ? row.firstDay + ' to ' + row.lastDay : 'not applicable';
    const issues = row.gaps.length + row.duplicates.length + row.repeats.length + row.invalidFiles.length + row.outOfOrder.length;
    return row.game + ' (' + row.source + '): ' + duration + '; first window ' + window + '; ' + issues + ' issue(s)';
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(runwayLines().join('\n') + '\n');
}
