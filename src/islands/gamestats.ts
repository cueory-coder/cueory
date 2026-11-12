/** Optional private game history. No storage, clock, network or visible game names. */
import type { DailyGame } from '../config/games';

export type LegacyGameId = DailyGame['id'];
export type GameId = LegacyGameId | 'sudoku' | 'stat';
interface BaseResult {
  day: string;
  solved: boolean;
  tries: number;
}
export type GameResult =
  | (BaseResult & { game: LegacyGameId })
  | (BaseResult & { game: 'sudoku'; level: 'easy' | 'medium' | 'hard'; seconds: number })
  | (BaseResult & { game: 'stat'; score: number });
export type GameStats = readonly GameResult[];
export interface GameSummary {
  played: number;
  solved: number;
  /** All recorded results, including games that weren't solved. */
  triesCounts: Record<number, number>;
}

const GAMES: readonly string[] = ['pulse', 'cueword', 'triage', 'suture', 'sudoku', 'stat'];
const DAY = 86_400_000;
const WINDOW_DAYS = 400;
const VERSION = 1;

function dayNumber(day: unknown): number | undefined {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day.startsWith('0000-')) return;
  const time = Date.parse(`${day}T00:00:00.000Z`);
  if (Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day) return time / DAY;
}

function readResult(value: unknown): GameResult | undefined {
  // A bad result is ignored, even if an object from an old caller has throwing getters.
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const { game, day, solved, tries, level, seconds, score } = value as Record<string, unknown>;
    if (typeof game !== 'string' || !GAMES.includes(game) || dayNumber(day) === undefined ||
      typeof solved !== 'boolean' || typeof tries !== 'number' || !Number.isSafeInteger(tries) || tries < 0) return;
    const base = { day: day as string, solved, tries };
    if (game === 'sudoku') {
      if (solved !== true || !['easy', 'medium', 'hard'].includes(level as string) ||
        typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds < 0) return;
      return { ...base, game, level: level as 'easy' | 'medium' | 'hard', seconds };
    }
    if (game === 'stat') {
      if (solved !== true || typeof score !== 'number' || !Number.isSafeInteger(score) ||
        score < 0 || score > 15 || tries !== 15 - score) return;
      return { ...base, game, score };
    }
    return { ...base, game: game as LegacyGameId };
  } catch {
    return;
  }
}

/** Convert the existing sudoku game's completion event into a small private stats record. */
export function fromSudokuCompletion(value: unknown): GameResult | undefined {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const input = value as Record<string, unknown>;
    if (input.game !== 'sudoku') return;
    return readResult({ ...input, tries: input.errors });
  } catch {
    return;
  }
}

/** A game/day is unique, except sudoku has a separate round for each difficulty. */
function sameRound(a: GameResult, b: GameResult): boolean {
  return a.game === b.game && a.day === b.day &&
    (a.game !== 'sudoku' || (b.game === 'sudoku' && a.level === b.level));
}

/** Keep the inclusive 400-calendar-day window ending on each game's newest result. */
function trim(results: GameStats): GameResult[] {
  const latest = new Map<GameId, number>();
  for (const result of results) latest.set(result.game, Math.max(latest.get(result.game) ?? -Infinity, dayNumber(result.day)!));
  return results.filter((result) => dayNumber(result.day)! >= latest.get(result.game)! - WINDOW_DAYS + 1);
}

/** First result for a game/day (or sudoku day/level) wins. Replays never rewrite history. */
export function recordResult(stats: GameStats, result: unknown): GameStats {
  const valid = readResult(result);
  if (!valid || stats.some((entry) => sameRound(entry, valid))) return stats;
  return trim([...stats, valid]);
}

export function summary(stats: GameStats, game: string): GameSummary {
  const results = stats.filter((entry) => entry.game === game);
  const triesCounts: Record<number, number> = {};
  for (const result of results) triesCounts[result.tries] = (triesCounts[result.tries] ?? 0) + 1;
  return { played: results.length, solved: results.filter((entry) => entry.solved).length, triesCounts };
}

export function summaryInWords(value: GameSummary): string {
  return `played ${value.played} ${value.played === 1 ? 'day' : 'days'}, solved ${value.solved}.`;
}

/** Stat keeps the first completed round for each day. A streak means consecutive days played. */
export function statInWords(stats: GameStats): string {
  const rounds = stats.filter((entry): entry is Extract<GameResult, { game: 'stat' }> => entry.game === 'stat');
  if (rounds.length === 0) return 'not played yet.';
  const days = [...new Set(rounds.map((entry) => dayNumber(entry.day)!))].sort((a, b) => a - b);
  let streak = 0;
  let longest = 0;
  let previous = -Infinity;
  for (const day of days) {
    streak = day === previous + 1 ? streak + 1 : 1;
    longest = Math.max(longest, streak);
    previous = day;
  }
  const best = Math.max(...rounds.map((entry) => entry.score));
  return `played ${days.length} ${days.length === 1 ? 'day' : 'days'}. best score ${best} out of 15. longest daily streak ${longest} ${longest === 1 ? 'day' : 'days'}.`;
}

/** Best solved time for each difficulty, with no legacy sort rows mixed in. */
export function sudokuInWords(stats: GameStats): string {
  const rounds = stats.filter((entry): entry is Extract<GameResult, { game: 'sudoku' }> => entry.game === 'sudoku');
  if (rounds.length === 0) return 'not played yet.';
  const parts: string[] = [
    `solved ${rounds.length} ${rounds.length === 1 ? 'puzzle' : 'puzzles'}.`,
  ];
  for (const level of ['easy', 'medium', 'hard'] as const) {
    const times = rounds.filter((entry) => entry.level === level).map((entry) => entry.seconds);
    if (times.length === 0) {
      parts.push(`${level}: not solved yet.`);
      continue;
    }
    const seconds = Math.min(...times);
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    parts.push(`${level}: best time ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ${remainder} ${remainder === 1 ? 'second' : 'seconds'}.`);
  }
  return parts.join(' ');
}

/** Only known progress fields are serialized; caller metadata never follows them. */
export function serialize(stats: GameStats): string {
  const results: GameResult[] = [];
  for (const result of stats) {
    const valid = readResult(result);
    if (!valid) return JSON.stringify({ version: VERSION, results: [] });
    results.push(valid);
  }
  return JSON.stringify({ version: VERSION, results: trim(results) });
}

/** Bad or old data starts empty. One invalid entry invalidates the whole saved record. */
export function parseStats(text: unknown): GameStats {
  try {
    if (typeof text !== 'string') return [];
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const { version, results } = value as Record<string, unknown>;
    if (version !== VERSION || !Array.isArray(results)) return [];
    const seen = new Set<string>();
    const parsed: GameResult[] = [];
    for (const result of results) {
      const valid = readResult(result);
      if (!valid) return [];
      const key = valid.game === 'sudoku' ? `${valid.game}:${valid.day}:${valid.level}` : `${valid.game}:${valid.day}`;
      if (!seen.has(key)) { seen.add(key); parsed.push(valid); }
    }
    return trim(parsed);
  } catch {
    return [];
  }
}

export function forget(stats: GameStats, game?: string): GameStats {
  return game === undefined ? [] : stats.filter((result) => result.game !== game);
}
