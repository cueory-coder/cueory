import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BREAK_STORAGE_KEY, readBreakState, writeBreakState } from '../../src/scripts/breakstore';
import {
  DEFAULT_BREAK_SETTINGS,
  applyMove,
  breakAnnouncement,
  nextRefreshMs,
  roundedMinutesLeft,
  parseSettings,
  pause,
  remainingMs,
  resume,
  restoredBreakNeedsSave,
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

describe('restored timer persistence decisions', () => {
  function stored(state: BreakState, savedAt = at) {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    expect(writeBreakState(storage, state, savedAt)).toBe(true);
    return { storage, raw: storage.getItem(BREAK_STORAGE_KEY)! };
  }

  it('keeps unchanged running, paused, due and off records without renewing their age', () => {
    const running = turnOn(startBreaks(settings), at);
    for (const state of [running, pause(running, at), dueAt(), startBreaks(settings)]) {
      const { storage, raw } = stored(state);
      const restored = readBreakState(storage, at + MINUTE);
      expect(restoredBreakNeedsSave(raw, restored)).toBe(false);
      expect(JSON.parse(storage.getItem(BREAK_STORAGE_KEY)!).savedAt).toBe(at);
    }
  });

  it('ignores object property order when comparing an unchanged saved state', () => {
    const { storage, raw } = stored(turnOn(startBreaks(settings), at));
    const record = JSON.parse(raw);
    record.state = Object.fromEntries(Object.entries(record.state).reverse());
    record.state.settings = { breakMinutes: settings.breakMinutes, focusMinutes: settings.focusMinutes };
    expect(restoredBreakNeedsSave(JSON.stringify(record), readBreakState(storage, at + MINUTE))).toBe(false);
  });

  it('requires saving the new focus phase after an elapsed saved break', () => {
    const { storage, raw } = stored(startBreak(dueAt(), at));
    const restored = readBreakState(storage, at + 5 * MINUTE);
    expect(restored).toMatchObject({ status: 'focusing', endsAt: at + 25 * MINUTE });
    expect(restoredBreakNeedsSave(raw, restored)).toBe(true);
  });

  it('requires saving a due phase after an elapsed saved focus', () => {
    const { storage, raw } = stored(turnOn(startBreaks(settings), at));
    const restored = readBreakState(storage, at + 21 * MINUTE);
    expect(restored.status).toBe('break due');
    expect(restoredBreakNeedsSave(raw, restored)).toBe(true);
  });

  it('requires saving changed explicit settings for an off timer', () => {
    const { raw } = stored(startBreaks());
    expect(restoredBreakNeedsSave(raw, startBreaks(settings))).toBe(true);
  });

  it('can replace malformed or expired state with the safe off state', () => {
    for (const raw of ['invalid json', 'null', '[]', '{}', '{"state":null}', '{"state":{"settings":[]}}']) {
      expect(restoredBreakNeedsSave(raw, startBreaks())).toBe(true);
    }
    const { storage, raw } = stored(pause(turnOn(startBreaks(settings), at), at));
    const restored = readBreakState(storage, at + 121 * MINUTE);
    expect(restored.status).toBe('off');
    expect(restoredBreakNeedsSave(raw, restored)).toBe(true);
  });
});

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

describe('W19: deadlines survive stopped callbacks and blocked storage', () => {
  const start = Date.UTC(2026, 10, 1, 12);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(start);
  });
  afterEach(() => vi.useRealTimers());

  it('uses the saved end time after a long hidden-tab sleep instead of counting callbacks', () => {
    const focusing = turnOn(startBreaks(settings), Date.now());
    expect(focusing.endsAt).toBe(start + 20 * MINUTE);
    vi.setSystemTime(start + 19 * MINUTE + 59_999);
    expect(remainingMs(focusing, Date.now())).toBe(1);
    expect(statusInWords(focusing, Date.now())).toBe('studying: 1 minute left.');
    vi.setSystemTime(start + 21 * MINUTE);
    expect(remainingMs(focusing, Date.now())).toBe(0);
    expect(tick(focusing, Date.now()).status).toBe('break due');
  });

  it('does not pause an already-finished phase while a hidden view is stale', () => {
    const focus = turnOn(startBreaks(settings), Date.now());
    vi.setSystemTime(start + 30 * MINUTE);
    expect(pause(focus, Date.now()).status).toBe('break due');
    const activeBreak = startBreak(dueAt(start), start);
    vi.setSystemTime(start + 4 * MINUTE);
    expect(pause(activeBreak, Date.now())).toMatchObject({
      status: 'focusing', endsAt: start + 24 * MINUTE,
    });
  });

  it('keeps the pause exactly through sleep and resumes with the remaining milliseconds', () => {
    const focusing = turnOn(startBreaks(settings), Date.now());
    vi.setSystemTime(start + 6 * MINUTE + 500);
    const paused = pause(focusing, Date.now());
    expect(paused.pausedRemainingMs).toBe(14 * MINUTE - 500);
    vi.setSystemTime(start + 90 * MINUTE);
    expect(remainingMs(paused, Date.now())).toBe(14 * MINUTE - 500);
    const resumed = resume(paused, Date.now());
    expect(resumed.endsAt).toBe(Date.now() + 14 * MINUTE - 500);
    vi.setSystemTime(resumed.endsAt!);
    expect(tick(resumed, Date.now()).status).toBe('break due');
  });

  it('finishes a break at the waking time, not at a delayed timeout count', () => {
    const due = tick(turnOn(startBreaks(settings), start - 20 * MINUTE), start);
    const breaking = startBreak(due, start);
    vi.setSystemTime(start + 50 * MINUTE);
    const next = tick(breaking, Date.now());
    expect(next.status).toBe('focusing');
    expect(next.endsAt).toBe(Date.now() + 20 * MINUTE);
  });

  it('keeps the timer functional in memory when session storage throws', () => {
    const blocked = {
      getItem: (_key: string): string | null => { throw new Error('blocked'); },
      setItem: (_key: string, _value: string): void => { throw new Error('blocked'); },
      removeItem: (_key: string): void => { throw new Error('blocked'); },
    };
    const off = readBreakState(blocked, Date.now());
    const focusing = turnOn(off, Date.now());
    expect(writeBreakState(blocked, focusing, Date.now())).toBe(false);
    vi.setSystemTime(start + 10 * MINUTE);
    expect(remainingMs(focusing, Date.now())).toBe(15 * MINUTE);
    expect(pause(focusing, Date.now()).status).toBe('paused');
  });
});

