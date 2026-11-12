import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promo, site } from '../../src/config/site';
import {
  dismissPromoForever,
  isTextEntry,
  mayShow,
  mayShowSaved,
  pausePromoTimer,
  PROMO_DISMISSED_FOREVER,
  PROMO_STORAGE_KEY,
  promoDecision,
  promoTimeRemaining,
  remember,
  resumePromoTimer,
  SCROLL_TRIGGER,
  scrollProgress,
} from '../../src/scripts/promo';
import type { KeyValueStorage } from '../../src/scripts/storage';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 1, 12);

function memory(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key]! : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
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

describe('once-only promo panel (D-59)', () => {
  it('shows to a visitor it has never been shown to', () => {
    expect(mayShow(memory(), NOW, 30)).toBe(true);
  });

  it('stays away for 30 days after it was shown, closed or clicked, so never on a refresh or later in the visit', () => {
    const storage = memory();
    expect(remember(storage, NOW)).toBe(true);
    expect(storage.data[PROMO_STORAGE_KEY]).toBe(String(NOW));
    expect(mayShow(storage, NOW, 30)).toBe(false);
    expect(mayShow(storage, NOW + 1000, 30)).toBe(false);
    expect(mayShow(storage, NOW + 29 * DAY, 30)).toBe(false);
    expect(mayShow(storage, NOW + 30 * DAY, 30)).toBe(true);
  });

  it('never shows in a browser that cannot remember it, so it cannot come back on every page', () => {
    expect(mayShow(undefined, NOW, 30)).toBe(false);
    expect(mayShow(blocked, NOW, 30)).toBe(false);
    expect(remember(undefined, NOW)).toBe(false);
    expect(remember(blocked, NOW)).toBe(false);
  });

  it('ignores a saved value that is not a date, or a date far off from a clock that was wrong', () => {
    expect(mayShow(memory({ [PROMO_STORAGE_KEY]: 'yes' }), NOW, 30)).toBe(true);
    expect(mayShow(memory({ [PROMO_STORAGE_KEY]: '' }), NOW, 30)).toBe(true);
    expect(mayShow(memory({ [PROMO_STORAGE_KEY]: '-5' }), NOW, 30)).toBe(true);
    expect(mayShow(memory({ [PROMO_STORAGE_KEY]: String(NOW + 400 * DAY) }), NOW, 30)).toBe(true);
    // A clock a few hours behind still counts as "just shown".
    expect(mayShow(memory({ [PROMO_STORAGE_KEY]: String(NOW + 3 * 60 * 60 * 1000) }), NOW, 30)).toBe(false);
  });

  it('measures how far down the page the visitor has scrolled', () => {
    expect(scrollProgress(0, 800, 4000)).toBe(0);
    expect(scrollProgress(1600, 800, 4000)).toBe(0.5);
    expect(scrollProgress(3200, 800, 4000)).toBe(1);
    expect(scrollProgress(5000, 800, 4000)).toBe(1);
    expect(scrollProgress(-40, 800, 4000)).toBe(0);
    // A page that doesn't scroll never counts as scrolled halfway: only the timer brings the panel there.
    expect(scrollProgress(0, 800, 800)).toBe(0);
    expect(scrollProgress(0, 800, 600)).toBe(0);
    expect(SCROLL_TRIGGER).toBe(0.5);
  });

  it('waits while the visitor is typing or picking from a list', () => {
    expect(isTextEntry(null)).toBe(false);
    expect(isTextEntry({ tagName: 'BODY' })).toBe(false);
    expect(isTextEntry({ tagName: 'A' })).toBe(false);
    expect(isTextEntry({ tagName: 'BUTTON', type: 'button' })).toBe(false);
    expect(isTextEntry({ tagName: 'INPUT', type: 'radio' })).toBe(false);
    expect(isTextEntry({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTextEntry({ tagName: 'INPUT', type: 'submit' })).toBe(false);
    expect(isTextEntry({ tagName: 'INPUT', type: 'email' })).toBe(true);
    expect(isTextEntry({ tagName: 'INPUT', type: 'search' })).toBe(true);
    expect(isTextEntry({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTextEntry({ tagName: 'INPUT' })).toBe(true);
    expect(isTextEntry({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextEntry({ tagName: 'SELECT' })).toBe(true);
    expect(isTextEntry({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('uses the settings Christian asked for, in the lowercase voice', () => {
    expect(promo.delaySeconds).toBe(5);
    expect(promo.rememberDays).toBe(30);
    for (const text of [promo.heading, promo.text, promo.joinLabel, promo.supportLabel]) {
      expect(text).toBe(text.toLowerCase());
    }
    expect(promo.joinLabel).toBe('join the launch list');
    expect(promo.supportLabel).toBe('supporting our mission');
    expect(site.tipPageUrl).toBe('https://ko-fi.com/cueory');
  });

  it('is never on study screens and is off on the signup thank-you page', () => {
    const layout = readFileSync(new URL('../../src/layouts/Layout.astro', import.meta.url), 'utf8');
    expect(layout).toContain('const showPromo = promoSettings.show && promo && !isStudy;');
    const subscribed = readFileSync(new URL('../../src/pages/subscribed.astro', import.meta.url), 'utf8');
    expect(subscribed).toContain('promo={false}');
  });
});


describe('deterministic promo timing (W14)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const readyContext = { visible: true, busy: false, scrollFraction: 0, reducedMotion: false };
  const newTimer = () => resumePromoTimer(Date.now(), { remainingMs: promo.delaySeconds * 1000, startedAt: null });

  it('waits for exactly five seconds of visible time, without a real sleep', () => {
    const timer = newTimer();
    expect(promoDecision(Date.now(), null, 30, timer, readyContext).show).toBe(false);
    vi.advanceTimersByTime(4_999);
    expect(promoDecision(Date.now(), null, 30, timer, readyContext)).toEqual({
      show: false,
      remainingMs: 1,
      animate: true,
    });
    vi.advanceTimersByTime(1);
    expect(promoDecision(Date.now(), null, 30, timer, readyContext).show).toBe(true);
  });

  it('opens early after halfway scroll, but never while busy or hidden', () => {
    const timer = newTimer();
    vi.advanceTimersByTime(1_000);
    expect(promoDecision(Date.now(), null, 30, timer, { ...readyContext, scrollFraction: 0.5 }).show).toBe(true);
    expect(promoDecision(Date.now(), null, 30, timer, { ...readyContext, busy: true, scrollFraction: 0.5 }).show).toBe(false);
    expect(promoDecision(Date.now(), null, 30, timer, { ...readyContext, visible: false, scrollFraction: 0.5 }).show).toBe(false);
  });

  it('pauses while hidden and keeps the remaining time when the tab returns', () => {
    let timer = newTimer();
    vi.advanceTimersByTime(2_000);
    timer = pausePromoTimer(Date.now(), timer);
    vi.advanceTimersByTime(60_000);
    expect(promoTimeRemaining(Date.now(), timer)).toBe(3_000);
    expect(promoDecision(Date.now(), null, 30, timer, { ...readyContext, visible: false }).show).toBe(false);
    timer = resumePromoTimer(Date.now(), timer);
    vi.advanceTimersByTime(2_999);
    expect(promoDecision(Date.now(), null, 30, timer, readyContext).show).toBe(false);
    vi.advanceTimersByTime(1);
    expect(promoDecision(Date.now(), null, 30, timer, readyContext).show).toBe(true);
  });

  it('snoozes the panel for 30 days after showing it', () => {
    const storage = memory();
    expect(remember(storage, Date.now())).toBe(true);
    expect(mayShowSaved(Date.now(), storage.getItem(PROMO_STORAGE_KEY), 30)).toBe(false);
    vi.setSystemTime(NOW + 29 * DAY);
    expect(mayShow(storage, Date.now(), 30)).toBe(false);
    vi.setSystemTime(NOW + 30 * DAY);
    expect(mayShow(storage, Date.now(), 30)).toBe(true);
  });

  it('respects an explicit permanent opt-out even if a later close tries to remember a date', () => {
    const storage = memory();
    expect(dismissPromoForever(storage)).toBe(true);
    expect(storage.getItem(PROMO_STORAGE_KEY)).toBe(PROMO_DISMISSED_FOREVER);
    expect(remember(storage, Date.now())).toBe(true);
    vi.setSystemTime(NOW + 365 * DAY);
    expect(mayShow(storage, Date.now(), 30)).toBe(false);
  });

  it('fails closed when storage is blocked', () => {
    expect(mayShow(blocked, Date.now(), 30)).toBe(false);
    expect(remember(blocked, Date.now())).toBe(false);
    expect(dismissPromoForever(blocked)).toBe(false);
  });

  it('shows without animation for reduced-motion users', () => {
    const timer = newTimer();
    vi.advanceTimersByTime(5_000);
    expect(promoDecision(Date.now(), null, 30, timer, { ...readyContext, reducedMotion: true })).toEqual({
      show: true,
      remainingMs: 0,
      animate: false,
    });
  });
  it('does not open when storage could not be read, even after the full delay', () => {
    const timer = newTimer();
    vi.advanceTimersByTime(5_000);
    expect(mayShowSaved(Date.now(), undefined, 30)).toBe(false);
    expect(promoDecision(Date.now(), undefined, 30, timer, readyContext).show).toBe(false);
    expect(promoDecision(Date.now(), null, 30, timer, readyContext).show).toBe(true);
  });

  it('keeps a monotonic timer separate from the stored wall-clock date', () => {
    const wallNow = Date.now();
    const performanceStart = 1_000;
    const timer = resumePromoTimer(performanceStart, { remainingMs: 5_000, startedAt: null });
    expect(promoDecision(wallNow, null, 30, timer, readyContext, performanceStart + 4_999)).toEqual({
      show: false,
      remainingMs: 1,
      animate: true,
    });
    expect(promoDecision(wallNow, null, 30, timer, readyContext, performanceStart + 5_000)).toEqual({
      show: true,
      remainingMs: 0,
      animate: true,
    });
    // A recent wall-clock date still suppresses the panel regardless of the timer's clock origin.
    expect(promoDecision(wallNow, String(wallNow), 30, timer, readyContext, performanceStart + 5_000).show).toBe(false);
  });



  it('does not interrupt keyboard text entry or editable controls when the timer expires', () => {
    const readyTimer = { remainingMs: 0, startedAt: null };
    const entries = [
      { tagName: 'INPUT', type: 'password' },
      { tagName: 'INPUT', type: 'number' },
      { tagName: 'INPUT', type: 'url' },
      { tagName: 'INPUT', type: 'tel' },
      { tagName: 'TEXTAREA' },
      { tagName: 'SELECT' },
      { tagName: 'DIV', isContentEditable: true },
    ];
    for (const entry of entries) {
      expect(isTextEntry(entry)).toBe(true);
      expect(promoDecision(Date.now(), null, 30, readyTimer, {
        ...readyContext,
        busy: isTextEntry(entry),
      }).show).toBe(false);
    }
    // Once the visitor leaves the text field, the already-expired timer may open the panel.
    expect(promoDecision(Date.now(), null, 30, readyTimer, readyContext).show).toBe(true);
  });

  it('holds off while another dialog owns focus, even after a scroll trigger or elapsed timer', () => {
    const readyTimer = { remainingMs: 0, startedAt: null };
    for (const scrollFraction of [0, 0.5, 1]) {
      expect(promoDecision(Date.now(), null, 30, readyTimer, {
        ...readyContext,
        scrollFraction,
        busy: true,
      }).show).toBe(false);
    }
    expect(promoDecision(Date.now(), null, 30, readyTimer, {
      ...readyContext,
      busy: false,
      reducedMotion: true,
    })).toEqual({ show: true, remainingMs: 0, animate: false });
  });

  it('clamps bounced or out-of-range scroll positions before deciding whether to open', () => {
    expect(scrollProgress(-100, 700, 2100)).toBe(0);
    expect(scrollProgress(0, 700, 2100)).toBe(0);
    expect(scrollProgress(699, 700, 2100)).toBeLessThan(0.5);
    expect(scrollProgress(700, 700, 2100)).toBe(0.5);
    expect(scrollProgress(2200, 700, 2100)).toBe(1);
    expect(scrollProgress(5, 700, 600)).toBe(0);
  });

  it('handles repeated visibility toggles without double-counting elapsed time', () => {
    const start = 2_000;
    let timer = resumePromoTimer(start, { remainingMs: 5_000, startedAt: null });
    timer = resumePromoTimer(start + 500, timer);
    timer = pausePromoTimer(start + 2_000, timer);
    expect(timer).toEqual({ remainingMs: 3_000, startedAt: null });
    timer = pausePromoTimer(start + 20_000, timer);
    expect(timer).toEqual({ remainingMs: 3_000, startedAt: null });
    timer = resumePromoTimer(start + 20_000, timer);
    expect(promoTimeRemaining(start + 22_999, timer)).toBe(1);
    expect(promoTimeRemaining(start + 23_000, timer)).toBe(0);
  });

  it('fails to save when storage writes are blocked and respects the exact 30-day boundary', () => {
    const cannotWrite: KeyValueStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('write blocked'); },
      removeItem: () => {},
    };
    expect(mayShow(cannotWrite, NOW, 30)).toBe(true);
    expect(remember(cannotWrite, NOW)).toBe(false);
    const remembered = memory({ [PROMO_STORAGE_KEY]: String(NOW) });
    expect(mayShow(remembered, NOW + 30 * DAY - 1, 30)).toBe(false);
    expect(mayShow(remembered, NOW + 30 * DAY, 30)).toBe(true);
  });


});
