/**
 * A local-only rewards model for finished games and study sessions (Task 100).
 * No storage, network, DOM or current clock. A caller supplies today's local YYYY-MM-DD.
 *
 * This is NOT proof of a score for a public leaderboard: the server must independently
 * verify recorded events and calculate points before publishing rankings.
 */
import { dailyGames, type DailyGame } from '../config/games';

export const GAME_POINTS = 10;
export const PERFECT_GAME_BONUS = 5;
export const ALL_FOUR_GAMES_BONUS = 10;
export const STUDY_SESSION_POINTS = 5;
export const DAILY_STUDY_POINT_LIMIT = 50;
export const WEEKLY_FREE_PASSES = 1;
export const EVENT_MAX_AGE_DAYS = 1;

const DAY_MS = 86_400_000;
const VERSION = 1 as const;
const gameIds = new Set<string>(dailyGames.map((game) => game.id));
export type GameId = DailyGame['id'];
export type StudyMode = 'cards' | 'learn' | 'review';

export interface FinishedGame {
  game: GameId;
  day: string;
  solved: boolean;
  slips: number;
  cues: number;
}
export interface FinishedStudy {
  id: string;
  day: string;
  mode: StudyMode;
}
export interface Achievement {
  id: string;
  name: string;
  rule: string;
  earnedDate: string;
}
export interface RewardsState {
  version: typeof VERSION;
  points: number;
  games: FinishedGame[];
  studies: FinishedStudy[];
  achievements: Achievement[];
  currentStreak: number;
  bestStreak: number;
  passesLeftThisWeek: number;
  /** Last explicit local date processed; never read from the device clock. */
  lastEvaluatedDay: string | null;
}
export type RewardEvent =
  | ({ type: 'game'; finished: true } & FinishedGame)
  | ({ type: 'study'; finished: true } & FinishedStudy);
export interface ApplyResult {
  state: RewardsState;
  accepted: boolean;
  pointsEarned: number;
  achievementsEarned: Achievement[];
  streakMessage: string | null;
}

export const ACHIEVEMENTS = [
  { id: 'first-game', name: 'first game', rule: 'finish one daily game' },
  { id: 'all-four', name: 'all four today', rule: 'finish all four daily games on one day' },
  { id: 'game-streak-3', name: '3-day game streak', rule: 'reach a 3-day game streak' },
  { id: 'game-streak-7', name: '7-day game streak', rule: 'reach a 7-day game streak' },
  { id: 'game-streak-30', name: '30-day game streak', rule: 'reach a 30-day game streak' },
  { id: 'game-streak-100', name: '100-day game streak', rule: 'reach a 100-day game streak' },
  { id: 'perfect-10', name: '10 perfect games', rule: 'finish 10 games with no slips or cues' },
  { id: 'points-100', name: '100 points', rule: 'earn 100 points' },
  { id: 'points-1000', name: '1,000 points', rule: 'earn 1,000 points' },
  { id: 'points-5000', name: '5,000 points', rule: 'earn 5,000 points' },
  { id: 'first-study', name: 'first study session', rule: 'finish one study session' },
  { id: 'study-streak-7', name: '7 study days', rule: 'finish a study session on seven consecutive days' },
] as const;

export function emptyRewards(): RewardsState {
  return {
    version: VERSION, points: 0, games: [], studies: [], achievements: [],
    currentStreak: 0, bestStreak: 0, passesLeftThisWeek: WEEKLY_FREE_PASSES, lastEvaluatedDay: null,
  };
}

/** UTC arithmetic here is only for calendar dates, never for the user's time zone or current clock. */
function dayIndex(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  if (year < 1900) return null;
  const timestamp = Date.parse(value + 'T00:00:00.000Z');
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp / DAY_MS : null;
}

