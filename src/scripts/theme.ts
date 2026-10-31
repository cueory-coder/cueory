/**
 * Light / Dark / Follow device (brand spec section 9). Pure helpers, kept separate so they can be unit tested.
 * A Light or Dark pick sets <html data-theme="…">, which tokens.css uses to choose the palette.
 * Follow device removes it, so the device setting decides again.
 *
 * themeHeadScript repeats readChoice in <head> so a saved pick applies before the page paints.
 */

import { browserStorage, type KeyValueStorage } from './storage';

export type ThemeChoice = 'light' | 'dark' | 'device';

export const THEME_STORAGE_KEY = 'cueory-theme';

/**
 * Inline <head> script (Layout.astro). Astro doesn't hash hand-written inline scripts, so astro.config.mjs adds
 * this exact text's hash to the CSP. Change it here only.
 */
export const themeHeadScript =
  `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
  `if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/** If browser storage is missing or blocked, picks just aren't remembered (src/scripts/storage.ts). */
export type ThemeStorage = KeyValueStorage;
export { browserStorage };

export function readChoice(storage: ThemeStorage | undefined): ThemeChoice {
  try {
    const saved = storage?.getItem(THEME_STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'device';
  } catch {
    return 'device';
  }
}

export function saveChoice(storage: ThemeStorage | undefined, choice: ThemeChoice): void {
  try {
    if (choice === 'device') storage?.removeItem(THEME_STORAGE_KEY);
    else storage?.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Not remembered; the pick still applies to this page.
  }
}

export function applyChoice(root: { dataset: DOMStringMap }, choice: ThemeChoice): void {
  if (choice === 'device') delete root.dataset.theme;
  else root.dataset.theme = choice;
}

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'device';
}
