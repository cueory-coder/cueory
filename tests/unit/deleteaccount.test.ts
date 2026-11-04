import { describe, expect, it } from 'vitest';
import {
  deletionSummary, confirmState, afterDeletion, DELETE_MAX_SIGN_IN_AGE_SECONDS, DELETE_RETURN_PATH, deleteOutcome,
  freshForDeletion, reauthHref, tokenIssuedAt,
} from '../../src/islands/deleteaccount';
import { safeNext } from '../../src/islands/signin';
import { GUEST_IMPORT_MARKER_PREFIX } from '../../src/islands/guestimportrun';
import { RESUME_STORAGE_KEY } from '../../src/scripts/resume';
import { BREAK_STORAGE_KEY } from '../../src/scripts/breakstore';
import { NOTE_SOUND_STORAGE_KEY } from '../../src/scripts/notesound';
import { LAST_WELCOME_STORAGE_KEY, VISIT_STORAGE_KEY } from '../../src/islands/stickynote';
import {
  AUTH_STORAGE_KEY, PKCE_FLOW_LIST_STORAGE_KEY, PKCE_VERIFIER_STORAGE_KEY, pkceFlowStorageKey,
} from '../../src/islands/supabaseclient';
import { getCodeChallengeAndMethod } from '@supabase/auth-js/dist/module/lib/helpers.js';
import { StudyEventPages, type ExportData, type StudyEventRow } from '../../src/islands/exportdata';
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

  it('includes the study resume key (Task 104)', () => {
    expect(afterDeletion(new MemoryStorage())).toContain(RESUME_STORAGE_KEY);
  });

  it('includes both persistent glove-note preferences', () => {
    const keys = afterDeletion(new MemoryStorage());
    expect(keys).toContain(LAST_WELCOME_STORAGE_KEY);
    expect(keys).toContain(NOTE_SOUND_STORAGE_KEY);
  });

  it('separates tab-only keys and leaves the auth key to Task 59', () => {
    const keys = afterDeletion(new MemoryStorage());
    expect(keys.sessionKeys).toEqual([VISIT_STORAGE_KEY, BREAK_STORAGE_KEY]);
    expect(new Set(keys.sessionKeys).size).toBe(keys.sessionKeys.length);
    expect(keys).not.toContain(VISIT_STORAGE_KEY);
    expect(keys).not.toContain(BREAK_STORAGE_KEY);
    expect(keys).not.toContain(AUTH_STORAGE_KEY);
    expect(keys.sessionKeys).not.toContain(AUTH_STORAGE_KEY);
  });

  it('includes every guest-import marker, and nothing else that merely looks similar', () => {
    const storage = new MemoryStorage();
    storage.setItem(`${GUEST_IMPORT_MARKER_PREFIX}abc`, '1');
    storage.setItem(`${GUEST_IMPORT_MARKER_PREFIX}def`, '1');
    storage.setItem('not-cueory-guest-imported:abc', '1');
    const keys = afterDeletion(storage);
    expect(keys).toContain(`${GUEST_IMPORT_MARKER_PREFIX}abc`);
    expect(keys).toContain(`${GUEST_IMPORT_MARKER_PREFIX}def`);
    expect(keys).not.toContain('not-cueory-guest-imported:abc');
  });

  it('has no duplicates', () => {
    const keys = afterDeletion(new MemoryStorage());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('includes the PKCE sign-in verifier keys, and each sign-in slot found in storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(pkceFlowStorageKey('0123456789abcdef0123456789abcdef'), '"sample"');
    storage.setItem('cueory-authx-code-verifier', '"sample"');
    storage.setItem('other-cueory-auth-code-verifier', '"sample"');
    const keys = afterDeletion(storage);
    expect(PKCE_VERIFIER_STORAGE_KEY).toBe('cueory-auth-code-verifier');
    expect(PKCE_FLOW_LIST_STORAGE_KEY).toBe('cueory-auth-flows-code-verifier');
    expect(keys).toContain(PKCE_VERIFIER_STORAGE_KEY);
    expect(keys).toContain(PKCE_FLOW_LIST_STORAGE_KEY);
    expect(keys).toContain('cueory-auth-flow-0123456789abcdef0123456789abcdef-code-verifier');
    expect(keys).not.toContain('cueory-authx-code-verifier');
    expect(keys).not.toContain('other-cueory-auth-code-verifier');
    expect(keys).not.toContain(AUTH_STORAGE_KEY);
  });

  it('covers every key the installed supabase-js writes when a PKCE sign-in starts', async () => {
    const storage = new MemoryStorage();
    // Two abandoned sign-ins, written by the library itself under Cueory's storage key.
    await getCodeChallengeAndMethod(storage, AUTH_STORAGE_KEY);
    await getCodeChallengeAndMethod(storage, AUTH_STORAGE_KEY);
    const written = [...storage.values.keys()];
    expect(written.length).toBeGreaterThanOrEqual(3);
    const keys = afterDeletion(storage);
    for (const key of written) expect(keys, key).toContain(key);
    for (const key of keys) storage.removeItem(key);
    expect(storage.length).toBe(0);
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
      reviewRows: [{ itemId: '00000000-0000-4000-8000-000000000002', level: 0, lastReviewed: '2026-11-01', nextReview: '2026-11-02', updatedAt: '2026-11-01T12:00:00Z' }],
    };
    expect(deletionSummary(data)).toEqual(['1 question attempt', '1 exam date', '1 account review schedule']);
    expect(deletionSummary({ attempts: [...data.attempts!, ...data.attempts!], examPlans: [...data.examPlans!, ...data.examPlans!], reviewRows: [...data.reviewRows!, ...data.reviewRows!] }))
      .toEqual(['2 question attempts', '2 exam dates', '2 account review schedules']);
    expect(deletionSummary({ attempts: [], examPlans: [], reviewRows: [] })).toEqual([]);
  });
});

