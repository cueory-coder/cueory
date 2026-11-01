/**
 * The once-only promo panel (D-59). Pure helpers, kept apart from the page script in PromoPanel.astro so they can be
 * unit tested (tests/unit/promo.test.ts). The only thing remembered is a date in this browser's local storage, which
 * never reaches us.
 */
import type { KeyValueStorage } from './storage';

/** Local-storage key: when the panel was last shown, closed or clicked, in milliseconds since 1 January 1970. */
export const PROMO_STORAGE_KEY = 'cueory-promo-seen';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether the panel may appear now. It stays away for `rememberDays` after it was last shown, closed or clicked, so
 * it never comes back on a refresh or later in the same visit. A browser that can't remember (storage missing or
 * blocked) never sees it, because it would otherwise come back on every page. A saved value that isn't a date, or a
 * date more than `rememberDays` away in either direction (a clock that was wrong), doesn't count.
 */
export function mayShow(storage: KeyValueStorage | undefined, now: number, rememberDays: number): boolean {
  if (!storage) return false;
  let saved: string | null;
  try {
    saved = storage.getItem(PROMO_STORAGE_KEY);
  } catch {
    return false;
  }
  if (saved === null || !/^\d+$/.test(saved.trim())) return true;
  return Math.abs(now - Number(saved)) >= rememberDays * DAY_MS;
}

/**
 * Remembers that the panel was shown, closed or clicked. Returns false when this browser can't remember it; the
 * panel then doesn't open at all.
 */
export function remember(storage: KeyValueStorage | undefined, now: number): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PROMO_STORAGE_KEY, String(Math.round(now)));
    return true;
  } catch {
    return false;
  }
}

/**
 * How far down the page the visitor has scrolled: 0 at the top, 1 at the bottom. A page that doesn't scroll stays at
 * 0, so only the timer can bring the panel there.
 */
export function scrollProgress(scrollTop: number, viewportHeight: number, scrollHeight: number): number {
  const scrollable = scrollHeight - viewportHeight;
  if (scrollable <= 0) return 0;
  return Math.min(1, Math.max(0, scrollTop / scrollable));
}

/** The panel appears once the visitor has scrolled this far down, if the timer hasn't brought it already. */
export const SCROLL_TRIGGER = 0.5;

/** Input types that don't take typing; every other input does. */
const NOT_TYPED = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);

/**
 * Whether keyboard focus is somewhere the visitor types or picks from a list. The panel waits while it is, so it
 * never pulls focus out of a field mid-word.
 */
export function isTextEntry(element: { tagName: string; type?: string; isContentEditable?: boolean } | null): boolean {
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  return tag === 'input' && !NOT_TYPED.has((element.type ?? 'text').toLowerCase());
}
