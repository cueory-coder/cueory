/** Pure state for the optional break timer. Time always comes from the caller. */

export interface BreakSettings {
  focusMinutes: number;
  breakMinutes: number;
}

export type BreakStatus = 'off' | 'focusing' | 'break due' | 'on break' | 'paused';
type RunningStatus = 'focusing' | 'on break';

export interface BreakState {
  settings: BreakSettings;
  status: BreakStatus;
  /** The time this focus or break ends. Null while the clock is not running. */
  endsAt: number | null;
  /** What was running before a pause, so resume can continue it. */
  pausedFrom: RunningStatus | null;
  pausedRemainingMs: number;
}

export const DEFAULT_BREAK_SETTINGS: Readonly<BreakSettings> = {
  focusMinutes: 25,
  breakMinutes: 5,
};

const MINUTE_MS = 60_000;
const SNOOZE_MS = 5 * MINUTE_MS;

/** Old or malformed saved settings quietly fall back to the gentle defaults. */
export function parseSettings(data: unknown): BreakSettings {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ...DEFAULT_BREAK_SETTINGS };
  const value = data as Record<string, unknown>;
  if (
    !Number.isInteger(value.focusMinutes)
    || (value.focusMinutes as number) < 10
    || (value.focusMinutes as number) > 60
    || !Number.isInteger(value.breakMinutes)
    || (value.breakMinutes as number) < 3
    || (value.breakMinutes as number) > 15
  ) return { ...DEFAULT_BREAK_SETTINGS };
  return { focusMinutes: value.focusMinutes as number, breakMinutes: value.breakMinutes as number };
}

function stopped(settings: BreakSettings): BreakState {
  return { settings, status: 'off', endsAt: null, pausedFrom: null, pausedRemainingMs: 0 };
}

function focus(settings: BreakSettings, now: number, durationMs = settings.focusMinutes * MINUTE_MS): BreakState {
  return { settings, status: 'focusing', endsAt: now + durationMs, pausedFrom: null, pausedRemainingMs: 0 };
}

function breakDue(settings: BreakSettings): BreakState {
  return { settings, status: 'break due', endsAt: null, pausedFrom: null, pausedRemainingMs: 0 };
}

function onBreak(settings: BreakSettings, now: number): BreakState {
  return {
    settings,
    status: 'on break',
    endsAt: now + settings.breakMinutes * MINUTE_MS,
    pausedFrom: null,
    pausedRemainingMs: 0,
  };
}

/** The default state. Calling this never starts a clock. */
export function startBreaks(settings: unknown = DEFAULT_BREAK_SETTINGS): BreakState {
  return stopped(parseSettings(settings));
}

export function turnOn(state: BreakState, now: number): BreakState {
  return focus(state.settings, now);
}

export function turnOff(state: BreakState, _now: number): BreakState {
  return stopped(state.settings);
}

export function pause(state: BreakState, now: number): BreakState {
  // A phone can wake after the deadline while the old pause button is still visible.
  // Settle that phase first rather than freezing a finished timer at zero.
  const settled = tick(state, now);
  if (settled !== state) return settled;
  if (state.status !== 'focusing' && state.status !== 'on break') return state;
  return {
    ...state,
    status: 'paused',
    endsAt: null,
    pausedFrom: state.status,
    pausedRemainingMs: Math.max(0, (state.endsAt ?? now) - now),
  };
}

export function resume(state: BreakState, now: number): BreakState {
  if (state.status !== 'paused' || !state.pausedFrom) return state;
  const running: BreakState = {
    ...state,
    status: state.pausedFrom,
    endsAt: now + state.pausedRemainingMs,
    pausedFrom: null,
    pausedRemainingMs: 0,
  };
  return tick(running, now);
}

export function startBreak(state: BreakState, now: number): BreakState {
  return state.status === 'break due' ? onBreak(state.settings, now) : state;
}

/** Declining a suggestion simply starts a fresh focus period. */
export function skipBreak(state: BreakState, now: number): BreakState {
  return state.status === 'break due' ? focus(state.settings, now) : state;
}

/** Continue studying for five minutes before the same gentle suggestion returns. */
export function snooze(state: BreakState, now: number): BreakState {
  return state.status === 'break due' ? focus(state.settings, now, SNOOZE_MS) : state;
}

/** Apply a deadline once. A due break waits for the student and never advances itself. */
export function tick(state: BreakState, now: number): BreakState {
  if (state.endsAt === null || now < state.endsAt) return state;
  if (state.status === 'focusing') return breakDue(state.settings);
  if (state.status === 'on break') return focus(state.settings, now);
  return state;
}

export function remainingMs(state: BreakState, now: number): number {
  if (state.status === 'paused') return state.pausedRemainingMs;
  if ((state.status === 'focusing' || state.status === 'on break') && state.endsAt !== null) {
    return Math.max(0, state.endsAt - now);
  }
  return 0;
}

/** Delay until the next whole-minute label changes, not merely 60 seconds since the last render. */
export function nextRefreshMs(state: BreakState, now: number): number {
  if (state.status !== 'focusing' && state.status !== 'on break') return 0;
  const remaining = remainingMs(state, now);
  if (remaining === 0) return 0;
  return remaining % MINUTE_MS || MINUTE_MS;
}

function minutesLeft(state: BreakState, now: number): string {
  const minutes = Math.ceil(remainingMs(state, now) / MINUTE_MS);
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left`;
}

export function statusInWords(state: BreakState, now: number): string {
  if (state.status === 'off') return 'break timer is off.';
  if (state.status === 'focusing') return `studying: ${minutesLeft(state, now)}.`;
  if (state.status === 'break due') return 'time for a short break.';
  if (state.status === 'on break') return `on a break: ${minutesLeft(state, now)}.`;
  if (state.pausedFrom === 'on break') return `break paused: ${minutesLeft(state, now)}.`;
  return `studying paused: ${minutesLeft(state, now)}.`;
}
