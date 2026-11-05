import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptOffer, cardsDbFrom, contentsWords, declineOffer, DECLINED_MARKER, IMPORTED_MARKER, isMarkerEvent, markerKey,
  offerDecision, plansDbFrom, sessionUserId, type AcceptOptions, type ImportClient, type LockRunner,
} from '../../src/islands/guestimportoffer';
import { runGuestImport, type GuestImportDb } from '../../src/islands/guestimportrun';
import type { ExamPlanDb } from '../../src/islands/examplanimport';
import type { IdMap } from '../../src/islands/guestimport';
import { emptyProgress, saveProgress, withOnboarding, withPile } from '../../src/scripts/progress';
import type { KeyValueStorage } from '../../src/scripts/storage';
import type { SessionState } from '../../src/islands/supabaseclient';

const USER = '550e8400-e29b-41d4-a716-446655440001';
const OTHER = '550e8400-e29b-41d4-a716-446655440002';
const CARD_A = '550e8400-e29b-41d4-a716-446655440003';
const TODAY = '2026-11-01';
const SIGNED_IN: SessionState = { signedIn: true, userId: USER, email: 'student@example.test' };
const NO_MATCHES: IdMap = new Map();
const MATCHES: IdMap = new Map([['deck-a', new Map([['card-a', CARD_A]])]]);

function memoryStorage(): KeyValueStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function withExamDate(storage: KeyValueStorage) {
  expect(saveProgress(storage, withOnboarding(emptyProgress(), { course: 'fundamentals', examDate: '2026-12-10' }))).toBe(true);
}

function withCard(storage: KeyValueStorage) {
  expect(saveProgress(storage, withPile(emptyProgress(), 'deck-a', 'card-a', 'know'))).toBe(true);
}

function databases(plan: { error: { code?: string } | null } = { error: null }, cards: { error: unknown } = { error: null }) {
  const upsert = vi.fn(async () => plan);
  const insert = vi.fn(async () => cards);
  return { plansDb: { upsert } as ExamPlanDb, cardsDb: { insert } as GuestImportDb, upsert, insert };
}

const stillUser = async () => USER;

