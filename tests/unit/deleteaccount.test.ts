import { describe, expect, it } from 'vitest';
import { deletionSummary, confirmState, afterDeletion } from '../../src/islands/deleteaccount';
import type { ExportData } from '../../src/islands/exportdata';
import {
  emptyProgress, forgetProgress, legacyStarsKey, loadDeckStars, migrateLegacyStars, PROGRESS_STORAGE_KEY,
  saveProgress, withOnboarding, withPile, withStars,
} from '../../src/scripts/progress';
import { PROMO_STORAGE_KEY } from '../../src/scripts/promo';
import { THEME_STORAGE_KEY } from '../../src/scripts/theme';
import { STATS_STORAGE_KEY } from '../../src/islands/gameresults';
import type { KeyValueStorage } from '../../src/scripts/storage';

class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

// ── deletionSummary ───────────────────────────────────────────────────────────

describe('deletionSummary with an empty account', () => {
  it('returns an empty array', () => {
    expect(deletionSummary({})).toEqual([]);
  });

  it('ignores a profile with no display name', () => {
    const data: ExportData = { profile: { displayName: null } };
    expect(deletionSummary(data)).toEqual([]);
  });

  it('ignores onboarding with all null fields', () => {
    const data: ExportData = { onboarding: { course: null, examDate: null, school: null } };
    expect(deletionSummary(data)).toEqual([]);
  });

  it('ignores empty progress and gameStats arrays', () => {
    const data: ExportData = { progress: [], reviewState: [], gameStats: [] };
    expect(deletionSummary(data)).toEqual([]);
  });
});

describe('deletionSummary with a full account', () => {
  const fullData: ExportData = {
    profile: { displayName: 'Alex' },
    onboarding: { course: 'med-surg', examDate: '2027-06-01', done: false, school: 'State U' },
    progress: [
      { id: 'card-1', result: true, date: '2026-11-01' },
      { id: 'card-2', result: false, date: '2026-11-01' },
    ],
    reviewState: [
      { id: 'card-1', nextDueDate: '2026-11-08', interval: 7 },
    ],
    gameStats: [
      { game: 'pulse', day: '2026-11-01', solved: true, tries: 3 },
      { game: 'cueword', day: '2026-11-01', solved: false, tries: 6 },
    ],
  };

  it('includes a line for the display name', () => {
    expect(deletionSummary(fullData)).toContain('your display name');
  });

  it('includes a line for study setup', () => {
    expect(deletionSummary(fullData)).toContain('your study setup');
  });

  it('includes a plural card progress line', () => {
    const lines = deletionSummary(fullData);
    expect(lines.some((l) => l.includes('progress'))).toBe(true);
    expect(lines.some((l) => l.includes('2'))).toBe(true);
  });

  it('includes a singular review schedule line for one item', () => {
    const lines = deletionSummary({ reviewState: [{ id: 'c', nextDueDate: '2026-11-08', interval: 7 }] });
    expect(lines.some((l) => l.includes('review schedule') && !l.includes('schedules'))).toBe(true);
  });

  it('includes a plural game results line', () => {
    const lines = deletionSummary(fullData);
    expect(lines.some((l) => l.includes('game result'))).toBe(true);
    expect(lines.some((l) => l.includes('2'))).toBe(true);
  });

  it('returns exactly five lines for a fully-populated account', () => {
    expect(deletionSummary(fullData)).toHaveLength(5);
  });
});

describe('deletionSummary singular vs plural', () => {
  it('uses singular for one card progress entry', () => {
    const data: ExportData = { progress: [{ id: 'c', result: true, date: '2026-11-01' }] };
    const lines = deletionSummary(data);
    expect(lines.some((l) => l.startsWith("1 card's"))).toBe(true);
  });

  it('uses plural for two card progress entries', () => {
    const data: ExportData = {
      progress: [
        { id: 'c1', result: true, date: '2026-11-01' },
        { id: 'c2', result: false, date: '2026-11-01' },
      ],
    };
    const lines = deletionSummary(data);
    expect(lines.some((l) => l.startsWith("2 cards'"))).toBe(true);
  });

  it('uses singular for one game result', () => {
    const data: ExportData = { gameStats: [{ game: 'pulse', day: '2026-11-01', solved: true, tries: 3 }] };
    const lines = deletionSummary(data);
    expect(lines.some((l) => l === '1 game result')).toBe(true);
  });

  it('uses plural review schedules for two entries', () => {
    const data: ExportData = {
      reviewState: [
        { id: 'c1', nextDueDate: '2026-11-08', interval: 7 },
        { id: 'c2', nextDueDate: '2026-11-09', interval: 7 },
      ],
    };
    const lines = deletionSummary(data);
    expect(lines.some((l) => l.includes('2 review schedules'))).toBe(true);
  });
});

// ── confirmState ──────────────────────────────────────────────────────────────

