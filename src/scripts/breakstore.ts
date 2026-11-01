/**
 * Save a break timer for this browser tab, so changing lesson pages does not restart it.
 * The caller passes sessionStorage; the data never leaves the student's browser.
 * Reads fail closed to an off timer when the record is missing, stale or malformed.
 */
import { parseSettings, startBreaks, tick, type BreakState } from '../islands/breaks';
import type { KeyValueStorage } from './storage';

export const BREAK_STORAGE_KEY = 'cueory-break-timer';
export const BREAK_STORAGE_VERSION = 1;
export const BREAK_STORAGE_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const MINUTE_MS = 60_000;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Copy only known BreakState fields, rejecting invalid state combinations. */
function parseBreakState(value: unknown): BreakState | null {
  if (!record(value) || !record(value.settings)) return null;

  const settings = parseSettings(value.settings);
  // parseSettings falls back to defaults for malformed settings. A saved timer must instead be rejected.
  if (settings.focusMinutes !== value.settings.focusMinutes || settings.breakMinutes !== value.settings.breakMinutes) {
    return null;
  }

  const { status, endsAt, pausedFrom, pausedRemainingMs } = value;
  if (!finiteNonnegative(pausedRemainingMs)) return null;

  if (status === 'off' || status === 'break due') {
    if (endsAt !== null || pausedFrom !== null || pausedRemainingMs !== 0) return null;
    return { settings, status, endsAt: null, pausedFrom: null, pausedRemainingMs: 0 };
  }

  if (status === 'focusing' || status === 'on break') {
    if (!finiteNonnegative(endsAt) || pausedFrom !== null || pausedRemainingMs !== 0) return null;
    return { settings, status, endsAt, pausedFrom: null, pausedRemainingMs: 0 };
  }

  if (status === 'paused') {
    if (endsAt !== null || (pausedFrom !== 'focusing' && pausedFrom !== 'on break')) return null;
    const maximumMinutes = pausedFrom === 'focusing' ? settings.focusMinutes : settings.breakMinutes;
    if (pausedRemainingMs > maximumMinutes * MINUTE_MS) return null;
    return { settings, status, endsAt: null, pausedFrom, pausedRemainingMs };
  }

  return null;
}

/** Read a session's saved timer and update any elapsed deadline, without starting a timer that was off or paused. */
export function readBreakState(storage: KeyValueStorage | undefined, now: number): BreakState {
  const off = startBreaks();
  if (!finiteNonnegative(now)) return off;

  try {
    const text = storage?.getItem(BREAK_STORAGE_KEY);
    if (!text) return off;
    const saved: unknown = JSON.parse(text);
    if (!record(saved) || saved.version !== BREAK_STORAGE_VERSION || !finiteNonnegative(saved.savedAt)) return off;

    const age = now - saved.savedAt;
    if (age < 0 || age > BREAK_STORAGE_MAX_AGE_MS) return off;

    const state = parseBreakState(saved.state);
    if (!state) return off;

    // A running timer cannot have more than one full phase left at the instant it was saved.
    if (state.status === 'focusing' || state.status === 'on break') {
      const phaseMinutes = state.status === 'focusing' ? state.settings.focusMinutes : state.settings.breakMinutes;
      if (state.endsAt! > saved.savedAt + phaseMinutes * MINUTE_MS) return off;
    }

    return tick(state, now);
  } catch {
    // sessionStorage may be unavailable, for example in a restrictive or private browser.
    return off;
  }
}

/** Snapshot the timer into sessionStorage. A blocked browser is a normal, non-throwing failure. */
export function writeBreakState(storage: KeyValueStorage | undefined, state: BreakState): boolean {
  if (!storage || !parseBreakState(state)) return false;
  try {
    const savedAt = Date.now();
    if (!finiteNonnegative(savedAt)) return false;
    storage.setItem(BREAK_STORAGE_KEY, JSON.stringify({ version: BREAK_STORAGE_VERSION, savedAt, state }));
    return true;
  } catch {
    return false;
  }
}
