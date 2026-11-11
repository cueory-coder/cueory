import { describe, expect, it } from 'vitest';
import {
  deleteStats,
  firstKeptDay,
  forgetHeldRounds,
  heldRounds,
  loadStats,
  localDay,
  reportRound,
  saveStats,
  STATS_STORAGE_KEY,
  triesInWords,
} from '../../src/islands/gameresults';
import type { KeyValueStorage } from '../../src/scripts/storage';

/** An in-memory stand-in for the browser's local storage. */
function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const TODAY = '2026-11-01';

/** Storage that refuses everything, like a browser with site data blocked. */
const refusing: KeyValueStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('private game stats on /play (D-76)', () => {
  it('writes the day in the visitor’s own time zone, with leading zeros', () => {
    expect(localDay(new Date(2026, 10, 1, 23, 59))).toBe('2026-11-01');
    expect(localDay(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
    expect(localDay(new Date(2027, 11, 31, 12))).toBe('2027-12-31');
  });

  it('is off until the record exists, and turning off deletes it', () => {
    const storage = memoryStorage();
    expect(loadStats(storage, TODAY)).toEqual({ on: false, stats: [] });
    expect(saveStats(storage, [])).toBe(true);
    expect(loadStats(storage, TODAY)).toEqual({ on: true, stats: [] });

    const result = { game: 'pulse', day: '2026-11-01', solved: true, tries: 1 } as const;
    expect(saveStats(storage, [result])).toBe(true);
    expect(JSON.parse(storage.data.get(STATS_STORAGE_KEY)!)).toEqual({ version: 1, results: [result] });
    expect(loadStats(storage, TODAY)).toEqual({ on: true, stats: [result] });

    expect(deleteStats(storage)).toBe(true);
    expect(storage.data.has(STATS_STORAGE_KEY)).toBe(false);
    expect(loadStats(storage, TODAY)).toEqual({ on: false, stats: [] });
  });

  it('keeps stats on with an empty record when the saved one can’t be read', () => {
    const storage = memoryStorage();
    storage.setItem(STATS_STORAGE_KEY, '{not json');
    expect(loadStats(storage, TODAY)).toEqual({ on: true, stats: [] });
  });

  it('treats missing or blocked storage as off, and says when it can’t save or delete', () => {
    expect(loadStats(undefined, TODAY)).toEqual({ on: false, stats: [] });
    expect(loadStats(refusing, TODAY)).toEqual({ on: false, stats: [] });
    expect(saveStats(undefined, [])).toBe(false);
    expect(saveStats(refusing, [])).toBe(false);
    expect(deleteStats(undefined)).toBe(false);
    expect(deleteStats(refusing)).toBe(false);
  });

  it('says each game’s tries in its own words, fewest first', () => {
    expect(triesInWords('pulse', { 3: 2, 1: 1 })).toBe('1 guess on 1 day, 3 guesses on 2 days.');
    expect(triesInWords('triage', { 0: 3, 1: 1 })).toBe('0 errors on 3 days, 1 error on 1 day.');
    expect(triesInWords('cueword', { 1: 1 })).toBe('1 cue on 1 day.');
    expect(triesInWords('suture', { 2: 1, 1: 4 })).toBe('1 loose stitch on 4 days, 2 loose stitches on 1 day.');
    expect(triesInWords('pulse', {})).toBe('');
  });

  it('never talks about streaks', () => {
    const words = [
      triesInWords('pulse', { 1: 1, 2: 3 }),
      triesInWords('triage', { 0: 1 }),
      triesInWords('cueword', { 0: 2 }),
      triesInWords('suture', { 5: 1 }),
    ].join(' ');
    expect(words).not.toMatch(/streak|in a row|%|score/);
  });

  it('drops results from before the last 400 days, counting today, by today’s date', () => {
    expect(firstKeptDay('2026-11-01')).toBe('2025-09-28');
    expect(firstKeptDay('2028-01-01')).toBe('2026-11-28');
    const storage = memoryStorage();
    const old = { game: 'pulse', day: '2025-09-27', solved: true, tries: 2 } as const;
    const edge = { game: 'pulse', day: '2025-09-28', solved: false, tries: 7 } as const;
    const recent = { game: 'triage', day: '2026-10-31', solved: true, tries: 0 } as const;
    expect(saveStats(storage, [old, edge, recent])).toBe(true);
    expect(loadStats(storage, '2026-11-01')).toEqual({ on: true, stats: [edge, recent] });
    // A student who comes back after a long time finds stats still on, with nothing old left.
    expect(loadStats(storage, '2028-01-01')).toEqual({ on: true, stats: [] });
  });

  it('keeps each finished round waiting until it is kept or forgotten, even before the panel has loaded', () => {
    forgetHeldRounds();
    const first = { game: 'pulse', day: '2026-11-01', solved: true, tries: 1 } as const;
    const second = { game: 'triage', day: '2026-11-01', solved: false, tries: 3 } as const;
    reportRound(first);
    reportRound(second);
    // Reading the waiting rounds leaves them waiting, and a copy can't change them.
    const waiting = heldRounds();
    expect(waiting).toEqual([first, second]);
    waiting.pop();
    expect(heldRounds()).toEqual([first, second]);
    // Forgetting one game drops only its rounds; forgetting all drops the rest.
    forgetHeldRounds('pulse');
    expect(heldRounds()).toEqual([second]);
    forgetHeldRounds();
    expect(heldRounds()).toEqual([]);
  });

  it('reporting a round never throws, even where there is no window (as during the build)', () => {
    expect(() => reportRound({ game: 'triage', day: '2026-11-01', solved: false, tries: 3 })).not.toThrow();
    forgetHeldRounds();
  });
});
