/**
 * Private daily-game stats on /play (D-76). Each game reports a finished round; the stats panel keeps the results
 * only when the student has turned stats on. The first result of each game/day (each sudoku day/level)
 * is retained. Only stat shows a daily-play streak. Results older than 400 days are dropped.
 *
 * Stats are off until the student turns them on: turned on means the record exists in this browser's storage, and
 * turning them off deletes it. Nothing here is ever sent anywhere.
 */
import type { KeyValueStorage } from '../scripts/storage';
import { fromSudokuCompletion, parseStats, recordResult, serialize, type GameId, type GameResult, type GameStats } from './gamestats';

/** The event a game sends on `window` when a round ends. */
export const GAME_RESULT_EVENT = 'cueory:game-result';

/** Where the stats record is kept, when the student has turned stats on. */
export const STATS_STORAGE_KEY = 'cueory-game-stats';

/** Each completed round stores only public game progress, never its questions or answers. */
export type RoundResult = GameResult;

/** A date as YYYY-MM-DD in the visitor's own time zone: the same day the games pick their puzzle by. */
export function localDay(date: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Rounds finished on this page that aren't kept yet, in memory only. A round waits here while stats are off, in case
 * the student turns them on next, and while the stats panel's own code is still loading. Every island on the page
 * shares this module, so they share the list.
 */
const held: RoundResult[] = [];

/** Drops the waiting rounds of one game, or of every game, so none of them can be kept later. */
export function forgetHeldRounds(game?: GameId): void {
  const others = game === undefined ? [] : held.filter((result) => result.game !== game);
  held.length = 0;
  held.push(...others);
}

// Another tab turned stats on or off, forgot some or kept a game; or this page came back from the back/forward cache,
// where it heard no such change. Either way a waiting round may be from before the student turned stats off, so it is
// dropped. This is set up as soon as this module loads, which is before any round can wait (Codex on #79).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === STATS_STORAGE_KEY) forgetHeldRounds();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) forgetHeldRounds();
  });
  // This module loads with SudokuGame, before the stats panel, so even early completions are held.
  window.addEventListener('cueory:sudoku-solved', (event) => {
    const round = fromSudokuCompletion((event as CustomEvent).detail);
    if (round) reportRound(round);
  });
}

/** Tells the page that a round has ended: the round waits to be kept, and an event tells the stats panel. */
export function reportRound(result: RoundResult): void {
  held.push(result);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<RoundResult>(GAME_RESULT_EVENT, { detail: result }));
}

/** The rounds waiting to be kept, oldest first. Reading them leaves them waiting; forget them once they're kept. */
export function heldRounds(): RoundResult[] {
  return [...held];
}

/** How many calendar days of results this browser keeps, counting today. */
export const KEEP_DAYS = 400;

/** The first day still kept on `today` (both YYYY-MM-DD): earlier results are dropped. */
export function firstKeptDay(today: string): string {
  const day = Date.parse(`${today}T00:00:00.000Z`);
  return Number.isFinite(day) ? new Date(day - (KEEP_DAYS - 1) * 86_400_000).toISOString().slice(0, 10) : '0000-00-00';
}

export interface SavedStats {
  /** Whether the student has turned stats on in this browser. */
  on: boolean;
  stats: GameStats;
}

/**
 * What this browser keeps, as of `today` in the visitor's own time zone: results from before the last 400 days are
 * left out. Missing or blocked storage means stats are off; a record that can't be read starts empty.
 */
export function loadStats(storage: KeyValueStorage | undefined, today: string): SavedStats {
  try {
    const text = storage?.getItem(STATS_STORAGE_KEY) ?? null;
    if (text === null) return { on: false, stats: [] };
    const first = firstKeptDay(today);
    return { on: true, stats: parseStats(text).filter((result) => result.day >= first) };
  } catch {
    return { on: false, stats: [] };
  }
}

/** Keeps the record (which also turns stats on). False when the browser won't store it. */
export function saveStats(storage: KeyValueStorage | undefined, stats: GameStats): boolean {
  try {
    if (!storage) return false;
    storage.setItem(STATS_STORAGE_KEY, serialize(stats));
    return true;
  } catch {
    return false;
  }
}

/** Persist a result finished on another page (stat), where the /play panel is not mounted.
 * Never turns stats on by itself: the student must opt in on /play first.
 */
export function saveCompletedRound(
  storage: KeyValueStorage | undefined, today: string, result: unknown,
): 'off' | 'saved' | 'duplicate' | 'blocked' {
  const current = loadStats(storage, today);
  if (!current.on) return 'off';
  const next = recordResult(current.stats, result);
  if (next === current.stats) return 'duplicate';
  return saveStats(storage, next) ? 'saved' : 'blocked';
}

/** Turns stats off by deleting the record. False when the browser won't let us. */
export function deleteStats(storage: KeyValueStorage | undefined): boolean {
  try {
    if (!storage) return false;
    storage.removeItem(STATS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** What each game counts as a try, in the words its own rules use. */
const TRIES: Record<GameId, { one: string; many: string }> = {
  pulse: { one: 'guess', many: 'guesses' },
  triage: { one: 'slip', many: 'slips' },
  cueword: { one: 'cue', many: 'cues' },
  suture: { one: 'loose stitch', many: 'loose stitches' },
  sudoku: { one: 'error', many: 'errors' },
  stat: { one: 'miss', many: 'misses' },
};

/**
 * How many tries each recorded round took, in words, fewest first: "2 guesses on 1 day, 3 guesses on 2 days."
 * Empty when nothing is recorded.
 */
export function triesInWords(game: GameId, counts: Readonly<Record<number, number>>): string {
  const words = TRIES[game];
  const parts = Object.entries(counts)
    .map(([tries, days]) => [Number(tries), days] as const)
    .filter(([tries, days]) => Number.isSafeInteger(tries) && tries >= 0 && days > 0)
    .sort(([a], [b]) => a - b)
    .map(([tries, days]) => `${tries} ${tries === 1 ? words.one : words.many} on ${days} ${days === 1 ? 'day' : 'days'}`);
  return parts.length === 0 ? '' : `${parts.join(', ')}.`;
}
