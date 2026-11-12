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
export type RunwayGame = SampleFolder | 'sudoku';
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
function playableIdentity(game: SampleFolder, data: unknown): string | null {
  if (!isRecord(data) || data.status !== 'sample') return null;
  if (game === 'pulse') {
    return typeof data.word === 'string' && /^[a-z]{5}$/.test(data.word) ? JSON.stringify(['pulse', data.word]) : null;
  }
  if (game === 'cueword') {
    return Array.isArray(data.grid) && data.grid.length > 0 && data.grid.every((row) => typeof row === 'string')
      ? JSON.stringify(['cueword', data.grid]) : null;
  }
  if (game === 'suture') {
    if (!Array.isArray(data.grid) || !data.grid.every((row) => typeof row === 'string') || !Array.isArray(data.words)) return null;
    const answers = data.words.map((word: unknown) => isRecord(word) ? word.answer : null);
    return answers.length > 0 && answers.every((word) => typeof word === 'string')
      ? JSON.stringify(['suture', data.grid, [...answers].sort()]) : null;
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

/** Pure audit for a file list, convenient for small unit-test fixtures. */
export function analyzePuzzleRunway(game: SampleFolder, input: readonly SampleFile[], asOf: Date): PuzzleRunway {
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
    const slot = match ? Number(match[1]) : NaN;
    if (!match || !Number.isSafeInteger(slot) || slot < 1 || slot > 10_000) {
      invalidFiles.add(file.name);
      unsafePositions.add(position);
      continue;
    }
    // Keep a malformed but numeric name in the day map too, so duplicate days
    // such as sample-01.json + sample-1.json cannot hide behind a naming error.
    if (!/^sample-\d{2,}\.json$/.test(file.name)) {
      invalidFiles.add(file.name);
      unsafePositions.add(position);
    }
    if (slot !== position + 1) {
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
  return [
    report('pulse'),
    report('cueword'),
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
  console.log(runwayLines().join('\n'));
}
