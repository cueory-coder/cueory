import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { promo, site } from '../../src/config/site';
import {
  isTextEntry,
  mayShow,
  PROMO_STORAGE_KEY,
  remember,
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

describe('once-only promo panel (D-55)', () => {
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
    expect(promo.supportLabel).toBe('support us while we build');
    expect(site.tipPageUrl).toBe('https://ko-fi.com/cueory');
  });

  it('is never on study screens and is off on the signup thank-you page', () => {
    const layout = readFileSync(new URL('../../src/layouts/Layout.astro', import.meta.url), 'utf8');
    expect(layout).toContain('const showPromo = promoSettings.show && promo && !isStudy;');
    const subscribed = readFileSync(new URL('../../src/pages/subscribed.astro', import.meta.url), 'utf8');
    expect(subscribed).toContain('promo={false}');
  });
});