function accept(storage: KeyValueStorage, extra: Partial<AcceptOptions> = {}) {
  const dbs = databases();
  return { dbs, run: () => acceptOffer({ storage, userId: USER, idMap: NO_MATCHES, today: TODAY, currentUserId: stillUser, ...dbs, ...extra }) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 1, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe('offerDecision', () => {
  it('never offers when signed out, whatever is saved', () => {
    const storage = memoryStorage();
    withExamDate(storage);
    expect(offerDecision({ signedIn: false }, storage, NO_MATCHES, TODAY)).toEqual({ show: false, reason: 'signed-out' });
  });

  it('offers a saved exam date once, to a signed-in student', () => {
    const storage = memoryStorage();
    withExamDate(storage);
    expect(offerDecision(SIGNED_IN, storage, NO_MATCHES, TODAY)).toEqual({ show: true, contents: { cards: 0, examPlan: true } });
  });

  it('counts only cards that match a published question', () => {
    const storage = memoryStorage();
    withCard(storage);
    expect(offerDecision(SIGNED_IN, storage, NO_MATCHES, TODAY)).toEqual({ show: false, reason: 'nothing' });
    expect(offerDecision(SIGNED_IN, storage, MATCHES, TODAY)).toEqual({ show: true, contents: { cards: 1, examPlan: false } });
  });

  it('does not offer an empty device, or an exam date the database would refuse', () => {
    const storage = memoryStorage();
    expect(offerDecision(SIGNED_IN, storage, NO_MATCHES, TODAY)).toEqual({ show: false, reason: 'nothing' });
    saveProgress(storage, withOnboarding(emptyProgress(), { course: 'fundamentals', examDate: '2030-01-01' }));
    expect(offerDecision(SIGNED_IN, storage, NO_MATCHES, TODAY)).toEqual({ show: false, reason: 'nothing' });
    saveProgress(storage, withOnboarding(emptyProgress(), { course: null, examDate: '2026-12-10' }));
    expect(offerDecision(SIGNED_IN, storage, NO_MATCHES, TODAY)).toEqual({ show: false, reason: 'nothing' });
  });

  it.each([IMPORTED_MARKER, DECLINED_MARKER])('does not offer again once the marker is %s', (value) => {
    const storage = memoryStorage();
    withExamDate(storage);
    storage.setItem(markerKey(USER), value);
    expect(offerDecision(SIGNED_IN, storage, NO_MATCHES, TODAY)).toEqual({ show: false, reason: 'handled' });
  });

  it('keeps markers per account', () => {
    const storage = memoryStorage();
    withExamDate(storage);
    storage.setItem(markerKey(OTHER), IMPORTED_MARKER);
    expect(offerDecision(SIGNED_IN, storage, NO_MATCHES, TODAY).show).toBe(true);
  });

  it('hides the offer when storage is missing or the marker cannot be read', () => {
    expect(offerDecision(SIGNED_IN, undefined, NO_MATCHES, TODAY)).toEqual({ show: false, reason: 'no-storage' });
    const storage = memoryStorage();
    withExamDate(storage);
    const blocked: KeyValueStorage = { ...storage, getItem: (key) => { if (key === markerKey(USER)) throw new Error('blocked'); return storage.getItem(key); } };
    expect(offerDecision(SIGNED_IN, blocked, NO_MATCHES, TODAY)).toEqual({ show: false, reason: 'unreadable' });
  });
});

describe('declineOffer', () => {
  it('remembers "not now" for this account only', () => {
    const storage = memoryStorage();
    withExamDate(storage);
    expect(declineOffer(storage, USER)).toBe(true);
    expect(storage.getItem(markerKey(USER))).toBe(DECLINED_MARKER);
    expect(offerDecision(SIGNED_IN, storage, NO_MATCHES, TODAY).show).toBe(false);
    expect(storage.getItem(markerKey(OTHER))).toBeNull();
  });

  it('never overwrites an import, and reports storage it cannot write', () => {
    const storage = memoryStorage();
    storage.setItem(markerKey(USER), IMPORTED_MARKER);
    expect(declineOffer(storage, USER)).toBe(true);
    expect(storage.getItem(markerKey(USER))).toBe(IMPORTED_MARKER);
    const full: KeyValueStorage = { ...memoryStorage(), setItem: () => { throw new Error('quota'); } };
    expect(declineOffer(full, USER)).toBe(false);
    expect(declineOffer(undefined, USER)).toBe(false);
  });

  it('blocks a later import of cards', async () => {
    const storage = memoryStorage();
    withCard(storage);
    declineOffer(storage, USER);
    const insert = vi.fn(async () => ({ error: null }));
    expect((await runGuestImport({ storage, db: { insert }, userId: USER, idMap: MATCHES })).imported).toBe(0);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('acceptOffer', () => {
  it('saves the exam plan, marks the account, and never runs twice', async () => {
    const storage = memoryStorage();
    withExamDate(storage);
    const { dbs, run } = accept(storage);
    expect(await run()).toEqual({ kind: 'done', contents: { cards: 0, examPlan: true } });
    expect(dbs.upsert).toHaveBeenCalledTimes(1);
    expect(dbs.upsert).toHaveBeenCalledWith('exam_plans', { course: 'fundamentals', exam_date: '2026-12-10' }, 'user_id,course');
    expect(storage.getItem(markerKey(USER))).toBe(IMPORTED_MARKER);
    expect(await run()).toEqual({ kind: 'handled' });
    expect(dbs.upsert).toHaveBeenCalledTimes(1);
  });

  it('brings in matched cards and the exam plan together', async () => {
    const storage = memoryStorage();
    saveProgress(storage, withPile(withOnboarding(emptyProgress(), { course: 'fundamentals', examDate: '2026-12-10' }), 'deck-a', 'card-a', 'know'));
    const { dbs, run } = accept(storage, { idMap: MATCHES });
    expect(await run()).toEqual({ kind: 'done', contents: { cards: 1, examPlan: true } });
    expect(dbs.insert).toHaveBeenCalledTimes(1);
    expect(storage.getItem(markerKey(USER))).toBe(IMPORTED_MARKER);
  });

  it('leaves the marker unset after a failure so the student can retry', async () => {
    const storage = memoryStorage();
    withExamDate(storage);
    const failing = databases({ error: { code: '08006' } });
    const result = await acceptOffer({ storage, userId: USER, idMap: NO_MATCHES, today: TODAY, currentUserId: stillUser, ...failing });
    expect(result).toEqual({ kind: 'error', message: 'your exam date could not be saved. please try again.' });
    expect(storage.getItem(markerKey(USER))).toBeNull();
  });

  it('reports a failed card insert after the plan saved, without marking', async () => {
    const storage = memoryStorage();
    withCard(storage);
    const failing = databases({ error: null }, { error: { code: '08006' } });
    const result = await acceptOffer({ storage, userId: USER, idMap: MATCHES, today: TODAY, currentUserId: stillUser, ...failing });
    expect(result).toEqual({ kind: 'error', message: "that didn't work. please try again." });
    expect(storage.getItem(markerKey(USER))).toBeNull();
  });

  it('stops when another tab finished first, checked inside the lock', async () => {
    const storage = memoryStorage();
    withExamDate(storage);
    const names: string[] = [];
    const lock: LockRunner = async (name, task) => {
      names.push(name);
      storage.setItem(markerKey(USER), IMPORTED_MARKER); // the other tab's import landed while this one waited
      return task();
    };
    const { dbs, run } = accept(storage, { lock });
    expect(await run()).toEqual({ kind: 'handled' });
    expect(names).toEqual([`cueory-guest-import:${USER}`]);
    expect(dbs.upsert).not.toHaveBeenCalled();
  });

  it('serializes two tabs through one lock so only one import happens', async () => {
    const storage = memoryStorage();
    withExamDate(storage);
    let chain = Promise.resolve();
    const lock: LockRunner = (_name, task) => {
      const next = chain.then(task);
      chain = next.then(() => undefined, () => undefined);
      return next;
    };
    const { dbs, run } = accept(storage, { lock });
    const results = await Promise.all([run(), run()]);
    expect(results.map((r) => r.kind).sort()).toEqual(['done', 'handled']);
    expect(dbs.upsert).toHaveBeenCalledTimes(1);
  });

  it('writes nothing and marks nothing when another tab switched to a different account', async () => {
    const storage = memoryStorage();
    saveProgress(storage, withPile(withOnboarding(emptyProgress(), { course: 'fundamentals', examDate: '2026-12-10' }), 'deck-a', 'card-a', 'know'));
    for (const now of [OTHER, null]) {
      const { dbs, run } = accept(storage, { idMap: MATCHES, currentUserId: async () => now });
      expect(await run()).toEqual({ kind: 'account-changed' });
      expect(dbs.upsert).not.toHaveBeenCalled();
      expect(dbs.insert).not.toHaveBeenCalled();
    }
    expect(storage.getItem(markerKey(USER))).toBeNull();
    expect(storage.getItem(markerKey(OTHER))).toBeNull();
  });

  it('stops before the cards and the marker when the account switched while the exam plan was saving', async () => {
    const storage = memoryStorage();
    saveProgress(storage, withPile(withOnboarding(emptyProgress(), { course: 'fundamentals', examDate: '2026-12-10' }), 'deck-a', 'card-a', 'know'));
    let signedInAs: string | null = USER;
    const { dbs, run } = accept(storage, { idMap: MATCHES, currentUserId: async () => signedInAs });
    dbs.upsert.mockImplementation(async () => { signedInAs = OTHER; return { error: null }; });
    expect(await run()).toEqual({ kind: 'account-changed' });
    expect(dbs.upsert).toHaveBeenCalledTimes(1);
    expect(dbs.insert).not.toHaveBeenCalled();
    expect(storage.getItem(markerKey(USER))).toBeNull();
    expect(storage.getItem(markerKey(OTHER))).toBeNull();
  });

  it('checks the account inside the lock, after waiting for another tab', async () => {
    const storage = memoryStorage();
    withExamDate(storage);
    let signedInAs = USER;
    const lock: LockRunner = async (_name, task) => {
      signedInAs = OTHER; // the switch happened while this tab waited for the lock
      return task();
    };
    const { dbs, run } = accept(storage, { lock, currentUserId: async () => signedInAs });
    expect(await run()).toEqual({ kind: 'account-changed' });
    expect(dbs.upsert).not.toHaveBeenCalled();
  });

  it('turns a failed session check into a retry message', async () => {
    const storage = memoryStorage();
    withExamDate(storage);
    const { dbs, run } = accept(storage, { currentUserId: async () => { throw new Error('storage blocked'); } });
    expect((await run()).kind).toBe('error');
    expect(dbs.upsert).not.toHaveBeenCalled();
    expect(storage.getItem(markerKey(USER))).toBeNull();
  });

  it('turns a thrown lock or adapter into a retry message', async () => {
    const storage = memoryStorage();
    withExamDate(storage);
    const broken: LockRunner = async () => { throw new Error('lock unavailable'); };
    expect((await accept(storage, { lock: broken }).run()).kind).toBe('error');
    const throwing = { upsert: async () => { throw new Error('network'); } } as unknown as ExamPlanDb;
    expect((await accept(storage, { plansDb: throwing }).run()).kind).toBe('error');
    expect(storage.getItem(markerKey(USER))).toBeNull();
  });
});

describe('helpers', () => {
  it('words what is on the device', () => {
    expect(contentsWords({ cards: 0, examPlan: true })).toBe('your exam date');
    expect(contentsWords({ cards: 1, examPlan: false })).toBe('1 card');
    expect(contentsWords({ cards: 3, examPlan: true })).toBe('your exam date and 3 cards');
  });

  it('reads the account ID from a session or an auth event', () => {
    expect(sessionUserId({ user: { id: USER } })).toBe(USER);
    expect(sessionUserId(null)).toBeNull();
    expect(sessionUserId(undefined)).toBeNull();
    expect(sessionUserId({ user: null })).toBeNull();
    expect(sessionUserId({ user: { id: '' } })).toBeNull();
    expect(sessionUserId({ user: { id: 42 } })).toBeNull();
  });

  it('recognizes storage events for this account marker only', () => {
    expect(isMarkerEvent(markerKey(USER), USER)).toBe(true);
    expect(isMarkerEvent(null, USER)).toBe(true);
    expect(isMarkerEvent(markerKey(OTHER), USER)).toBe(false);
    expect(isMarkerEvent('cueory-progress', USER)).toBe(false);
  });
});

describe('database adapters', () => {
  function fakeClient(insertError: { code?: string } | null, updateError: { code?: string } | null = null) {
    const calls: unknown[][] = [];
    const client: ImportClient = {
      from: (table) => ({
        insert: async (rows) => { calls.push(['insert', table, rows]); return { error: insertError }; },
        update: (patch) => ({ match: (filter) => ({ select: async (columns) => { calls.push(['update', table, patch, filter, columns]); return { data: updateError ? null : [{ user_id: USER }], error: updateError }; } }) }),
      }),
    };
    return { client, calls };
  }
  const row = { course: 'fundamentals' as const, exam_date: '2026-12-10' };

  it('inserts a new exam plan without an update', async () => {
    const { client, calls } = fakeClient(null);
    expect(await plansDbFrom(client, USER).upsert('exam_plans', row, 'user_id,course')).toEqual({ error: null });
    expect(calls).toEqual([['insert', 'exam_plans', row]]);
  });

  it('updates only exam_date, only on the accepting account row, when the course already has a plan', async () => {
    const { client, calls } = fakeClient({ code: '23505' });
    expect(await plansDbFrom(client, USER).upsert('exam_plans', row, 'user_id,course')).toEqual({ error: null });
    expect(calls[1]).toEqual(['update', 'exam_plans', { exam_date: '2026-12-10' }, { course: 'fundamentals', user_id: USER }, 'user_id']);
  });

  it('rejects a successful-looking update that matched no account row', async () => {
    const client: ImportClient = {
      from: () => ({
        insert: async () => ({ error: { code: '23505' } }),
        update: () => ({ match: () => ({ select: async () => ({ data: [], error: null }) }) }),
      }),
    };
    expect(await plansDbFrom(client, USER).upsert('exam_plans', row, 'user_id,course'))
      .toEqual({ error: { code: '42501' } });
  });

  it('rejects a missing confirmation after the duplicate-key fallback update', async () => {
    const client: ImportClient = {
      from: () => ({
        insert: async () => ({ error: { code: '23505' } }),
        update: () => ({ match: () => ({ select: async () => ({ data: null, error: null }) }) }),
      }),
    };
    expect(await plansDbFrom(client, USER).upsert('exam_plans', row, 'user_id,course'))
      .toEqual({ error: { code: '42501' } });
  });

  it('rejects multiple updated rows instead of treating them as one confirmed account plan', async () => {
    const client: ImportClient = {
      from: () => ({
        insert: async () => ({ error: { code: '23505' } }),
        update: () => ({ match: () => ({ select: async () => ({
          data: [{ user_id: USER }, { user_id: USER }],
          error: null,
        }) }) }),
      }),
    };
    expect(await plansDbFrom(client, USER).upsert('exam_plans', row, 'user_id,course'))
      .toEqual({ error: { code: '42501' } });
  });

  it('rejects an update confirmation belonging to a different account', async () => {
    const client: ImportClient = {
      from: () => ({
        insert: async () => ({ error: { code: '23505' } }),
        update: () => ({ match: () => ({ select: async () => ({ data: [{ user_id: OTHER }], error: null }) }) }),
      }),
    };
    expect(await plansDbFrom(client, USER).upsert('exam_plans', row, 'user_id,course'))
      .toEqual({ error: { code: '42501' } });
  });

  it('passes other insert and update errors through', async () => {
    expect(await plansDbFrom(fakeClient({ code: '54000' }).client, USER).upsert('exam_plans', row, 'user_id,course')).toEqual({ error: { code: '54000' } });
    expect(await plansDbFrom(fakeClient({ code: '23505' }, { code: '42501' }).client, USER).upsert('exam_plans', row, 'user_id,course')).toEqual({ error: { code: '42501' } });
  });

  it('inserts review_state rows as given', async () => {
    const { client, calls } = fakeClient(null);
    const rows = [{ item_id: CARD_A, level: 1 as const, last_reviewed: TODAY, next_review: '2026-11-04' }];
    expect(await cardsDbFrom(client).insert('review_state', rows)).toEqual({ error: null });
    expect(calls).toEqual([['insert', 'review_state', rows]]);
  });
});
