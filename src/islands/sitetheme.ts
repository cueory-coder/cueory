/**
 * Theme rows inside a game's settings (sudoku) drive the site's own theme switch, so there is only one theme system.
 * Picking a row checks the matching radio in the footer's ThemePicker.astro and fires its change event: that applies,
 * saves and tints the browser bar exactly as a footer pick does. If the footer switch isn't on the page, the same
 * helpers from src/scripts/theme.ts apply and save the pick directly.
 */
import { applyChoice, readChoice, saveChoice, type ThemeChoice, type ThemeStorage } from '../scripts/theme';

export const THEME_ROWS: ReadonlyArray<{ value: ThemeChoice; label: string; detail: string }> = [
  { value: 'light', label: 'light mode', detail: 'always use light mode, whatever your device is set to.' },
  { value: 'dark', label: 'dark mode', detail: 'always use dark mode, whatever your device is set to.' },
  { value: 'device', label: 'follow device', detail: 'match your device setting.' },
];

interface PickerInput { checked: boolean; dispatchEvent(event: Event): boolean }
export interface ThemeDocument {
  documentElement: { dataset: DOMStringMap };
  querySelector(selectors: string): unknown;
}

export function currentSiteTheme(storage: ThemeStorage | undefined): ThemeChoice {
  return readChoice(storage);
}

export function chooseSiteTheme(doc: ThemeDocument, storage: ThemeStorage | undefined, choice: ThemeChoice): void {
  const input = doc.querySelector(`[data-theme-picker] input[name="theme"][value="${choice}"]`) as PickerInput | null;
  if (input && typeof input.dispatchEvent === 'function') {
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  applyChoice(doc.documentElement, choice);
  saveChoice(storage, choice);
}