/** The Monday beginning a Monday–Sunday week, including weeks crossing a year boundary. */
export function weekKey(day: string): string {
  const index = dayIndex(day);
  if (index === null) throw new Error('use a real calendar day (YYYY-MM-DD).');
  const weekday = new Date(index * DAY_MS).getUTCDay();
  return new Date((index - (weekday + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}

function ownRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const actual = Object.keys(value);
    if (actual.length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) return null;
    if (actual.some((key) => !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value'))) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}
const whole = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const count = (value: unknown): value is number => whole(value) && value <= 100_000;
const studyMode = (value: unknown): value is StudyMode =>
  value === 'cards' || value === 'learn' || value === 'review';

function readGame(value: unknown, event = false): FinishedGame | null {
  const keys = ['game', 'day', 'solved', 'slips', 'cues', ...(event ? ['type', 'finished'] : [])];
  const v = ownRecord(value, keys);
  if (!v || (event && (v.type !== 'game' || v.finished !== true)) ||
      typeof v.game !== 'string' || !gameIds.has(v.game) || dayIndex(v.day) === null ||
      typeof v.solved !== 'boolean' || !count(v.slips) || !count(v.cues)) return null;
  return { game: v.game as GameId, day: v.day as string, solved: v.solved, slips: v.slips, cues: v.cues };
}
function readStudy(value: unknown, event = false): FinishedStudy | null {
  const keys = ['id', 'day', 'mode', ...(event ? ['type', 'finished'] : [])];
  const v = ownRecord(value, keys);
  if (!v || (event && (v.type !== 'study' || v.finished !== true)) ||
      typeof v.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(v.id) ||
      dayIndex(v.day) === null || !studyMode(v.mode)) return null;
  return { id: v.id, day: v.day as string, mode: v.mode };
}

function streaks(games: readonly FinishedGame[]): { current: number; best: number; usedWeeks: Set<string> } {
  const days = [...new Set(games.map((game) => game.day))].sort();
  const usedWeeks = new Set<string>();
  let previous: number | null = null;
  let current = 0;
  let best = 0;
  for (const day of days) {
    const index = dayIndex(day)!;
    if (previous === null) current = 1;
    else {
      const gap = index - previous;
      if (gap === 1) current++;
      else {
        // Three or more missed days cannot be covered by one pass per calendar week.
        const skippedWeeks: string[] = [];
        if (gap > 1 && gap <= 3) {
          for (let missing = previous + 1; missing < index; missing++) {
            skippedWeeks.push(weekKey(new Date(missing * DAY_MS).toISOString().slice(0, 10)));
          }
        }
        const distinctWeeks = new Set(skippedWeeks);
        if (skippedWeeks.length === gap - 1 && distinctWeeks.size === skippedWeeks.length &&
            skippedWeeks.every((week) => !usedWeeks.has(week))) {
          skippedWeeks.forEach((week) => usedWeeks.add(week));
          current += gap; // A covered day holds the streak, but never earns game points.
        } else current = 1;
      }
    }
    best = Math.max(best, current);
    previous = index;
  }
  return { current, best, usedWeeks };
}

function studyStreak(studies: readonly FinishedStudy[]): number {
  const days = [...new Set(studies.map((study) => study.day))].sort();
  let last: number | null = null;
  let run = 0;
  let best = 0;
  for (const day of days) {
    const next = dayIndex(day)!;
    run = last !== null && next - last === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    last = next;
  }
  return best;
}

interface Totals {
  points: number;
  games: number;
  perfect: number;
  allFour: boolean;
  studySessions: number;
  studyRun: number;
  currentStreak: number;
  bestStreak: number;
  usedWeeks: Set<string>;
}
function totals(games: readonly FinishedGame[], studies: readonly FinishedStudy[]): Totals {
  const perGameDay = new Map<string, Set<GameId>>();
  let points = 0;
  let perfect = 0;
  for (const game of games) {
    let seen = perGameDay.get(game.day);
    if (!seen) { seen = new Set<GameId>(); perGameDay.set(game.day, seen); }
    seen.add(game.game);
    const flawless = game.solved && game.slips === 0 && game.cues === 0;
    if (flawless) perfect++;
    points += GAME_POINTS + (flawless ? PERFECT_GAME_BONUS : 0);
  }
  for (const set of perGameDay.values()) if (set.size === gameIds.size) points += ALL_FOUR_GAMES_BONUS;

  const perStudyDay = new Map<string, number>();
  for (const study of studies) perStudyDay.set(study.day, (perStudyDay.get(study.day) ?? 0) + 1);
  for (const completed of perStudyDay.values()) {
    points += Math.min(completed * STUDY_SESSION_POINTS, DAILY_STUDY_POINT_LIMIT);
  }
  const gameRun = streaks(games);
  return {
    points, games: games.length, perfect,
    allFour: [...perGameDay.values()].some((set) => set.size === gameIds.size),
    studySessions: studies.length, studyRun: studyStreak(studies),
    currentStreak: gameRun.current, bestStreak: gameRun.best, usedWeeks: gameRun.usedWeeks,
  };
}

function eligible(id: string, m: Totals): boolean {
  switch (id) {
    case 'first-game': return m.games >= 1;
    case 'all-four': return m.allFour;
    case 'game-streak-3': return m.bestStreak >= 3;
    case 'game-streak-7': return m.bestStreak >= 7;
    case 'game-streak-30': return m.bestStreak >= 30;
    case 'game-streak-100': return m.bestStreak >= 100;
    case 'perfect-10': return m.perfect >= 10;
    case 'points-100': return m.points >= 100;
    case 'points-1000': return m.points >= 1_000;
    case 'points-5000': return m.points >= 5_000;
    case 'first-study': return m.studySessions >= 1;
    case 'study-streak-7': return m.studyRun >= 7;
    default: return false;
  }
}

/**
 * Fail closed on corrupt or fabricated state. A client can still invent its own game events:
 * these records are for local display only, not an authoritative server-side leaderboard.
 */
function checkState(input: unknown): RewardsState {
  const v = ownRecord(input, [
    'version', 'points', 'games', 'studies', 'achievements',
    'currentStreak', 'bestStreak', 'passesLeftThisWeek', 'lastEvaluatedDay',
  ]);
  if (!v || v.version !== VERSION || !whole(v.points) ||
      !whole(v.currentStreak) || !whole(v.bestStreak) ||
      (v.passesLeftThisWeek !== 0 && v.passesLeftThisWeek !== WEEKLY_FREE_PASSES) ||
      (v.lastEvaluatedDay !== null &&
        (typeof v.lastEvaluatedDay !== 'string' || dayIndex(v.lastEvaluatedDay) === null)) ||
      !Array.isArray(v.games) || !Array.isArray(v.studies) || !Array.isArray(v.achievements)) {
    throw new Error('invalid rewards state.');
  }
  const evaluationDay = v.lastEvaluatedDay as string | null;
  const games: FinishedGame[] = [];
  const studies: FinishedStudy[] = [];
  const seenGames = new Set<string>();
  const seenStudies = new Set<string>();
  for (const item of v.games) {
    const game = readGame(item);
    if (!game || (evaluationDay !== null && game.day > evaluationDay)) {
      throw new Error('invalid rewards state.');
    }
    const key = game.day + ':' + game.game;
    if (seenGames.has(key)) throw new Error('invalid rewards state.');
    seenGames.add(key);
    games.push(game);
  }
  for (const item of v.studies) {
    const study = readStudy(item);
    if (!study || (evaluationDay !== null && study.day > evaluationDay) ||
        seenStudies.has(study.id)) throw new Error('invalid rewards state.');
    seenStudies.add(study.id);
    studies.push(study);
  }
  const m = totals(games, studies);
  if (v.points !== m.points || v.currentStreak !== m.currentStreak || v.bestStreak !== m.bestStreak) {
    throw new Error('invalid rewards state.');
  }
  if (evaluationDay === null && (games.length || studies.length)) throw new Error('invalid rewards state.');
  const available = evaluationDay === null || !m.usedWeeks.has(weekKey(evaluationDay));
  if (v.passesLeftThisWeek !== (available ? WEEKLY_FREE_PASSES : 0)) throw new Error('invalid rewards state.');

  const seenAchievements = new Set<string>();
  for (const value of v.achievements) {
    const a = ownRecord(value, ['id', 'name', 'rule', 'earnedDate']);
    const def = ACHIEVEMENTS.find((item) => item.id === a?.id);
    if (!a || !def || a.name !== def.name || a.rule !== def.rule ||
        dayIndex(a.earnedDate) === null || evaluationDay === null ||
        (a.earnedDate as string) > evaluationDay || seenAchievements.has(def.id) || !eligible(def.id, m)) {
      throw new Error('invalid rewards state.');
    }
    seenAchievements.add(def.id);
  }
  if (ACHIEVEMENTS.some((def) => eligible(def.id, m) !== seenAchievements.has(def.id))) {
    throw new Error('invalid rewards state.');
  }
  return input as RewardsState;
}

/** A gentle description, with the best result remembered even after a reset. */
function streakMessage(current: number, best: number, restarted: boolean): string {
  if (restarted) return 'new streak: day 1. best streak: ' + best + (best === 1 ? ' day.' : ' days.');
  return 'current streak: ' + current + (current === 1 ? ' day.' : ' days.') +
    ' best streak: ' + best + (best === 1 ? ' day.' : ' days.');
}

/**
 * A finished event is accepted once only. At most today or yesterday, in the caller's
 * calendar. Invalid events, future events, old events and replays have no effect.
 */
export function applyResult(state: unknown, event: unknown, today: string): ApplyResult {
  const currentDay = dayIndex(today);
  if (currentDay === null) throw new Error('use a real local calendar day (YYYY-MM-DD).');
  const before = checkState(state);
  const game = readGame(event, true);
  const study = game ? null : readStudy(event, true);
  const parsed = game ?? study;
  if (!parsed || (before.lastEvaluatedDay !== null && today < before.lastEvaluatedDay)) {
    return { state: before, accepted: false, pointsEarned: 0, achievementsEarned: [], streakMessage: null };
  }
  const age = currentDay - dayIndex(parsed.day)!;
  const duplicate = game
    ? before.games.some((entry) => entry.day === game.day && entry.game === game.game)
    : before.studies.some((entry) => entry.id === study!.id);
  if (age < 0 || age > EVENT_MAX_AGE_DAYS || duplicate) {
    return { state: before, accepted: false, pointsEarned: 0, achievementsEarned: [], streakMessage: null };
  }

  const games = [...before.games.map((entry) => ({ ...entry })), ...(game ? [game] : [])];
  const studies = [...before.studies.map((entry) => ({ ...entry })), ...(study ? [study] : [])];
  const m = totals(games, studies);
  const previouslyEarned = new Set(before.achievements.map((entry) => entry.id));
  const achievementsEarned: Achievement[] = ACHIEVEMENTS
    .filter((def) => eligible(def.id, m) && !previouslyEarned.has(def.id))
    .map((def) => ({ ...def, earnedDate: parsed.day }));
  const achievements = [...before.achievements.map((entry) => ({ ...entry })), ...achievementsEarned];
  const passLeft = m.usedWeeks.has(weekKey(today)) ? 0 : WEEKLY_FREE_PASSES;
  const oldLatest = before.games.map((entry) => entry.day).sort().at(-1);
  const restarted = Boolean(game && oldLatest && game.day > oldLatest && before.currentStreak > 0 &&
    m.currentStreak === 1);
  const next: RewardsState = {
    version: VERSION, points: m.points, games, studies, achievements,
    currentStreak: m.currentStreak, bestStreak: m.bestStreak,
    passesLeftThisWeek: passLeft, lastEvaluatedDay: today,
  };
  return {
    state: next, accepted: true, pointsEarned: m.points - before.points,
    achievementsEarned, streakMessage: game ? streakMessage(m.currentStreak, m.bestStreak, restarted) : null,
  };
}
