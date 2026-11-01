import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BREAK_SETTINGS,
  parseSettings,
  pause,
  remainingMs,
  resume,
  skipBreak,
  snooze,
  startBreak,
  startBreaks,
  statusInWords,
  tick,
  turnOff,
  turnOn,
  type BreakState,
} from '../../src/islands/breaks';

const MINUTE = 60_000;
const settings = { focusMinutes: 20, breakMinutes: 4 };
const at = 1_000_000;

const dueAt = (now = at) => tick(turnOn(startBreaks(settings), now), now + 20 * MINUTE);

describe('break settings', () => {
  it('starts off with the gentle defaults', () => {
    expect(DEFAULT_BREAK_SETTINGS).toEqual({ focusMinutes: 25, breakMinutes: 5 });
    expect(startBreaks()).toEqual({
      settings: { focusMinutes: 25, breakMinutes: 5 },
      status: 'off', endsAt: null, pausedFrom: null, pausedRemainingMs: 0,
    });
  });

  it('accepts whole minutes at the inclusive limits', () => {
    expect(parseSettings({ focusMinutes: 10, breakMinutes: 3 })).toEqual({ focusMinutes: 10, breakMinutes: 3 });
    expect(parseSettings({ focusMinutes: 60, breakMinutes: 15 })).toEqual({ focusMinutes: 60, breakMinutes: 15 });
  });

  it.each([
    null,
    {},
    { focusMinutes: 9, breakMinutes: 5 },
    { focusMinutes: 61, breakMinutes: 5 },
    { focusMinutes: 25, breakMinutes: 2 },
    { focusMinutes: 25, breakMinutes: 16 },
    { focusMinutes: 25.5, breakMinutes: 5 },
    { focusMinutes: 25, breakMinutes: '5' },
  ])('uses both defaults for old or malformed settings: %j', (value) => {
    expect(parseSettings(value)).toEqual({ focusMinutes: 25, breakMinutes: 5 });
  });
});

describe('break timer moves', () => {
  it('turns on for a full focus period and turns off without keeping a count', () => {
    const focusing = turnOn(startBreaks(settings), at);
    expect(focusing).toEqual({
      settings, status: 'focusing', endsAt: at + 20 * MINUTE, pausedFrom: null, pausedRemainingMs: 0,
    });
    expect(turnOff(focusing, at + MINUTE)).toEqual({
      settings, status: 'off', endsAt: null, pausedFrom: null, pausedRemainingMs: 0,
    });
  });

  it('pauses the exact remainder and resumes it from a later time', () => {
    const focusing = turnOn(startBreaks(settings), at);
    const paused = pause(focusing, at + 7 * MINUTE);
    expect(paused).toMatchObject({ status: 'paused', endsAt: null, pausedFrom: 'focusing', pausedRemainingMs: 13 * MINUTE });
    const resumed = resume(paused, at + 40 * MINUTE);
    expect(resumed).toMatchObject({
      status: 'focusing', endsAt: at + 53 * MINUTE, pausedFrom: null, pausedRemainingMs: 0,
    });
  });

  it('pauses and resumes a break too', () => {
    const breaking = startBreak(dueAt(), at + 20 * MINUTE);
    const paused = pause(breaking, at + 21 * MINUTE);
    expect(paused).toMatchObject({ status: 'paused', pausedFrom: 'on break', pausedRemainingMs: 3 * MINUTE });
    expect(resume(paused, at + 30 * MINUTE)).toMatchObject({ status: 'on break', endsAt: at + 33 * MINUTE });
  });

  it('makes a focus deadline due and then waits for a choice', () => {
    const focusing = turnOn(startBreaks(settings), at);
    expect(tick(focusing, at + 20 * MINUTE - 1)).toBe(focusing);
    const due = tick(focusing, at + 20 * MINUTE);
    expect(due).toMatchObject({ status: 'break due', endsAt: null });
    expect(tick(due, at + 200 * MINUTE)).toBe(due);
  });

  it('starts a full break, then returns to a fresh focus period when it ends', () => {
    const breakStart = at + 20 * MINUTE;
    const breaking = startBreak(dueAt(), breakStart);
    expect(breaking).toMatchObject({ status: 'on break', endsAt: breakStart + 4 * MINUTE });
    expect(tick(breaking, breakStart + 4 * MINUTE)).toMatchObject({
      status: 'focusing', endsAt: breakStart + 24 * MINUTE,
    });
  });

  it('skips with no penalty and starts a normal focus period', () => {
    expect(skipBreak(dueAt(), at + 25 * MINUTE)).toEqual({
      settings, status: 'focusing', endsAt: at + 45 * MINUTE, pausedFrom: null, pausedRemainingMs: 0,
    });
  });

  it('snoozes a due break for exactly five more minutes', () => {
    const snoozed = snooze(dueAt(), at + 22 * MINUTE);
    expect(snoozed).toMatchObject({ status: 'focusing', endsAt: at + 27 * MINUTE });
    expect(tick(snoozed, at + 27 * MINUTE)).toMatchObject({ status: 'break due' });
  });

  it('ignores moves that do not fit the current state', () => {
    const off = startBreaks(settings);
    expect(pause(off, at)).toBe(off);
    expect(resume(off, at)).toBe(off);
    expect(startBreak(off, at)).toBe(off);
    expect(skipBreak(off, at)).toBe(off);
    expect(snooze(off, at)).toBe(off);
  });
});

describe('break timer words and time', () => {
  it('reports the running and paused remainder without changing it', () => {
    const focusing = turnOn(startBreaks(settings), at);
    expect(remainingMs(focusing, at + 8 * MINUTE)).toBe(12 * MINUTE);
    expect(remainingMs(focusing, at + 30 * MINUTE)).toBe(0);
    const paused = pause(focusing, at + 8 * MINUTE);
    expect(remainingMs(paused, at + 100 * MINUTE)).toBe(12 * MINUTE);
    expect(remainingMs(turnOff(focusing, at), at)).toBe(0);
  });

  it('describes every state gently in words', () => {
    const off = startBreaks(settings);
    const focusing = turnOn(off, at);
    const due = dueAt();
    const breaking = startBreak(due, at);
    const pausedFocus = pause(focusing, at + 8 * MINUTE);
    const pausedBreak = pause(breaking, at + MINUTE);
    expect(statusInWords(off, at)).toBe('break timer is off.');
    expect(statusInWords(focusing, at + 8 * MINUTE)).toBe('studying: 12 minutes left.');
    expect(statusInWords(due, at)).toBe('time for a short break.');
    expect(statusInWords(breaking, at + MINUTE)).toBe('on a break: 3 minutes left.');
    expect(statusInWords(pausedFocus, at + 100 * MINUTE)).toBe('studying paused: 12 minutes left.');
    expect(statusInWords(pausedBreak, at + 100 * MINUTE)).toBe('break paused: 3 minutes left.');
  });

  it('uses a singular minute and never mentions pressure language', () => {
    const focusing = turnOn(startBreaks({ focusMinutes: 10, breakMinutes: 3 }), at);
    expect(statusInWords(focusing, at + 9 * MINUTE)).toBe('studying: 1 minute left.');
    const states: BreakState[] = [startBreaks(), focusing, dueAt(), startBreak(dueAt(), at), pause(focusing, at)];
    for (const state of states) expect(statusInWords(state, at)).not.toMatch(/streak/i);
    expect(JSON.stringify(states)).not.toMatch(/streak/i);
  });
});
