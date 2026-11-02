import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pause, resume, startBreak, startBreaks, tick, turnOn, type BreakState } from '../../src/islands/breaks';
import {
  BREAK_STORAGE_KEY,
  BREAK_STORAGE_MAX_AGE_MS,
  BREAK_STORAGE_VERSION,
  readBreakState,
  writeBreakState,
} from '../../src/scripts/breakstore';
import type { KeyValueStorage } from '../../src/scripts/storage';

const NOW = Date.UTC(2026, 10, 1, 12);
const MINUTE = 60_000;
const settings = { focusMinutes: 20, breakMinutes: 4 };

function memory(): KeyValueStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, text) => void values.set(key, text),
    removeItem: (key) => void values.delete(key),
  };
}

function savedState(storage: ReturnType<typeof memory>, state: unknown, savedAt = NOW, version: number = BREAK_STORAGE_VERSION) {
  storage.setItem(BREAK_STORAGE_KEY, JSON.stringify({ version, savedAt, state }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('break timer across study pages (sessionStorage)', () => {
  it('starts off when there is nothing in storage and does not create a record on read', () => {
    const storage = memory();
    expect(readBreakState(storage, NOW)).toEqual(startBreaks());
    expect(storage.values.size).toBe(0);
  });

  it('round trips a running focus timer with its custom settings, deadline and version', () => {
    const storage = memory();
    const state = turnOn(startBreaks(settings), NOW);
    expect(writeBreakState(storage, state)).toBe(true);
    expect(JSON.parse(storage.getItem(BREAK_STORAGE_KEY)!)).toEqual({ version: 1, savedAt: NOW, state });
    expect(readBreakState(storage, NOW + 7 * MINUTE)).toEqual(state);
  });

  it('turns a finished focus period into break due when returning on another page', () => {
    const storage = memory();
    const state = turnOn(startBreaks(settings), NOW);
    writeBreakState(storage, state);
    expect(readBreakState(storage, NOW + 20 * MINUTE - 1).status).toBe('focusing');
    expect(readBreakState(storage, NOW + 20 * MINUTE)).toEqual({
      settings, status: 'break due', endsAt: null, pausedFrom: null, pausedRemainingMs: 0,
    });
  });

  it('resumes a finished break as a fresh focus phase, using the current time', () => {
    const storage = memory();
    const due = tick(turnOn(startBreaks(settings), NOW - 20 * MINUTE), NOW);
    const activeBreak = startBreak(due, NOW);
    writeBreakState(storage, activeBreak);
    expect(readBreakState(storage, NOW + 4 * MINUTE)).toEqual(turnOn(startBreaks(settings), NOW + 4 * MINUTE));
  });

  it('keeps paused focus and paused break states paused even after time passes', () => {
    const storage = memory();
    const focus = pause(turnOn(startBreaks(settings), NOW), NOW + 3 * MINUTE);
    savedState(storage, focus);
    const readFocus = readBreakState(storage, NOW + 40 * MINUTE);
    expect(readFocus).toEqual(focus);
    expect(resume(readFocus, NOW + 40 * MINUTE).endsAt).toBe(NOW + 57 * MINUTE);

    const due = tick(turnOn(startBreaks(settings), NOW - 20 * MINUTE), NOW);
    const pausedBreak = pause(startBreak(due, NOW), NOW + MINUTE);
    savedState(storage, pausedBreak);
    expect(readBreakState(storage, NOW + 50 * MINUTE)).toEqual(pausedBreak);
  });

  it('keeps off and break due states unchanged without starting any clock', () => {
    const storage = memory();
    const off = startBreaks(settings);
    savedState(storage, off);
    expect(readBreakState(storage, NOW + MINUTE)).toEqual(off);
    const due = tick(turnOn(startBreaks(settings), NOW - 20 * MINUTE), NOW);
    savedState(storage, due);
    expect(readBreakState(storage, NOW + MINUTE)).toEqual(due);
  });

  it('accepts exactly 2 hours of age but discards a record one millisecond older', () => {
    const storage = memory();
    savedState(storage, startBreaks(settings));
    expect(readBreakState(storage, NOW + BREAK_STORAGE_MAX_AGE_MS)).toEqual(startBreaks(settings));
    expect(readBreakState(storage, NOW + BREAK_STORAGE_MAX_AGE_MS + 1)).toEqual(startBreaks());
  });

  it('rejects malformed JSON, wrong version, timestamps in the future and absent state', () => {
    const storage = memory();
    for (const text of [
      'not json', 'null', '[]', '"break"', '{}',
      JSON.stringify({ version: 99, savedAt: NOW, state: startBreaks(settings) }),
      JSON.stringify({ version: 1, savedAt: NOW + 1, state: startBreaks(settings) }),
      JSON.stringify({ version: 1, savedAt: NOW }),
    ]) {
      storage.setItem(BREAK_STORAGE_KEY, text);
      expect(readBreakState(storage, NOW)).toEqual(startBreaks());
    }
  });

  it('rejects incorrect settings, invalid status and impossible field combinations', () => {
    const storage = memory();
    const valid = turnOn(startBreaks(settings), NOW);
    const badStates: unknown[] = [
      { ...valid, settings: { focusMinutes: 99, breakMinutes: 4 } },
      { ...valid, settings: { focusMinutes: 20 } },
      { ...valid, status: 'hacked' },
      { ...valid, endsAt: null },
      { ...valid, endsAt: NOW + 90 * MINUTE },
      { ...valid, pausedFrom: 'focusing' },
      { ...valid, pausedRemainingMs: MINUTE },
      { ...startBreaks(settings), endsAt: NOW + MINUTE },
      { ...startBreaks(settings), pausedRemainingMs: 10 },
      { ...pause(valid, NOW), pausedFrom: 'other' },
      { ...pause(valid, NOW), pausedRemainingMs: 90 * MINUTE },
      { ...pause(valid, NOW), endsAt: NOW + MINUTE },
      { ...valid, pausedRemainingMs: -1 },
      { ...valid, pausedRemainingMs: Infinity },
    ];
    for (const state of badStates) {
      savedState(storage, state);
      expect(readBreakState(storage, NOW)).toEqual(startBreaks());
    }
  });

  it('never throws when sessionStorage is blocked or missing', () => {
    const blocked: KeyValueStorage = {
      getItem: () => { throw new Error('private mode'); },
      setItem: () => { throw new Error('private mode'); },
      removeItem: () => { throw new Error('private mode'); },
    };
    expect(readBreakState(blocked, NOW)).toEqual(startBreaks());
    expect(readBreakState(undefined, NOW)).toEqual(startBreaks());
    expect(() => writeBreakState(blocked, startBreaks(settings))).not.toThrow();
    expect(writeBreakState(blocked, startBreaks(settings))).toBe(false);
    expect(writeBreakState(undefined, startBreaks(settings))).toBe(false);
  });

  it('refuses to write a malformed state rather than poisoning storage', () => {
    const storage = memory();
    expect(writeBreakState(storage, { ...startBreaks(), status: 'focusing' } as BreakState)).toBe(false);
    expect(writeBreakState(storage, startBreaks(settings), Number.NaN)).toBe(false);
    expect(writeBreakState(storage, startBreaks(settings), -1)).toBe(false);
    expect(storage.values.size).toBe(0);
  });

  it('uses the save time the caller passes and stores only the known timer fields', () => {
    const storage = memory();
    const state = turnOn(startBreaks(settings), NOW - 5 * MINUTE);
    const withExtra = { ...state, note: 'not a timer field' } as BreakState;
    expect(writeBreakState(storage, withExtra, NOW - 5 * MINUTE)).toBe(true);
    expect(JSON.parse(storage.getItem(BREAK_STORAGE_KEY)!)).toEqual({ version: 1, savedAt: NOW - 5 * MINUTE, state });
    expect(readBreakState(storage, NOW)).toEqual(state);
  });
});
