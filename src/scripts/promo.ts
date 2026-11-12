/**
 * The once-only promo panel (D-59). Pure helpers, kept apart from the page script in PromoPanel.astro so they can be
 * unit tested (tests/unit/promo.test.ts). This browser remembers a date, or an explicit permanent opt-out,
 * only in local storage; neither leaves the device.
 */
import type { KeyValueStorage } from './storage';

/** Local-storage key: when the panel was last shown, closed or clicked, in milliseconds since 1 January 1970. */
export const PROMO_STORAGE_KEY = 'cueory-promo-seen';
/** Optional permanent opt-out, distinct from the usual 30-day reminder. */
export const PROMO_DISMISSED_FOREVER = 'never';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The saved-state eligibility check, independent of browser APIs and timer scheduling. */
export function mayShowSaved(now: number, saved: string | null, rememberDays: number): boolean {
  if (saved?.trim() === PROMO_DISMISSED_FOREVER) return false;
  if (saved === null || !/^\d+$/.test(saved.trim())) return true;
  const lastShown = Number(saved);
  if (!Number.isSafeInteger(lastShown)) return true;
  return Math.abs(now - lastShown) >= rememberDays * DAY_MS;
}

/**
 * Whether the panel may appear now. It stays away for `rememberDays` after it was last shown, closed or clicked, so
 * it never comes back on a refresh or later in the same visit. A browser that can't remember (storage missing or
 * blocked) never sees it, because it would otherwise come back on every page. A saved value that isn't a date, or a
 * date more than `rememberDays` away in either direction (a clock that was wrong), doesn't count.
 */
export function mayShow(storage: KeyValueStorage | undefined, now: number, rememberDays: number): boolean {
  if (!storage) return false;
  try {
    return mayShowSaved(now, storage.getItem(PROMO_STORAGE_KEY), rememberDays);
  } catch {
    return false;
  }
}

/**
 * Remembers that the panel was shown, closed or clicked. Returns false when this browser can't remember it; the
 * panel then doesn't open at all.
 */
export function remember(storage: KeyValueStorage | undefined, now: number): boolean {
  if (!storage) return false;
  try {
    // An explicit permanent opt-out must not be overwritten by a later close event.
    if (storage.getItem(PROMO_STORAGE_KEY) !== PROMO_DISMISSED_FOREVER) {
      storage.setItem(PROMO_STORAGE_KEY, String(Math.round(now)));
    }
    return true;
  } catch {
    return false;
  }
}

/** A separate permanent opt-out for clients that offer that choice; the standard close still snoozes for 30 days. */
export function dismissPromoForever(storage: KeyValueStorage | undefined): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PROMO_STORAGE_KEY, PROMO_DISMISSED_FOREVER);
    return true;
  } catch {
    return false;
  }
}

/** The timer remembers elapsed time while visible, not while a tab is hidden. */
export interface PromoTimerState {
  readonly remainingMs: number;
  /** When counting began, or null while paused. */
  readonly startedAt: number | null;
}

/** Deterministic delay, independent of the browser's setTimeout scheduling. */
export function promoTimeRemaining(now: number, state: PromoTimerState): number {
  const elapsed = state.startedAt === null ? 0 : Math.max(0, now - state.startedAt);
  return Math.max(0, state.remainingMs - elapsed);
}

export function resumePromoTimer(now: number, state: PromoTimerState): PromoTimerState {
  return state.startedAt === null ? { ...state, startedAt: now } : state;
}

export function pausePromoTimer(now: number, state: PromoTimerState): PromoTimerState {
  return { remainingMs: promoTimeRemaining(now, state), startedAt: null };
}

/** Inputs that affect whether the panel may interrupt the visitor. */
export interface PromoDecisionContext {
  readonly visible: boolean;
  readonly busy: boolean;
  readonly scrollFraction: number;
  readonly reducedMotion: boolean;
}

/** The single, pure show decision. All clock and saved-state values are supplied by the caller. */
export function promoDecision(
  now: number,
  saved: string | null,
  rememberDays: number,
  timerState: PromoTimerState,
  context: PromoDecisionContext,
): { show: boolean; remainingMs: number; animate: boolean } {
  const remainingMs = promoTimeRemaining(now, timerState);
  return {
    show:
      mayShowSaved(now, saved, rememberDays) &&
      context.visible &&
      !context.busy &&
      (remainingMs === 0 || context.scrollFraction >= SCROLL_TRIGGER),
    remainingMs,
    animate: !context.reducedMotion,
  };
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