describe('confirmState', () => {
  it('returns null for "delete"', () => {
    expect(confirmState('delete')).toBeNull();
  });

  it('returns null for "DELETE" (any case)', () => {
    expect(confirmState('DELETE')).toBeNull();
  });

  it('returns null for "Delete" (mixed case)', () => {
    expect(confirmState('Delete')).toBeNull();
  });

  it('returns null for " delete " (leading/trailing whitespace)', () => {
    expect(confirmState(' delete ')).toBeNull();
  });

  it('returns a reason for an empty string', () => {
    expect(confirmState('')).not.toBeNull();
  });

  it('returns a reason for whitespace only', () => {
    expect(confirmState('   ')).not.toBeNull();
  });

  it('returns a reason for a near-miss: "delet"', () => {
    expect(confirmState('delet')).not.toBeNull();
  });

  it('returns a reason for "deleted"', () => {
    expect(confirmState('deleted')).not.toBeNull();
  });

  it('returns a reason for "yes"', () => {
    expect(confirmState('yes')).not.toBeNull();
  });

  it('returns a reason for "confirm"', () => {
    expect(confirmState('confirm')).not.toBeNull();
  });

  it('returns a plain lowercase reason (no exclamation marks)', () => {
    const reason = confirmState('wrong');
    expect(reason).not.toBeNull();
    expect(reason).not.toContain('!');
  });
});

// ── afterDeletion ─────────────────────────────────────────────────────────────

