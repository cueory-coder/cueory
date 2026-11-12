import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyProgress, legacyStarsKey, migrateLegacyStars, PROGRESS_STORAGE_KEY, withOnboarding, withPile, withStars } from '../../src/scripts/progress';
import type { KeyValueStorage } from '../../src/scripts/storage';
import ProgressRing from '../../src/islands/ProgressRing';
import { examCountdown, progressScreenState, progressView } from '../../src/islands/progressview';

const decks = [
  { id: 'one', title: 'first deck', cardIds: ['a', 'b', 'c'] },
  { id: 'two', title: 'second deck', cardIds: ['d', 'e'] },
];

describe('truthful progress dashboard counts', () => {
  it('shows every current deck as not started when no cards are sorted', () => {
    const view = progressView(emptyProgress(), decks);
    expect(view.hasSavedDecks).toBe(false);
    expect(view.overall).toEqual({ know: 0, learning: 0, notStarted: 5, total: 5 });
    expect(view.decks.map((deck) => [deck.id, deck.notStarted])).toEqual([['one', 3], ['two', 2]]);
  });

  it('counts only current card IDs, and stars do not create completions', () => {
    let progress = withPile(emptyProgress(), 'one', 'a', 'know');
    progress = withPile(progress, 'one', 'b', 'learning');
    progress = withPile(progress, 'one', 'old-id', 'know');
    progress = withStars(progress, 'one', ['c', 'old-id']);
    const view = progressView(progress, decks);
    expect(view.hasSavedDecks).toBe(true);
    expect(view.decks[0]).toMatchObject({ know: 1, learning: 1, notStarted: 1, starred: 1, total: 3 });
    expect(view.overall).toEqual({ know: 1, learning: 1, notStarted: 3, total: 5 });
  });

  it('treats a complete deck as having zero not-started cards', () => {
    let progress = emptyProgress();
    progress = withPile(progress, 'one', 'a', 'know');
    progress = withPile(progress, 'one', 'b', 'know');
    progress = withPile(progress, 'one', 'c', 'learning');
    const view = progressView(progress, decks);
    expect(view.decks[0]).toMatchObject({ know: 2, learning: 1, notStarted: 0, total: 3 });
  });

  it('keeps retired-deck data but never invents its total or counts it in the overall ring', () => {
    const progress = withStars(withPile(emptyProgress(), 'removed', 'x', 'learning'), 'removed', ['y']);
    const view = progressView(progress, decks);
    expect(view.decks[2]).toMatchObject({
      id: 'removed', title: 'a deck no longer on the site (removed)',
      know: 0, learning: 1, starred: 1, total: null, notStarted: null, retired: true,
    });
    expect(view.overall).toEqual({ know: 0, learning: 0, notStarted: 5, total: 5 });
    expect(view.hasSavedDecks).toBe(true);
  });

  it('does not count duplicate IDs twice or count a card in two piles', () => {
    const progress = emptyProgress();
    progress.decks.one = { know: ['a', 'b'], learning: ['b'], starred: [] };
    const view = progressView(progress, [{ id: 'one', title: 'one', cardIds: ['a', 'b', 'b'] }]);
    expect(view.overall).toEqual({ know: 1, learning: 1, notStarted: 0, total: 2 });
  });

  it('renders an accessible, labeled SVG ring with no animation', () => {
    const html = renderToStaticMarkup(createElement(ProgressRing, {
      label: 'first deck', know: 2, learning: 1, notStarted: 1,
    }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="first deck: 2 know it, 1 still learning, 1 not started."');
    expect(html).toContain('<title>first deck: 2 know it, 1 still learning, 1 not started.</title>');
    expect(html).not.toContain('transition');
  });
});

describe('exam date is a calendar countdown, never an exam prediction', () => {
  it('handles today, future and past days', () => {
    expect(examCountdown('2026-11-02', '2026-11-02')).toBe('your exam is today.');
    expect(examCountdown('2026-11-03', '2026-11-02')).toBe('1 day until your exam.');
    expect(examCountdown('2026-11-05', '2026-11-02')).toBe('3 days until your exam.');
    expect(examCountdown('2026-11-01', '2026-11-02')).toBe('that exam date was 1 day ago.');
    expect(examCountdown('2026-10-31', '2026-11-02')).toBe('that exam date was 2 days ago.');
  });

  it('uses calendar days across leap days and daylight-saving dates', () => {
    expect(examCountdown('2028-03-01', '2028-02-28')).toBe('2 days until your exam.');
    expect(examCountdown('2027-03-15', '2027-03-13')).toBe('2 days until your exam.');
  });

  it('does not make up a countdown for missing or invalid dates', () => {
    expect(examCountdown(null, '2026-11-02')).toBeNull();
    expect(examCountdown('2026-02-30', '2026-11-02')).toBeNull();
  });
});

describe('explicit progress-page states', () => {
  const state = (raw: string | null, progress = emptyProgress(), hasResume = false, canReadStorage = true) =>
    progressScreenState({ raw, progress, hasResume, canReadStorage });

  it('distinguishes an untouched browser from saved progress and resume-only data', () => {
    expect(state(null)).toBe('empty');
    expect(state(null, withOnboarding(emptyProgress(), { course: 'fundamentals', examDate: null }))).toBe('ready');
    expect(state(null, withPile(emptyProgress(), 'one', 'a', 'know'))).toBe('ready');
    expect(state(null, emptyProgress(), true)).toBe('ready');
  });

  it('does not call blocked storage or corrupted saved data empty', () => {
    expect(state(null, emptyProgress(), false, false)).toBe('unreadable');
    expect(state('{not json')).toBe('unreadable');
    expect(state('null')).toBe('unreadable');
    expect(state(JSON.stringify({ version: 2, decks: {} }))).toBe('unreadable');
    expect(state(JSON.stringify({ version: 1, decks: 'bad' }))).toBe('unreadable');
    expect(state(JSON.stringify({ version: 1, decks: { one: { know: 'bad' } } }))).toBe('unreadable');
    expect(state(JSON.stringify({ version: 1, onboarding: [] }))).toBe('unreadable');
  });

  it('accepts partial older records and a mix of old star keys and newer progress', () => {
    const raw = JSON.stringify({ version: 1, onboarding: { done: true }, decks: { one: { know: ['a'] } } });
    const values = new Map<string, string>([
      [PROGRESS_STORAGE_KEY, raw],
      [legacyStarsKey('one'), '["b"]'],
      [legacyStarsKey('retired'), '["x"]'],
    ]);
    const storage: KeyValueStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
      get length() { return values.size; },
      key: (index) => [...values.keys()][index] ?? null,
    };
    const progress = migrateLegacyStars(storage);
    expect(progress.decks.one).toEqual({ know: ['a'], learning: [], starred: ['b'] });
    expect(progress.decks.retired).toEqual({ know: [], learning: [], starred: ['x'] });
    expect(state(raw, progress)).toBe('ready');
    expect(values.has(legacyStarsKey('one'))).toBe(false);
    expect(values.has(legacyStarsKey('retired'))).toBe(false);
    expect(state('{"version":1}', emptyProgress())).toBe('empty');
  });
});
