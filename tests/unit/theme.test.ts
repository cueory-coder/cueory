import { describe, expect, it } from 'vitest';
import {
  applyChoice,
  isThemeChoice,
  readChoice,
  saveChoice,
  THEME_STORAGE_KEY,
  themeHeadScript,
  type ThemeStorage,
} from '../../src/scripts/theme';

function memoryStorage(initial: Record<string, string> = {}): ThemeStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

const blockedStorage: ThemeStorage = {
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

describe('theme choice', () => {
  it('follows the device when nothing is saved', () => {
    expect(readChoice(memoryStorage())).toBe('device');
    expect(readChoice(undefined)).toBe('device');
  });

  it('reads a saved Light or Dark pick', () => {
    expect(readChoice(memoryStorage({ [THEME_STORAGE_KEY]: 'light' }))).toBe('light');
    expect(readChoice(memoryStorage({ [THEME_STORAGE_KEY]: 'dark' }))).toBe('dark');
  });

  it('ignores anything else saved under the key', () => {
    expect(readChoice(memoryStorage({ [THEME_STORAGE_KEY]: 'purple' }))).toBe('device');
  });

  it('saves Light and Dark, and forgets the pick for Follow device', () => {
    const storage = memoryStorage();
    saveChoice(storage, 'dark');
    expect(storage.data[THEME_STORAGE_KEY]).toBe('dark');
    saveChoice(storage, 'device');
    expect(storage.data).toEqual({});
  });

  it('keeps working when browser storage is blocked', () => {
    expect(readChoice(blockedStorage)).toBe('device');
    expect(() => saveChoice(blockedStorage, 'dark')).not.toThrow();
  });

  it('sets data-theme for Light and Dark and removes it for Follow device', () => {
    const root = { dataset: {} as DOMStringMap };
    applyChoice(root, 'dark');
    expect(root.dataset.theme).toBe('dark');
    applyChoice(root, 'light');
    expect(root.dataset.theme).toBe('light');
    applyChoice(root, 'device');
    expect(root.dataset.theme).toBeUndefined();
  });

  it('accepts only the three choices', () => {
    expect(['light', 'dark', 'device'].every(isThemeChoice)).toBe(true);
    expect(isThemeChoice('system')).toBe(false);
  });
});

describe('head script', () => {
  function runHeadScript(saved: Record<string, string> | 'blocked') {
    const documentElement = { dataset: {} as DOMStringMap };
    const localStorage = saved === 'blocked' ? blockedStorage : memoryStorage(saved);
    new Function('localStorage', 'document', themeHeadScript)(localStorage, { documentElement });
    return documentElement.dataset.theme;
  }

  it('applies a saved pick the same way as readChoice', () => {
    expect(runHeadScript({ [THEME_STORAGE_KEY]: 'dark' })).toBe('dark');
    expect(runHeadScript({ [THEME_STORAGE_KEY]: 'light' })).toBe('light');
    expect(runHeadScript({ [THEME_STORAGE_KEY]: 'purple' })).toBeUndefined();
    expect(runHeadScript({})).toBeUndefined();
    expect(runHeadScript('blocked')).toBeUndefined();
  });
});
