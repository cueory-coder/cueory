import { describe, expect, it } from 'vitest';
import {
  deckProgress,
  emptyProgress,
  examDateWords,
  exportProgress,
  forgetProgress,
  isExamDate,
  legacyStarsKey,
  localDay,
  migrateLegacyStars,
  parseProgress,
  pileOf,
  PROGRESS_STORAGE_KEY,
  readProgress,
  saveProgress,
  saveSort,
  withOnboarding,
  withPile,
  withStars,
} from '../../src/scripts/progress';
import type { KeyValueStorage } from '../../src/scripts/storage';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
    get length() {
      return Object.keys(data).length;
    },
    key: (i) => Object.keys(data)[i] ?? null,
  };
}

const blockedStorage: KeyValueStorage = {
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

describe('guest progress record (D-69)', () => {
  it('starts empty, and nothing is written for an empty record', () => {
    const storage = memoryStorage();
    expect(readProgress(storage)).toEqual(emptyProgress());
    expect(saveProgress(storage, emptyProgress())).toBe(true);
    expect(storage.data).toEqual({});
  });

  it('saves and reads back onboarding answers, piles and stars', () => {
    const storage = memoryStorage();
    let progress = withOnboarding(emptyProgress(), { course: 'med-surg-1', examDate: '2027-05-12' });
    progress = withPile(progress, 'deck-a', 'c1', 'know');
    progress = withPile(progress, 'deck-a', 'c2', 'learning');
    progress = withStars(progress, 'deck-a', ['c2']);
    expect(saveProgress(storage, progress)).toBe(true);
    expect(readProgress(storage)).toEqual({
      version: 1,
      onboarding: { course: 'med-surg-1', examDate: '2027-05-12', done: true },
      decks: { 'deck-a': { know: ['c1'], learning: ['c2'], starred: ['c2'] } },
    });
  });

  it('stores only the listed fields: anything else in the saved text is dropped', () => {
    const text = JSON.stringify({
      version: 1,
      email: 'someone@example.com',
      onboarding: { course: 'fundamentals', examDate: '2027-01-01', done: true, name: 'x' },
      decks: { 'deck-a': { know: ['c1'], learning: [], starred: [], notes: 'x' } },
    });
    const parsed = parseProgress(text);
    expect(Object.keys(parsed)).toEqual(['version', 'onboarding', 'decks']);
    expect(Object.keys(parsed.onboarding)).toEqual(['course', 'examDate', 'done']);
    expect(Object.keys(parsed.decks['deck-a']!)).toEqual(['know', 'learning', 'starred']);
  });

  it('drops unreadable or invalid parts, field by field, and never throws', () => {
    for (const text of [null, '', 'not json', 'null', '[]', '"x"', '{"version":2,"decks":{}}']) {
      expect(parseProgress(text)).toEqual(emptyProgress());
    }
    const parsed = parseProgress(
      JSON.stringify({
        version: 1,
        onboarding: { course: 'pharmacology', examDate: '2027-02-30', done: 'yes' },
        decks: {
          'Bad Deck!': { know: ['c1'] },
          'deck-a': { know: ['c1', 'c1', 7, 'Bad Id', 'c2'], learning: ['c2'], starred: 'c1' },
          'deck-b': { know: [], learning: [], starred: [] },
        },
      }),
    );
    expect(parsed.onboarding).toEqual({ course: null, examDate: null, done: false });
    // A card in both piles counts as still learning; empty decks and bad ids are dropped.
    expect(parsed.decks).toEqual({ 'deck-a': { know: ['c1'], learning: ['c2'], starred: [] } });
  });

  it('keeps each card in at most one pile; the latest sort wins and null takes it out', () => {
    let progress = withPile(emptyProgress(), 'deck-a', 'c1', 'learning');
    progress = withPile(progress, 'deck-a', 'c1', 'know');
    expect(deckProgress(progress, 'deck-a')).toEqual({ know: ['c1'], learning: [], starred: [] });
    expect(pileOf(progress, 'deck-a', 'c1')).toBe('know');
    progress = withPile(progress, 'deck-a', 'c1', null);
    expect(progress.decks).toEqual({});
    expect(pileOf(progress, 'deck-a', 'c1')).toBeNull();
  });

  it('saveSort returns the previous pile, so "Back" can put it back', () => {
    const storage = memoryStorage();
    expect(saveSort(storage, 'deck-a', 'c1', 'learning')).toBeNull();
    expect(saveSort(storage, 'deck-a', 'c1', 'know')).toBe('learning');
    // Back: restore what was there before the last sort.
    saveSort(storage, 'deck-a', 'c1', 'learning');
    expect(deckProgress(readProgress(storage), 'deck-a').learning).toEqual(['c1']);
  });

  it('works without storage, or when the browser blocks it', () => {
    for (const storage of [undefined, blockedStorage]) {
      expect(readProgress(storage)).toEqual(emptyProgress());
      expect(saveProgress(storage, withPile(emptyProgress(), 'deck-a', 'c1', 'know'))).toBe(false);
      expect(forgetProgress(storage, ['deck-a'])).toBe(false);
      expect(() => saveSort(storage, 'deck-a', 'c1', 'know')).not.toThrow();
    }
  });

  it('moves every pre-D-69 stars key into the record, for any deck, joining stars already there', () => {
    const storage = memoryStorage({
      [PROGRESS_STORAGE_KEY]: JSON.stringify({ version: 1, decks: { 'deck-a': { starred: ['c2'] } } }),
      [legacyStarsKey('deck-a')]: '["c1"]',
      [legacyStarsKey('retired-deck')]: '["x9"]',
      [legacyStarsKey('broken')]: 'not json',
      'cueory-theme': 'dark',
    });
    const progress = migrateLegacyStars(storage);
    expect(deckProgress(progress, 'deck-a').starred).toEqual(['c1', 'c2']);
    expect(deckProgress(progress, 'retired-deck').starred).toEqual(['x9']);
    expect(readProgress(storage)).toEqual(progress);
    expect(Object.keys(storage.data).sort()).toEqual([PROGRESS_STORAGE_KEY, 'cueory-theme']);
  });

  it('keeps the old keys when the record cannot be saved, and never throws', () => {
    expect(migrateLegacyStars(undefined)).toEqual(emptyProgress());
    expect(migrateLegacyStars(blockedStorage)).toEqual(emptyProgress());
  });

  it('forgets stars kept under old keys for decks no longer on the site', () => {
    const storage = memoryStorage({ [legacyStarsKey('retired-deck')]: '["x9"]', 'cueory-theme': 'dark' });
    expect(forgetProgress(storage, ['deck-a'])).toBe(true);
    expect(Object.keys(storage.data)).toEqual(['cueory-theme']);
  });

  it('forgets the record and stars saved before D-69, and leaves the theme pick and promo date alone', () => {
    const storage = memoryStorage({
      [PROGRESS_STORAGE_KEY]: '{"version":1}',
      [legacyStarsKey('deck-a')]: '["c1"]',
      'cueory-theme': 'dark',
      'cueory-promo-seen': '1',
    });
    expect(forgetProgress(storage, ['deck-a'])).toBe(true);
    expect(Object.keys(storage.data).sort()).toEqual(['cueory-promo-seen', 'cueory-theme']);
  });
});

describe('onboarding answers', () => {
  it('accepts real calendar days from 2000 to 2100 only', () => {
    for (const day of ['2027-05-12', '2028-02-29', '2000-01-01', '2100-12-31']) expect(isExamDate(day), day).toBe(true);
    for (const day of ['2027-02-29', '2027-13-01', '2027-5-12', '1999-12-31', '2101-01-01', '12/05/2027', '', 20270512]) {
      expect(isExamDate(day), String(day)).toBe(false);
    }
  });

  it('saves blanks or invalid answers as "not answered", and counts the questions as done', () => {
    expect(withOnboarding(emptyProgress(), { course: '', examDate: '' }).onboarding).toEqual({
      course: null,
      examDate: null,
      done: true,
    });
    expect(withOnboarding(emptyProgress(), { course: 'x', examDate: '2027-02-31' }).onboarding.done).toBe(true);
  });

  it('writes the exam date in words, lowercase', () => {
    expect(examDateWords('2027-05-12')).toBe('may 12, 2027');
    expect(examDateWords('2026-12-01')).toBe('december 1, 2026');
  });
});

describe('download my progress', () => {
  it('is readable JSON that says what it is, with the day it was made and nothing else', () => {
    const progress = withStars(emptyProgress(), 'deck-a', ['c1']);
    const file = JSON.parse(exportProgress(progress, '2026-11-01'));
    expect(Object.keys(file)).toEqual(['about', 'exportedOn', 'version', 'onboarding', 'decks']);
    expect(file.about).toMatch(/nothing here was sent to cueory/);
    expect(file.exportedOn).toBe('2026-11-01');
    expect(file.decks).toEqual(progress.decks);
  });

  it('uses the local calendar day', () => {
    expect(localDay(new Date(2026, 10, 1, 23, 59))).toBe('2026-11-01');
    expect(localDay(new Date(2027, 0, 9))).toBe('2027-01-09');
  });
});
