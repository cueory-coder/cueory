import { describe, expect, it } from 'vitest';
import {
  DAYS_NEEDED,
  HOME_TIP_STORAGE_KEY,
  dismissTip,
  loadTipState,
  parseTipState,
  recordFinishDay,
  saveTipState,
  serializeTipState,
  shouldShowTip,
  updateTipState,
  type HomeTipState,
} from '../../src/islands/homescreentip';
import type { KeyValueStorage } from '../../src/scripts/storage';

function memory(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const blocked: KeyValueStorage = {
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

const fresh = (): HomeTipState => ({ days: [], dismissed: false });
const browser = { standalone: false };

describe('home screen tip show rule', () => {
  it('needs puzzles finished on 3 different days', () => {
    expect(DAYS_NEEDED).toBe(3);
    let state = fresh();
    for (const day of ['2026-11-10', '2026-11-11']) {
      state = recordFinishDay(state, day);
      expect(shouldShowTip(state, browser)).toBe(false);
    }
    state = recordFinishDay(state, '2026-11-12');
    expect(shouldShowTip(state, browser)).toBe(true);
  });

  it('counts several puzzles on the same day once', () => {
    let state = fresh();
    for (let i = 0; i < 5; i++) state = recordFinishDay(state, '2026-11-12');
    state = recordFinishDay(state, '2026-11-13');
    expect(state.days).toEqual(['2026-11-12', '2026-11-13']);
    expect(shouldShowTip(state, browser)).toBe(false);
  });

  it('ignores bad days', () => {
    let state = fresh();
    for (const day of ['2026-02-30', 'today', '', 20261112, null, undefined, '2026-1-1']) state = recordFinishDay(state, day);
    expect(state.days).toEqual([]);
  });

  it('keeps at most 3 days', () => {
    let state = fresh();
    for (const day of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']) state = recordFinishDay(state, day);
    expect(state.days).toHaveLength(3);
  });

  it('stays hidden once dismissed, and stops counting', () => {
    let state: HomeTipState = { days: ['2026-11-01', '2026-11-02', '2026-11-03'], dismissed: false };
    state = dismissTip(state);
    expect(shouldShowTip(state, browser)).toBe(false);
    expect(recordFinishDay({ days: [], dismissed: true }, '2026-11-04')).toEqual({ days: [], dismissed: true });
  });

  it('stays hidden when already opened from the home screen', () => {
    const state: HomeTipState = { days: ['2026-11-01', '2026-11-02', '2026-11-03'], dismissed: false };
    expect(shouldShowTip(state, { standalone: true })).toBe(false);
  });
});

describe('home screen tip storage', () => {
  it('round-trips and survives a reload', () => {
    const storage = memory();
    for (const day of ['2026-11-01', '2026-11-02', '2026-11-03']) {
      updateTipState(storage, (state) => recordFinishDay(state, day));
    }
    expect(shouldShowTip(loadTipState(storage), browser)).toBe(true);
    updateTipState(storage, dismissTip);
    expect(loadTipState(storage).dismissed).toBe(true);
    expect(shouldShowTip(loadTipState(storage), browser)).toBe(false);
  });

  it('keeps only the known fields', () => {
    const text = serializeTipState({ days: ['2026-11-01'], dismissed: false, extra: 'x' } as HomeTipState);
    expect(JSON.parse(text)).toEqual({ days: ['2026-11-01'], dismissed: false });
  });

  it('starts fresh from broken or odd saved data', () => {
    for (const text of [null, undefined, '', '{', '[]', 'null', '"x"', '{"days":"2026-11-01"}', 42]) {
      expect(parseTipState(text)).toEqual({ days: [], dismissed: false });
    }
    expect(parseTipState('{"days":["2026-11-01","2026-11-01","bad"],"dismissed":"yes"}')).toEqual({
      days: ['2026-11-01'],
      dismissed: false,
    });
  });

  it('never throws when storage is blocked or missing', () => {
    expect(loadTipState(blocked)).toEqual({ days: [], dismissed: false });
    expect(loadTipState(undefined)).toEqual({ days: [], dismissed: false });
    expect(saveTipState(blocked, fresh())).toBe(false);
    expect(saveTipState(undefined, fresh())).toBe(false);
    expect(() => updateTipState(blocked, dismissTip)).not.toThrow();
  });

  it('uses its own storage key', () => {
    const storage = memory();
    saveTipState(storage, fresh());
    expect([...storage.data.keys()]).toEqual([HOME_TIP_STORAGE_KEY]);
  });
});
