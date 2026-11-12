import { describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '../../src/scripts/theme';
import { THEME_ROWS, chooseSiteTheme, currentSiteTheme } from '../../src/islands/sitetheme';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}

describe('sudoku theme rows follow the site theme switch', () => {
  it('offers the same three choices as the footer switch', () => {
    expect(THEME_ROWS.map((row) => row.value)).toEqual(['light', 'dark', 'device']);
    for (const row of THEME_ROWS) expect(row.label.length).toBeGreaterThan(0);
  });

  it('reads the current pick from the site theme storage', () => {
    expect(currentSiteTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'dark' }))).toBe('dark');
    expect(currentSiteTheme(memoryStorage())).toBe('device');
    expect(currentSiteTheme(undefined)).toBe('device');
  });

  it('drives the footer radio and its change event, so the footer script applies and saves the pick', () => {
    const input = { checked: false, dispatchEvent: vi.fn((_event: Event) => true) };
    const querySelector = vi.fn(() => input);
    const root = { dataset: {} as DOMStringMap };
    const storage = memoryStorage();
    chooseSiteTheme({ documentElement: root, querySelector }, storage, 'dark');
    expect(querySelector).toHaveBeenCalledWith('[data-theme-picker] input[name="theme"][value="dark"]');
    expect(input.checked).toBe(true);
    const event = input.dispatchEvent.mock.calls[0]![0];
    expect(event.type).toBe('change');
    expect(event.bubbles).toBe(true);
    // The footer script does the applying and saving, not a second copy here.
    expect(root.dataset.theme).toBeUndefined();
    expect(storage.data.size).toBe(0);
  });

  it('falls back to the shared theme helpers when the footer switch is missing', () => {
    const root = { dataset: {} as DOMStringMap };
    const storage = memoryStorage();
    chooseSiteTheme({ documentElement: root, querySelector: () => null }, storage, 'light');
    expect(root.dataset.theme).toBe('light');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('light');
    chooseSiteTheme({ documentElement: root, querySelector: () => null }, storage, 'device');
    expect(root.dataset.theme).toBeUndefined();
    expect(storage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});