describe('W19: minute-boundary refresh precision', () => {
  it('refreshes when the rounded minute label changes after partial-minute resume', () => {
    const active = turnOn(startBreaks(settings), at);
    expect(nextRefreshMs(active, at)).toBe(MINUTE);
    expect(nextRefreshMs(active, at + 30_000)).toBe(30_000);
    expect(nextRefreshMs(active, at + 3 * MINUTE + 1)).toBe(MINUTE - 1);
    expect(nextRefreshMs(active, at + 20 * MINUTE - 1)).toBe(1);
    expect(nextRefreshMs(active, at + 20 * MINUTE)).toBe(0);
  });

  it('does not schedule a refresh for a paused or inactive timer', () => {
    const running = turnOn(startBreaks(settings), at);
    expect(nextRefreshMs(pause(running, at + 12_345), at + 100 * MINUTE)).toBe(0);
    expect(nextRefreshMs(turnOff(running, at), at)).toBe(0);
    expect(nextRefreshMs(tick(running, at + 20 * MINUTE), at + 20 * MINUTE)).toBe(0);
  });
});

describe('W19: pure accessible announcements', () => {
  const base = turnOn(startBreaks(), at);

  it('announces phase changes, including break due, paused, and off', () => {
    const due = tick(base, at + 25 * MINUTE);
    const paused = pause(base, at + 7 * MINUTE);
    expect(breakAnnouncement({ status: 'off', minutes: 0 }, base, at)).toBe('studying: 25 minutes left.');
    expect(breakAnnouncement({ status: 'focusing', minutes: 1 }, due, at + 25 * MINUTE))
      .toBe('time for a short break.');
    expect(breakAnnouncement({ status: 'focusing', minutes: 18 }, paused, at + 7 * MINUTE))
      .toBe('studying paused: 18 minutes left.');
    expect(breakAnnouncement({ status: 'paused', minutes: 18 }, turnOff(paused, at), at))
      .toBe('break timer is off.');
  });

  it('does not announce an ordinary minute change from 25 to 24', () => {
    expect(roundedMinutesLeft(base, at + MINUTE)).toBe(24);
    expect(breakAnnouncement({ status: 'focusing', minutes: 25 }, base, at + MINUTE)).toBeNull();
  });

  it('announces a five-minute boundary from 21 to 20', () => {
    expect(breakAnnouncement({ status: 'focusing', minutes: 21 }, base, at + 5 * MINUTE))
      .toBe('studying: 20 minutes left.');
  });

  it('announces the final minute from 2 to 1', () => {
    expect(breakAnnouncement({ status: 'focusing', minutes: 2 }, base, at + 24 * MINUTE))
      .toBe('studying: 1 minute left.');
  });

  it('does not repeat an unchanged minute or announce minute-only marks when paused or off', () => {
    const paused = pause(base, at + 7 * MINUTE);
    const off = turnOff(base, at);
    expect(breakAnnouncement({ status: 'focusing', minutes: 20 }, base, at + 5 * MINUTE)).toBeNull();
    expect(breakAnnouncement({ status: 'paused', minutes: 20 }, paused, at + 70 * MINUTE)).toBeNull();
    expect(breakAnnouncement({ status: 'off', minutes: 5 }, off, at + 70 * MINUTE)).toBeNull();
  });

  it('announces meaningful marks while on a break but not while break is due', () => {
    const breaking = startBreak(tick(base, at + 25 * MINUTE), at + 25 * MINUTE);
    expect(breakAnnouncement({ status: 'on break', minutes: 2 }, breaking, at + 29 * MINUTE))
      .toBe('on a break: 1 minute left.');
    const due = tick(base, at + 25 * MINUTE);
    expect(breakAnnouncement({ status: 'break due', minutes: 1 }, due, at + 90 * MINUTE)).toBeNull();
  });
});