describe('the sign-in record in the deletion summary (Task 309)', () => {
  const session = { createdAt: '2026-11-01T08:00:00Z', updatedAt: null, notAfter: null, userAgent: 'sample browser', ip: '203.0.113.5' };

  it('names the sign-in details and counts sessions without echoing them', () => {
    const data: ExportData = {
      account: { providers: ['google'], userMetadata: { name: 'Sample Student' }, identities: [] },
      sessions: [session, session],
    };
    const lines = deletionSummary(data);
    expect(lines).toEqual(['your sign-in details', '2 sign-in sessions']);
    expect(lines.join(' ')).not.toContain('Sample Student');
    expect(lines.join(' ')).not.toContain('203.0.113.5');
    expect(deletionSummary({ sessions: [session] })).toEqual(['1 sign-in session']);
  });

  it.each([{}, { account: {}, sessions: [] }, { account: { providers: [], userMetadata: {}, identities: [] } }] satisfies ExportData[])(
    'omits an empty sign-in record: %j', data => {
      expect(deletionSummary(data)).toEqual([]);
    },
  );
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
    for (const key of [PROMO_STORAGE_KEY, THEME_STORAGE_KEY, STATS_STORAGE_KEY, LAST_WELCOME_STORAGE_KEY, NOTE_SOUND_STORAGE_KEY]) {
      storage.setItem(key, 'sample');
    }
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

  it('can clear both storage areas only after deletion succeeds, leaving unrelated keys alone', () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    local.setItem(NOTE_SOUND_STORAGE_KEY, 'off');
    local.setItem('unrelated-local', 'keep');
    session.setItem(VISIT_STORAGE_KEY, 'sample');
    session.setItem(BREAK_STORAGE_KEY, 'sample');
    session.setItem('unrelated-session', 'keep');
    const plan = afterDeletion(local);
    expect(local.getItem(NOTE_SOUND_STORAGE_KEY)).toBe('off');
    expect(session.getItem(VISIT_STORAGE_KEY)).toBe('sample');
    for (const key of plan) local.removeItem(key);
    for (const key of plan.sessionKeys) session.removeItem(key);
    expect(local.getItem(NOTE_SOUND_STORAGE_KEY)).toBeNull();
    expect(session.getItem(VISIT_STORAGE_KEY)).toBeNull();
    expect(session.getItem(BREAK_STORAGE_KEY)).toBeNull();
    expect(local.getItem('unrelated-local')).toBe('keep');
    expect(session.getItem('unrelated-session')).toBe('keep');
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

describe('study history in the deletion summary (Task 140)', () => {
  const event: StudyEventRow = Object.freeze({
    itemId: '00000000-0000-4000-8000-000000000001', itemVersionId: '00000000-0000-4000-8000-000000000002',
    kind: 'marked', msOnItem: 4200, mark: 'know', at: '2026-11-01T00:00:00Z', createdAt: '2026-11-01T00:00:01Z',
  });

  it('counts one entry and many entries in plain words, after reports', () => {
    expect(deletionSummary({ studyEvents: [event] })).toEqual(['1 study history entry']);
    expect(deletionSummary({ reports: [], studyEvents: [event, { ...event, kind: 'skipped', mark: null }] }))
      .toEqual(['2 study history entries']);
  });

  it.each([{}, { studyEvents: [] }] satisfies ExportData[])('omits study history when absent or empty: %j', data => {
    expect(deletionSummary(data)).toEqual([]);
  });

  it('counts a history read page by page, as loadExport supplies it', () => {
    const pages = new StudyEventPages();
    pages.add([event, event]);
    pages.add([{ ...event, kind: 'skipped', mark: null }]);
    expect(deletionSummary({ studyEvents: pages })).toEqual(['3 study history entries']);
    expect(deletionSummary({ studyEvents: new StudyEventPages() })).toEqual([]);
  });
});

// ── A recent sign-in before deleting (Task 302) ──────────────────────────────

/** A token shaped like Supabase's: base64url header.payload.signature. The signature is never checked here. */
function token(payload: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'ES256', typ: 'JWT' })}.${part(payload)}.signature`;
}
const NOW_MS = Date.UTC(2026, 10, 2, 20, 0, 0);
const nowSeconds = NOW_MS / 1000;

describe('tokenIssuedAt', () => {
  it('reads iat from the payload', () => {
    expect(tokenIssuedAt(token({ sub: 'x', iat: 1_790_000_000 }))).toBe(1_790_000_000);
  });

  it('reads a payload whose base64url needs padding and uses - and _', () => {
    const payload = { iat: 1_790_000_123, name: '>>>???' };
    expect(tokenIssuedAt(token(payload))).toBe(1_790_000_123);
  });

  it.each([
    ['no token', undefined],
    ['not a string', 42],
    ['two parts', 'a.b'],
    ['a bad payload', 'a.!!!.c'],
    ['a payload that is not JSON', `a.${Buffer.from('nope').toString('base64url')}.c`],
    ['no iat', token({ sub: 'x' })],
    ['an iat that is a string', token({ iat: '1790000000' })],
    ['a zero iat', token({ iat: 0 })],
  ])('gives undefined for %s', (_name, value) => {
    expect(tokenIssuedAt(value)).toBeUndefined();
  });
});

describe('freshForDeletion', () => {
  it('is the same 10 minutes as the database', () => {
    expect(DELETE_MAX_SIGN_IN_AGE_SECONDS).toBe(600);
  });

  it('accepts a token from just now', () => {
    expect(freshForDeletion(token({ iat: nowSeconds }), NOW_MS)).toBe(true);
  });

  it('accepts a token up to 9 minutes old (a minute short of the limit)', () => {
    expect(freshForDeletion(token({ iat: nowSeconds - 540 }), NOW_MS)).toBe(true);
    expect(freshForDeletion(token({ iat: nowSeconds - 541 }), NOW_MS)).toBe(false);
  });

  it('refuses an older token, a token with no iat and no token', () => {
    expect(freshForDeletion(token({ iat: nowSeconds - 3600 }), NOW_MS)).toBe(false);
    expect(freshForDeletion(token({ sub: 'x' }), NOW_MS)).toBe(false);
    expect(freshForDeletion(undefined, NOW_MS)).toBe(false);
  });
});

describe('reauthHref', () => {
  it('sends the student to sign-in and back to the delete step', () => {
    expect(DELETE_RETURN_PATH).toBe('/account#delete');
    expect(reauthHref()).toBe('/signin?next=%2Faccount%23delete');
  });

  it('survives the sign-in page\'s own next check', () => {
    const next = new URLSearchParams(reauthHref().split('?')[1]).get('next');
    expect(safeNext(next, 'https://cueory.app')).toBe(DELETE_RETURN_PATH);
  });
});

describe('deleteOutcome', () => {
  it('is deleted when there is no error', () => {
    expect(deleteOutcome(null)).toEqual({ kind: 'deleted' });
    expect(deleteOutcome(undefined)).toEqual({ kind: 'deleted' });
  });

  it('sends a stale sign-in through sign-in again', () => {
    expect(deleteOutcome({ code: '28R01', message: 'please sign in again to delete your account' })).toEqual({
      kind: 'sign-in', href: '/signin?next=%2Faccount%23delete',
      message: 'for your safety, please sign in again to delete your account.',
    });
  });

  it('sends a signed-out student to sign in too', () => {
    expect(deleteOutcome({ code: '28000', message: 'sign in to delete your account' })).toEqual({
      kind: 'sign-in', href: '/signin?next=%2Faccount%23delete', message: 'please sign in again to delete your account.',
    });
  });

  it('reports anything else in one plain sentence, deleting nothing on the page', () => {
    expect(deleteOutcome({ code: '500', message: 'internal' })).toEqual({ kind: 'failed', message: 'something went wrong — please try again.' });
    expect(deleteOutcome('weird')).toEqual({ kind: 'failed', message: 'something went wrong — please try again.' });
  });
});