describe('afterDeletion', () => {
  it('returns an array of strings', () => {
    const keys = afterDeletion(new MemoryStorage());
    expect(Array.isArray(keys)).toBe(true);
    expect(keys.every((k) => typeof k === 'string' && k.length > 0)).toBe(true);
  });

  it('includes the progress storage key', () => {
    expect(afterDeletion(new MemoryStorage())).toContain(PROGRESS_STORAGE_KEY);
  });

  it('includes the promo storage key', () => {
    expect(afterDeletion(new MemoryStorage())).toContain(PROMO_STORAGE_KEY);
  });

  it('includes the theme storage key', () => {
    expect(afterDeletion(new MemoryStorage())).toContain(THEME_STORAGE_KEY);
  });

  it('includes the game stats storage key', () => {
    expect(afterDeletion(new MemoryStorage())).toContain(STATS_STORAGE_KEY);
  });

  it('has no duplicates', () => {
    const keys = afterDeletion(new MemoryStorage());
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('the current export contract in the deletion summary', () => {
  it('describes an email-only account and never echoes the address', () => {
    const email = 'sample@example.invalid';
    const result = deletionSummary({ profile: { displayName: null, email } });
    expect(result).toEqual(['your email address']);
    expect(result.join(' ')).not.toContain(email);
  });

  it('keeps profile data on one line, including a creation-date-only profile', () => {
    expect(deletionSummary({ profile: { displayName: 'sample', email: 'sample@example.invalid' } }))
      .toEqual(['your display name and email address']);
    expect(deletionSummary({ profile: { createdAt: '2026-11-01T00:00:00Z' } })).toEqual(['your account details']);
  });

  it('accepts the real withPile/withStars record and counts overlapping stars once per deck', () => {
    let progress = withPile(emptyProgress(), 'sample-deck', 'sample-card', 'know');
    progress = withPile(progress, 'sample-deck', 'sample-learning', 'learning');
    progress = withStars(progress, 'sample-deck', ['sample-card', 'sample-star-only']);
    const before = JSON.stringify(progress);
    expect(deletionSummary({ progress })).toEqual(["3 cards' progress"]);
    expect(JSON.stringify(progress)).toBe(before);
  });

  it('counts the same local card id in different decks separately, including retired decks', () => {
    let progress = withPile(emptyProgress(), 'sample-live', 'sample-card', 'know');
    progress = withStars(progress, 'sample-retired', ['sample-card']);
    expect(deletionSummary({ progress })).toEqual(["2 cards' progress"]);
  });

  it('includes starred-only progress even when the card is in no pile', () => {
    expect(deletionSummary({ progress: withStars(emptyProgress(), 'sample-deck', ['sample-card']) }))
      .toEqual(["1 card's progress"]);
  });

  it('omits an empty saved record and includes its completed onboarding without a separate top-level copy', () => {
    expect(deletionSummary({ progress: emptyProgress() })).toEqual([]);
    const progress = withOnboarding(emptyProgress(), { course: 'fundamentals', examDate: '2027-01-01' });
    expect(deletionSummary({ progress })).toEqual(['your study setup']);
    expect(deletionSummary({ progress, onboarding: { course: 'fundamentals' } })).toEqual(['your study setup']);
  });

  it('covers the three account study sections now in ExportData', () => {
    const data: ExportData = {
      attempts: [{ itemVersionId: '00000000-0000-4000-8000-000000000001', picked: ['a'], correct: false, createdAt: '2026-11-01T00:00:00Z' }],
      examPlans: [{ course: 'fundamentals', examDate: '2027-01-01', createdAt: '2026-11-01T00:00:00Z' }],
      reviewRows: [{ itemId: '00000000-0000-4000-8000-000000000002', level: 0, lastReviewed: '2026-11-01', nextReview: '2026-11-02' }],
    };
    expect(deletionSummary(data)).toEqual(['1 question attempt', '1 exam date', '1 account review schedule']);
    expect(deletionSummary({ attempts: [...data.attempts!, ...data.attempts!], examPlans: [...data.examPlans!, ...data.examPlans!], reviewRows: [...data.reviewRows!, ...data.reviewRows!] }))
      .toEqual(['2 question attempts', '2 exam dates', '2 account review schedules']);
    expect(deletionSummary({ attempts: [], examPlans: [], reviewRows: [] })).toEqual([]);
  });
});

describe('reports in the deletion summary', () => {
  const report: NonNullable<ExportData['reports']>[number] = Object.freeze({
    id: '00000000-0000-4000-8000-000000000001',
    page: '/learn/sample', itemId: null, itemVersionId: null, reason: 'typo',
    comment: 'sample: report text stays out of the confirmation', createdAt: '2026-11-01T00:00:00Z',
  });

  it('counts one report without echoing its contents or changing the export snapshot', () => {
    const data: ExportData = Object.freeze({ reports: Object.freeze([report]) });
    expect(deletionSummary(data)).toEqual(['1 report']);
    expect(data.reports).toEqual([report]);
  });

  it('counts multiple reports alongside the other sections in plain words', () => {
    const data: ExportData = {
      profile: { email: 'sample@example.invalid' },
      reports: [report, { ...report, id: '00000000-0000-4000-8000-000000000002' }],
    };
    expect(deletionSummary(data)).toEqual(['your email address', '2 reports']);
  });

  it.each([{}, { reports: [] }] satisfies ExportData[])('omits reports when absent or empty: %j', data => {
    expect(deletionSummary(data)).toEqual([]);
  });
});

describe('legacy browser data in the cleanup plan', () => {
  it('clears current and retired stars so loadDeckStars and migration cannot restore deleted progress', () => {
    const storage = new MemoryStorage();
    storage.setItem(legacyStarsKey('sample-live'), JSON.stringify(['sample-card']));
    storage.setItem(legacyStarsKey('sample-retired'), JSON.stringify(['sample-retired-card']));
    storage.setItem(legacyStarsKey('retired.deck'), 'sample: unreadable legacy value');
    saveProgress(storage, withPile(emptyProgress(), 'sample-live', 'sample-card', 'know'));
    for (const key of [PROMO_STORAGE_KEY, THEME_STORAGE_KEY, STATS_STORAGE_KEY]) storage.setItem(key, 'sample');
    storage.setItem('sample-other-app', 'sample: keep');
    const before = [...storage.values];

    const keys = afterDeletion(storage);
    expect([...storage.values]).toEqual(before); // planning never performs the deletion
    for (const deck of ['sample-live', 'sample-retired', 'retired.deck']) expect(keys).toContain(legacyStarsKey(deck));
    for (const key of keys) storage.removeItem(key);
    expect([...storage.values]).toEqual([['sample-other-app', 'sample: keep']]);
    expect([...loadDeckStars(storage, 'sample-live', ['sample-card'])]).toEqual([]);
    expect([...loadDeckStars(storage, 'sample-retired', ['sample-retired-card'])]).toEqual([]);
    expect(migrateLegacyStars(storage)).toEqual(emptyProgress());
  });

  it('discovers the same legacy namespace as forgetProgress without deleting unrelated names', () => {
    const storage = new MemoryStorage();
    const forgotten = new MemoryStorage();
    const legacy = ['sample-live', 'sample-retired', 'retired.deck'].map(legacyStarsKey);
    for (const key of [...legacy, 'sample-cueory-stars-unrelated']) {
      storage.setItem(key, '[]'); forgotten.setItem(key, '[]');
    }
    expect(forgetProgress(forgotten, [])).toBe(true);
    expect(afterDeletion(storage).filter(key => legacy.includes(key))).toEqual(legacy);
    for (const key of legacy) expect(forgotten.getItem(key)).toBeNull();
    expect(afterDeletion(storage)).not.toContain('sample-cueory-stars-unrelated');
    expect(forgotten.getItem('sample-cueory-stars-unrelated')).toBe('[]');
  });

  it('requires an inventory rather than silently returning an incomplete cleanup plan', () => {
    expect(() => afterDeletion(undefined)).toThrow('listing its keys');
    const unlistable: KeyValueStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    expect(() => afterDeletion(unlistable)).toThrow('listing its keys');
    const blocked = new MemoryStorage();
    blocked.key = () => { throw new Error('sample: storage blocked'); };
    blocked.setItem(legacyStarsKey('sample-retired'), '[]');
    expect(() => afterDeletion(blocked)).toThrow('storage blocked');
    expect(blocked.getItem(legacyStarsKey('sample-retired'))).toBe('[]');
  });
});