describe('W19: pure settle-first user moves', () => {
  const focusing = turnOn(startBreaks(settings), at);
  const breaking = startBreak(tick(focusing, at + 20 * MINUTE), at + 20 * MINUTE);

  it('uses pause itself to settle an expired focus or break without freezing the next phase', () => {
    expect(applyMove(pause, focusing, at + 20 * MINUTE)).toMatchObject({
      status: 'break due', endsAt: null,
    });
    expect(applyMove(pause, breaking, at + 24 * MINUTE)).toMatchObject({
      status: 'focusing', endsAt: at + 44 * MINUTE, pausedFrom: null,
    });
  });

  it('keeps a normal pause precise, then resumes its remaining time', () => {
    const paused = applyMove(pause, focusing, at + 7 * MINUTE + 501);
    expect(paused).toMatchObject({ status: 'paused', pausedRemainingMs: 13 * MINUTE - 501 });
    expect(applyMove(resume, paused, at + 100 * MINUTE)).toMatchObject({
      status: 'focusing', endsAt: at + 113 * MINUTE - 501,
    });
  });

  it('starts a break when a stale focusing view has just expired', () => {
    expect(applyMove(startBreak, focusing, at + 20 * MINUTE)).toMatchObject({
      status: 'on break', endsAt: at + 24 * MINUTE,
    });
  });

  it('settles an expired break before resume rather than keeping its stale phase', () => {
    expect(applyMove(resume, breaking, at + 24 * MINUTE)).toMatchObject({
      status: 'focusing', endsAt: at + 44 * MINUTE,
    });
  });

  it('allows turning off an expired timer and leaves no pending deadline', () => {
    expect(applyMove(turnOff, breaking, at + 24 * MINUTE)).toMatchObject({
      status: 'off', endsAt: null, pausedFrom: null, pausedRemainingMs: 0,
    });
  });

  it('settles a stale focus before skip or snooze', () => {
    expect(applyMove(skipBreak, focusing, at + 20 * MINUTE)).toMatchObject({
      status: 'focusing', endsAt: at + 40 * MINUTE,
    });
    expect(applyMove(snooze, focusing, at + 20 * MINUTE)).toMatchObject({
      status: 'focusing', endsAt: at + 25 * MINUTE,
    });
  });
});
