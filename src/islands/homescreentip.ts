/**
 * "add cueory to your home screen" tip (launch task L2). The tip shows on /play only after the visitor has finished
 * daily puzzles on 3 different days, counted on this device only. It is decided once when the page loads, so it never
 * appears in the middle of a game. Dismissing it is remembered here too. Nothing is sent anywhere, and this never
 * hijacks the browser's own install prompt.
 */
import type { KeyValueStorage } from '../scripts/storage';

/** Where the tip's small record is kept in this browser. */
export const HOME_TIP_STORAGE_KEY = 'cueory-home-screen-tip';

/** Finished-puzzle days needed before the tip shows. */
export const DAYS_NEEDED = 3;

export interface HomeTipState {
  /** Distinct days (YYYY-MM-DD, the visitor's own time zone) on which a puzzle was finished, at most DAYS_NEEDED. */
  days: string[];
  dismissed: boolean;
}

export const EMPTY_TIP_STATE: HomeTipState = Object.freeze({ days: [], dismissed: false }) as HomeTipState;

function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Reads a saved record. Anything broken or unexpected starts fresh (but a saved dismissal is kept when readable). */
export function parseTipState(text: unknown): HomeTipState {
  if (typeof text !== 'string') return { days: [], dismissed: false };
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { days: [], dismissed: false };
    const { days, dismissed } = value as Record<string, unknown>;
    const kept: string[] = [];
    if (Array.isArray(days)) {
      for (const day of days) if (isDay(day) && !kept.includes(day) && kept.length < DAYS_NEEDED) kept.push(day);
    }
    return { days: kept, dismissed: dismissed === true };
  } catch {
    return { days: [], dismissed: false };
  }
}

export function serializeTipState(state: HomeTipState): string {
  return JSON.stringify({ days: state.days.slice(0, DAYS_NEEDED), dismissed: state.dismissed });
}

/** Counts a finished puzzle on `day`. The same day twice counts once; after DAYS_NEEDED days nothing more is kept. */
export function recordFinishDay(state: HomeTipState, day: unknown): HomeTipState {
  if (!isDay(day) || state.dismissed || state.days.includes(day) || state.days.length >= DAYS_NEEDED) return state;
  return { ...state, days: [...state.days, day] };
}

export function dismissTip(state: HomeTipState): HomeTipState {
  return { days: state.days, dismissed: true };
}

export interface ShowContext {
  /** True when the site is already open from the home screen (installed), so the tip has nothing to add. */
  standalone: boolean;
}

/** The show rule: 3 different finished days, not dismissed, not already on the home screen. */
export function shouldShowTip(state: HomeTipState, context: ShowContext): boolean {
  return !state.dismissed && !context.standalone && state.days.length >= DAYS_NEEDED;
}

/** Blocked or missing storage means nothing is remembered and the tip stays hidden. */
export function loadTipState(storage: KeyValueStorage | undefined): HomeTipState {
  try {
    return parseTipState(storage?.getItem(HOME_TIP_STORAGE_KEY) ?? null);
  } catch {
    return { days: [], dismissed: false };
  }
}

/** Saves the record; returns false when storage is blocked or full. */
export function saveTipState(storage: KeyValueStorage | undefined, state: HomeTipState): boolean {
  try {
    if (!storage) return false;
    storage.setItem(HOME_TIP_STORAGE_KEY, serializeTipState(state));
    return true;
  } catch {
    return false;
  }
}

/** Re-reads storage before each change, so two open tabs don't undo each other. */
export function updateTipState(
  storage: KeyValueStorage | undefined,
  change: (state: HomeTipState) => HomeTipState,
): HomeTipState {
  const before = loadTipState(storage);
  const after = change(before);
  if (after !== before) saveTipState(storage, after);
  return after;
}
