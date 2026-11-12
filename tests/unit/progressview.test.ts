import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyProgress, exportProgress, legacyStarsKey, migrateLegacyStars, PROGRESS_STORAGE_KEY, withOnboarding, withPile, withStars } from '../../src/scripts/progress';
import type { KeyValueStorage } from '../../src/scripts/storage';
import ProgressRing from '../../src/islands/ProgressRing';
import { examCountdown, progressScreenState, progressView, readDeviceProgress } from '../../src/islands/progressview';
import { RESUME_STORAGE_KEY, RESUME_VERSION } from '../../src/scripts/resume';

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

describe('readDeviceProgress guards storage before migration', () => {
  function store(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    const mutations: string[] = [];
    const storage: KeyValueStorage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { mutations.push('set:' + key); values.set(key, value); },
      removeItem: key => { mutations.push('remove:' + key); values.delete(key); },
      get length() { return values.size; },
      key: index => [...values.keys()][index] ?? null,
    };
    return { values, mutations, storage };
  }

  it('returns unreadable when storage does not exist', () => {
    expect(readDeviceProgress(undefined)).toEqual({ progress: emptyProgress(), state: 'unreadable' });
  });

  it('returns unreadable when getItem throws without writing anything', () => {
    let mutations = 0;
    const storage: KeyValueStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { mutations++; },
      removeItem: () => { mutations++; },
    };
    expect(readDeviceProgress(storage)).toEqual({ progress: emptyProgress(), state: 'unreadable' });
    expect(mutations).toBe(0);
  });

  it('does not overwrite an invalid primary record when old star keys are present', () => {
    const raw = '{not json';
    const oldStars = '["b"]';
    const existing = store({
      [PROGRESS_STORAGE_KEY]: raw,
      [legacyStarsKey('one')]: oldStars,
    });
    const before = [...existing.values.entries()];
    expect(readDeviceProgress(existing.storage)).toEqual({ progress: emptyProgress(), state: 'unreadable' });
    expect(existing.mutations).toEqual([]);
    expect([...existing.values.entries()]).toEqual(before);
    expect(existing.values.get(PROGRESS_STORAGE_KEY)).toBe(raw);
    expect(existing.values.get(legacyStarsKey('one'))).toBe(oldStars);
  });

  it('recovers valid card piles from damaged onboarding without changing original storage', () => {
    const raw = JSON.stringify({
      version: 1,
      onboarding: null,
      decks: { one: { know: ['a'], learning: [], starred: [] } },
    });
    const legacy = '["b"]';
    const existing = store({ [PROGRESS_STORAGE_KEY]: raw, [legacyStarsKey('one')]: legacy });
    const original = [...existing.values.entries()];
    expect(readDeviceProgress(existing.storage)).toEqual({
      progress: withStars(withPile(emptyProgress(), 'one', 'a', 'know'), 'one', ['b']),
      state: 'ready',
      recovered: true,
    });
    expect(existing.mutations).toEqual([]);
    expect([...existing.values.entries()]).toEqual(original);
    expect(existing.values.get(PROGRESS_STORAGE_KEY)).toBe(raw);
    expect(existing.values.get(legacyStarsKey('one'))).toBe(legacy);
  });

  it('does not claim recovery when damaged fields contain no safely parsed progress', () => {
    const existing = store({ [PROGRESS_STORAGE_KEY]: JSON.stringify({ version: 1, onboarding: null, decks: {} }) });
    expect(readDeviceProgress(existing.storage)).toEqual({ progress: emptyProgress(), state: 'unreadable' });
    expect(existing.mutations).toEqual([]);
  });

  it('includes current and retired legacy stars in a recovered copy without storage mutations', () => {
    const raw = JSON.stringify({ version: 1, onboarding: null,
      decks: { one: { know: ['a'], learning: [], starred: ['c'] } } });
    const existing = store({ [PROGRESS_STORAGE_KEY]: raw,
      [legacyStarsKey('one')]: '["b","c"]',
      [legacyStarsKey('retired')]: '["x"]' });
    const original = [...existing.values.entries()];
    const snapshot = readDeviceProgress(existing.storage);
    expect(snapshot.state).toBe('ready');
    expect(snapshot.recovered).toBe(true);
    expect(snapshot.progress.decks.one).toEqual({ know: ['a'], learning: [], starred: ['b', 'c'] });
    expect(snapshot.progress.decks.retired).toEqual({ know: [], learning: [], starred: ['x'] });
    const downloaded = JSON.parse(exportProgress(snapshot.progress, '2026-11-12'));
    expect(downloaded.decks.one.starred).toEqual(['b', 'c']);
    expect(downloaded.decks.retired.starred).toEqual(['x']);
    expect(existing.mutations).toEqual([]);
    expect([...existing.values.entries()]).toEqual(original);
  });

  it.each(['know', 'learning', 'starred'] as const)(
    'preserves original bytes when %s mixes valid and invalid card IDs', (field) => {
      const raw = JSON.stringify({ version: 1,
        decks: { one: { [field]: ['a', 7, 'bad_id', null] } } });
      const existing = store({ [PROGRESS_STORAGE_KEY]: raw, [legacyStarsKey('one')]: '["b"]' });
      const original = [...existing.values.entries()];
      const snapshot = readDeviceProgress(existing.storage);
      expect(snapshot.state).toBe('ready');
      expect(snapshot.recovered).toBe(true);
      expect(snapshot.progress.decks.one[field]).toContain('a');
      expect(snapshot.progress.decks.one.starred).toContain('b');
      expect(existing.mutations).toEqual([]);
      expect([...existing.values.entries()]).toEqual(original);
    },
  );

  it('does not offer an incomplete recovered backup when a legacy key cannot be read', () => {
    const raw = JSON.stringify({ version: 1, onboarding: null, decks: { one: { know: ['a'] } } });
    const existing = store({ [PROGRESS_STORAGE_KEY]: raw, [legacyStarsKey('one')]: '["b"]' });
    const original = [...existing.values.entries()];
    const storage: KeyValueStorage = { ...existing.storage,
      getItem: key => {
        if (key === legacyStarsKey('one')) throw new Error('blocked legacy read');
        return existing.storage.getItem(key);
      },
    };
    expect(readDeviceProgress(storage)).toEqual({ progress: emptyProgress(), state: 'unreadable' });
    expect(existing.mutations).toEqual([]);
    expect([...existing.values.entries()]).toEqual(original);
  });

  it('keeps duplicate valid IDs and overlapping piles on the normal readable path', () => {
    const raw = JSON.stringify({ version: 1,
      decks: { one: { know: ['a', 'a'], learning: ['a'], starred: ['b', 'b'] } } });
    const existing = store({ [PROGRESS_STORAGE_KEY]: raw });
    const snapshot = readDeviceProgress(existing.storage);
    expect(snapshot.state).toBe('ready');
    expect(snapshot.recovered).toBeUndefined();
    expect(snapshot.progress.decks.one).toEqual({ know: [], learning: ['a'], starred: ['b'] });
    expect(existing.mutations).toEqual([]);
  });

  it.each([
    { field: 'course', onboarding: { course: 7, done: true } },
    { field: 'done', onboarding: { course: 'fundamentals', done: 'yes' } },
    { field: 'examDate', onboarding: { course: 'fundamentals', examDate: '2026-02-30' } },
  ])('preserves a bad onboarding $field and the valid saved deck during recovery', ({ onboarding }) => {
    const raw = JSON.stringify({ version: 1, onboarding,
      decks: { one: { know: ['a'] } } });
    const oldStars = '["b"]';
    const existing = store({ [PROGRESS_STORAGE_KEY]: raw, [legacyStarsKey('one')]: oldStars });
    const before = [...existing.values.entries()];
    const result = readDeviceProgress(existing.storage);
    expect(result.state).toBe('ready');
    expect(result.recovered).toBe(true);
    expect(result.progress.decks.one).toEqual({ know: ['a'], learning: [], starred: ['b'] });
    expect(existing.mutations).toEqual([]);
    expect([...existing.values.entries()]).toEqual(before);
  });

  it('preserves an invalid saved deck ID and recovers the valid deck without writes', () => {
    const raw = JSON.stringify({ version: 1,
      decks: { 'Bad Deck': { know: ['lost-in-old-format'] }, one: { know: ['a'] } } });
    const oldStars = '["b"]';
    const existing = store({ [PROGRESS_STORAGE_KEY]: raw, [legacyStarsKey('one')]: oldStars });
    const before = [...existing.values.entries()];
    const result = readDeviceProgress(existing.storage);
    expect(result.state).toBe('ready');
    expect(result.recovered).toBe(true);
    expect(result.progress.decks.one).toEqual({ know: ['a'], learning: [], starred: ['b'] });
    expect(existing.mutations).toEqual([]);
    expect([...existing.values.entries()]).toEqual(before);
  });

  it('does not silently discard unknown saved fields while migrating legacy stars', () => {
    const raw = JSON.stringify({ version: 1,
      onboarding: { done: true, unsupported: 'original value' },
      decks: { one: { know: ['a'], unknown: 'original deck value' } } });
    const existing = store({ [PROGRESS_STORAGE_KEY]: raw, [legacyStarsKey('one')]: '["b"]' });
    const result = readDeviceProgress(existing.storage);
    expect(result.state).toBe('ready');
    expect(result.recovered).toBe(true);
    expect(result.progress.decks.one.starred).toEqual(['b']);
    expect(existing.values.get(PROGRESS_STORAGE_KEY)).toBe(raw);
    expect(existing.mutations).toEqual([]);
  });

  it.each(['[not json', '"not an array"', '["b", 7]', 'null'])(
    'leaves a malformed legacy key untouched instead of offering an incomplete backup: %s', (legacy) => {
      const raw = JSON.stringify({ version: 1, onboarding: { done: true },
        decks: { one: { know: ['a'] } } });
      const existing = store({ [PROGRESS_STORAGE_KEY]: raw, [legacyStarsKey('one')]: legacy });
      const before = [...existing.values.entries()];
      expect(readDeviceProgress(existing.storage)).toEqual({
        progress: emptyProgress(), state: 'unreadable',
      });
      expect(existing.mutations).toEqual([]);
      expect([...existing.values.entries()]).toEqual(before);
    },
  );

  it('does not offer a destructive reset for a damaged record with malformed old stars', () => {
    const raw = JSON.stringify({ version: 1, onboarding: null,
      decks: { one: { know: ['a'] } } });
    const existing = store({ [PROGRESS_STORAGE_KEY]: raw, [legacyStarsKey('one')]: '[not json' });
    const before = [...existing.values.entries()];
    expect(readDeviceProgress(existing.storage)).toEqual({
      progress: emptyProgress(), state: 'unreadable',
    });
    expect(existing.mutations).toEqual([]);
    expect([...existing.values.entries()]).toEqual(before);
  });

  it('retains a normal readable state for partial valid and duplicate saved card IDs', () => {
    const raw = JSON.stringify({ version: 1, onboarding: { done: true },
      decks: { one: { know: ['a', 'a'], learning: ['a'], starred: ['b', 'b'] } } });
    const existing = store({ [PROGRESS_STORAGE_KEY]: raw, [legacyStarsKey('one')]: '["c"]' });
    const result = readDeviceProgress(existing.storage);
    expect(result.state).toBe('ready');
    expect(result.recovered).toBeUndefined();
    expect(result.progress.decks.one).toEqual({ know: [], learning: ['a'], starred: ['b', 'c'] });
    expect(existing.values.has(legacyStarsKey('one'))).toBe(false);
  });

  it('migrates old stars only when the primary record is readable', () => {
    const existing = store({
      [PROGRESS_STORAGE_KEY]: JSON.stringify({ version: 1, onboarding: { done: true }, decks: { one: { know: ['a'] } } }),
      [legacyStarsKey('one')]: '["b"]',
    });
    const result = readDeviceProgress(existing.storage);
    expect(result.state).toBe('ready');
    expect(result.progress.decks.one).toEqual({ know: ['a'], learning: [], starred: ['b'] });
    expect(existing.values.has(legacyStarsKey('one'))).toBe(false);
    expect(existing.mutations).toContain('remove:' + legacyStarsKey('one'));
  });

  it('counts a valid resume without an onboarding or card record as ready', () => {
    const existing = store({
      [RESUME_STORAGE_KEY]: JSON.stringify({
        version: RESUME_VERSION,
        tool: 'learn',
        page: '/learn/study-skills',
        itemIndex: 0,
        totalItems: 1,
        answers: {},
        timer: null,
        phase: 'working',
        savedAt: Date.now(),
      }),
    });
    const result = readDeviceProgress(existing.storage);
    expect(result.state).toBe('ready');
    expect(result.progress).toEqual(emptyProgress());
    expect(existing.mutations).toEqual([]);
  });

  it('preserves unsupported-version progress and legacy stars without writes', () => {
    const raw = JSON.stringify({ version: 99, decks: { one: { know: ['a'] } } });
    const starKey = legacyStarsKey('one');
    const existing = store({
      [PROGRESS_STORAGE_KEY]: raw,
      [starKey]: '["b"]',
    });
    const original = [...existing.values.entries()];
    expect(readDeviceProgress(existing.storage)).toEqual({
      progress: emptyProgress(),
      state: 'unreadable',
    });
    expect(existing.mutations).toEqual([]);
    expect([...existing.values.entries()]).toEqual(original);
  });

  it('returns empty when the browser has neither progress nor a resume', () => {
    const existing = store();
    expect(readDeviceProgress(existing.storage)).toEqual({ progress: emptyProgress(), state: 'empty' });
  });
});
