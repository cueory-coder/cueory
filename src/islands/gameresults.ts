/**
 * Private daily-game stats on /play (D-76). Each game reports a finished round; the stats panel keeps the results
 * only when the student has turned stats on. The record itself (first result of each game and day, no streaks) is the
 * helper's logic in ./gamestats, and results older than 400 days are dropped by today's date.
 *
 * Stats are off until the student turns them on: turned on means the record exists in this browser's storage, and
 * turning them off deletes it. Nothing here is ever sent anywhere.
 */
import type { KeyValueStorage } from '../scripts/storage';
import { parseStats, serialize, type GameId, type GameStats } from './gamestats';

/** The event a game sends on `window` when a round ends. */
export const GAME_RESULT_EVENT = 'cueory:game-result';

/** Where the stats record is kept, when the student has turned stats on. */
export const STATS_STORAGE_KEY = 'cueory-game-stats';

export interface RoundResult {
  game: GameId;
  /** The day of the puzzle that was played, in the visitor's own time zone, written YYYY-MM-DD. */
  day: string;
  solved: boolean;
  /** Beats for pulse, slips for sort, cues for the crossword and loose stitches for word path. */
  tries: number;
}

/** A date as YYYY-MM-DD in the visitor's own time zone: the same day the games pick their puzzle by. */
export function localDay(date: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Rounds finished on this page that the stats panel hasn't taken yet, in memory only. A game can finish before the
 * panel's own code has loaded, so the round waits here instead of being lost. Every island on the page shares this
 * module, so they share the list.
 */
const finished: RoundResult[] = [];

/** Tells the page that a round has ended: the round waits for the stats panel, and an event tells the panel. */
export function reportRound(result: RoundResult): void {
  finished.push(result);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<RoundResult>(GAME_RESULT_EVENT, { detail: result }));
}

/** Takes every round finished on this page since the last call, oldest first. */
export function takeFinishedRounds(): RoundResult[] {
  return finished.splice(0);
}

// Clear queued rounds as soon as another tab turns stats off, before the panel has a chance to drain them and
// move them to its own unsaved buffer. Without this, a round finished while the panel module was still loading
// would survive a cross-tab opt-out and reappear when the student later turned stats on here (Codex on #79).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === null || (event.key === STATS_STORAGE_KEY && event.newValue === null)) {
      finished.splice(0);
    }
  });
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
  pulse: { one: 'beat', many: 'beats' },
  triage: { one: 'slip', many: 'slips' },
  cueword: { one: 'cue', many: 'cues' },
  suture: { one: 'loose stitch', many: 'loose stitches' },
};

/**
 * How many tries each recorded round took, in words, fewest first: "2 beats on 1 day, 3 beats on 2 days."
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
