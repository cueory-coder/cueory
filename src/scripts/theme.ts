/**
 * Light / Dark / Follow device (brand spec section 9). Pure helpers, kept separate so they can be unit tested.
 * A Light or Dark pick sets <html data-theme="…">, which tokens.css uses to choose the palette.
 * Follow device removes it, so the device setting decides again.
 *
 * themeHeadScript repeats readChoice in <head> so a saved pick applies before the page paints.
 */

export type ThemeChoice = 'light' | 'dark' | 'device';

export const THEME_STORAGE_KEY = 'cueory-theme';

/**
 * Inline <head> script (Layout.astro). Astro doesn't hash hand-written inline scripts, so astro.config.mjs adds
 * this exact text's hash to the CSP. Change it here only.
 */
export const themeHeadScript =
  `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
  `if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Browser storage can be missing or blocked (private windows, strict settings). Then picks just aren't remembered. */
export function browserStorage(): ThemeStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

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
