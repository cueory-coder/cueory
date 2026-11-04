import { describe, expect, it } from 'vitest';
import {
  MAX_ROWS, MESSAGES, PAGE_SIZE, createReviewSync, historiesFor, isItemId, loadReviewState, rowAfterReview,
  startReviewSync, syncMessage, type ReviewStateClient, type ReviewStateRow,
} from '../../src/islands/reviewsync';
import { answer, startSession } from '../../src/islands/reviewsession';

const today = '2026-11-02';
const A = '550e8400-e29b-41d4-a716-446655440001';
const B = '550e8400-e29b-41d4-a716-446655440002';
const C = '550e8400-e29b-41d4-a716-446655440003';
/** The student the sync belongs to, and another one. */
const OWNER = '00000000-0000-4000-8000-0000000000aa';
const OTHER = '00000000-0000-4000-8000-0000000000bb';

type Reply = { data?: unknown; error?: unknown };
type Call =
  | { op: 'select'; columns: string; gt?: string; order?: unknown; limit?: number }
  | { op: 'update'; values: Record<string, unknown>; eq: [string, string]; returning: string }
  | { op: 'insert'; values: Record<string, unknown> };

/** A fake of the few client calls reviewsync uses. Each reply comes from a script, in call order per kind. */
function fakeClient(script: { select?: Reply[]; update?: (Reply | Error)[]; insert?: (Reply | Error)[] } = {}) {
  const calls: Call[] = [];
  /** Who the browser's session says is signed in; tests change it to sign out or switch accounts. */
  const auth = { userId: OWNER as string | null, reads: 0 };
  const next = <T>(list: T[] | undefined, fallback: T): T => (list && list.length ? list.shift()! : fallback);
  const settle = (reply: Reply | Error) => (reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply));
  const client: ReviewStateClient = {
    auth: {
      async getSession() {
        auth.reads += 1;
        return { data: { session: auth.userId ? { user: { id: auth.userId, email: '' } } : null }, error: null };
      },
    },
    from(table) {
      expect(table).toBe('review_state');
      return {
        select(columns) {
          const call: Extract<Call, { op: 'select' }> = { op: 'select', columns };
          calls.push(call);
          const query = {
            gt(column: 'item_id', value: string) { expect(column).toBe('item_id'); call.gt = value; return query; },
            order(column: 'item_id', options: { ascending: true }) { call.order = [column, options]; return query; },
            limit(count: number) { call.limit = count; return Promise.resolve(next(script.select, { data: [], error: null })); },
          };
          return query;
        },
        update(values) {
          return {
            eq(column, value) {
              return {
                select(returning) {
                  calls.push({ op: 'update', values: { ...values }, eq: [column, value], returning });
                  return settle(next(script.update, { data: [{ item_id: value }], error: null }));
                },
              };
            },
          };
        },
        insert(values) {
          calls.push({ op: 'insert', values: { ...values } });
          return settle(next(script.insert, { data: null, error: null }));
        },
      };
    },
  };
  return { client, calls, auth };
}

const row = (item_id: string, level: 0 | 1 | 2 | 3 = 1, last_reviewed = '2026-11-01', next_review = '2026-11-04'): ReviewStateRow =>
  ({ item_id, level, last_reviewed, next_review });

describe('loadReviewState', () => {
  it('reads the four columns page by page in item_id order and stops at an empty page', async () => {
    const page = Array.from({ length: PAGE_SIZE }, (_, i) => row(`550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`));
    const { client, calls } = fakeClient({ select: [{ data: page, error: null }, { data: [row(A)], error: null }, { data: [], error: null }] });
    const loaded = await loadReviewState(client);
    expect(loaded).toEqual({ ok: true, rows: [...page, row(A)] });
    expect(calls).toEqual([
      { op: 'select', columns: 'item_id,level,last_reviewed,next_review', order: ['item_id', { ascending: true }], limit: PAGE_SIZE },
      { op: 'select', columns: 'item_id,level,last_reviewed,next_review', gt: page.at(-1)!.item_id, order: ['item_id', { ascending: true }], limit: PAGE_SIZE },
      { op: 'select', columns: 'item_id,level,last_reviewed,next_review', gt: A, order: ['item_id', { ascending: true }], limit: PAGE_SIZE },
    ]);
  });

  it('returns no rows for a student who has none', async () => {
    const { client } = fakeClient();
    expect(await loadReviewState(client)).toEqual({ ok: true, rows: [] });
  });

  it.each([
    ['an error reply', { data: null, error: { code: '42501', message: 'permission denied' } }],
    ['a reply that is not a list', { data: { item_id: A }, error: null }],
    ['an extra column', { data: [{ ...row(A), user_id: B }], error: null }],
    ['a missing column', { data: [{ item_id: A, level: 1, last_reviewed: '2026-11-01' }], error: null }],
    ['a sample-deck id', { data: [row('red' as string)], error: null }],
    ['an uppercase id', { data: [row(A.toUpperCase())], error: null }],
    ['a level of 4', { data: [{ ...row(A), level: 4 }], error: null }],
    ['a level written as text', { data: [{ ...row(A), level: '1' }], error: null }],
    ['an impossible day', { data: [row(A, 1, '2026-02-30')], error: null }],
    ['a next review that is not after the last', { data: [row(A, 1, '2026-11-01', '2026-11-01')], error: null }],
    ['a next review over a year out', { data: [row(A, 1, '2026-11-01', '2027-11-03')], error: null }],
    ['a duplicate', { data: [row(A), row(A)], error: null }],
    ['rows out of order', { data: [row(B), row(A)], error: null }],
    ['a getter instead of a value', { data: [Object.defineProperty({ ...row(A) }, 'level', { get: () => 1, enumerable: true })], error: null }],
    ['a class instance', { data: [Object.assign(new (class Row {})(), row(A))], error: null }],
    ['a page longer than asked for', { data: Array.from({ length: PAGE_SIZE + 1 }, () => row(A)), error: null }],
  ])('fails the whole load on %s', async (_name, reply) => {
    const { client } = fakeClient({ select: [reply as Reply] });
    expect(await loadReviewState(client)).toEqual({ ok: false, message: MESSAGES.load });
  });

  it('fails when a later page ignores the cursor', async () => {
    const page = Array.from({ length: PAGE_SIZE }, (_, i) => row(`550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`));
    const { client } = fakeClient({ select: [{ data: page, error: null }, { data: page, error: null }] });
    expect(await loadReviewState(client)).toEqual({ ok: false, message: MESSAGES.load });
  });

  it('fails when the client throws (offline)', async () => {
    const client = { from: () => { throw new TypeError('Failed to fetch'); } } as unknown as ReviewStateClient;
    expect(await loadReviewState(client)).toEqual({ ok: false, message: MESSAGES.load });
  });

  it('stops past the export cap instead of reading forever', async () => {
    let n = 0;
    const id = () => `550e8400-e29b-41d4-a716-${String(n++).padStart(12, '0')}`;
    const pages = Array.from({ length: MAX_ROWS / PAGE_SIZE + 1 }, () => ({ data: Array.from({ length: PAGE_SIZE }, () => row(id())), error: null }));
    const { client, calls } = fakeClient({ select: pages });
    expect(await loadReviewState(client)).toEqual({ ok: false, message: MESSAGES.load });
    expect(calls).toHaveLength(MAX_ROWS / PAGE_SIZE + 1);
  });
});

describe('rowAfterReview', () => {
  it('counts the knew streak and takes the next day from the scheduler', () => {
    expect(rowAfterReview(A, [{ day: today, result: 'knew' }], today)).toEqual(row(A, 1, today, '2026-11-05'));
    expect(rowAfterReview(A, [{ day: '2026-10-20', result: 'knew' }, { day: '2026-10-25', result: 'knew' }, { day: today, result: 'knew' }, { day: today, result: 'knew' }], today))
      .toEqual(row(A, 3, today, '2026-11-16'));
    expect(rowAfterReview(A, [{ day: '2026-10-20', result: 'knew' }, { day: today, result: 'missed' }], today)).toEqual(row(A, 0, today, '2026-11-03'));
  });

  it('brings the next day forward for an exam, never before tomorrow', () => {
    expect(rowAfterReview(A, [{ day: today, result: 'knew' }, { day: today, result: 'knew' }], today, '2026-11-04').next_review).toBe('2026-11-03');
  });

  it('refuses sample ids, empty histories and a last review that is not today', () => {
    expect(() => rowAfterReview('red', [{ day: today, result: 'knew' }], today)).toThrow();
    expect(() => rowAfterReview(A, [], today)).toThrow();
    expect(() => rowAfterReview(A, [{ day: '2026-11-01', result: 'knew' }], today)).toThrow();
  });
});

describe('historiesFor', () => {
  it('builds histories for this deck only and treats a future last review as today', () => {
    const rows = [row(A, 2, '2026-10-30', '2026-11-06'), row(B, 0, '2026-11-03', '2026-11-04'), row(C)];
    expect(historiesFor(rows, [A, B], today)).toEqual({
      [A]: [{ day: '2026-10-30', result: 'knew' }, { day: '2026-10-30', result: 'knew' }],
      [B]: [{ day: today, result: 'missed' }],
    });
  });

  it('gives startSession histories it accepts', () => {
    const cards = [A, B].map((id) => ({ id, front: `front ${id}`, back: `back ${id}` }));
    const state = startSession(cards, historiesFor([row(A, 0, '2026-11-01', '2026-11-02')], [A, B], today), today);
    expect(state.queue).toEqual([A, B]);
  });
});

describe('createReviewSync writes', () => {
  it('updates an existing row with only the three update columns', async () => {
    const { client, calls } = fakeClient();
    const sync = createReviewSync(client, OWNER);
    expect(await sync.record(A, [{ day: today, result: 'knew' }], today)).toEqual({ ok: true });
    expect(calls).toEqual([{ op: 'update', values: { level: 1, last_reviewed: today, next_review: '2026-11-05' }, eq: ['item_id', A], returning: 'item_id' }]);
    expect(Object.keys((calls[0] as Extract<Call, { op: 'update' }>).values).sort()).toEqual(['last_reviewed', 'level', 'next_review']);
  });

  it('inserts with only the four insert columns when the student has no row yet', async () => {
    const { client, calls } = fakeClient({ update: [{ data: [], error: null }] });
    expect(await createReviewSync(client, OWNER).record(A, [{ day: today, result: 'missed' }], today)).toEqual({ ok: true });
    expect(calls[1]).toEqual({ op: 'insert', values: { item_id: A, level: 0, last_reviewed: today, next_review: '2026-11-03' } });
    for (const call of calls) expect(call).not.toHaveProperty('values.user_id');
  });

  it('updates again when another tab added the row first', async () => {
    const { client, calls } = fakeClient({ update: [{ data: [], error: null }], insert: [{ error: { code: '23505', message: 'duplicate key' } }] });
    expect(await createReviewSync(client, OWNER).record(A, [{ day: today, result: 'knew' }], today)).toEqual({ ok: true });
    expect(calls.map((call) => call.op)).toEqual(['update', 'insert', 'update']);
  });

  it('never sends sample-deck cards', async () => {
    const { client, calls } = fakeClient();
    expect(await createReviewSync(client, OWNER).record('red', [{ day: today, result: 'knew' }], today)).toEqual({ ok: true });
    expect(calls).toEqual([]);
  });

  it('writes in order and keeps only the newest step per question', async () => {
    const { client, calls } = fakeClient();
    const sync = createReviewSync(client, OWNER);
    const first = sync.record(A, [{ day: today, result: 'knew' }], today);
    const second = sync.record(B, [{ day: today, result: 'missed' }], today);
    expect(await Promise.all([first, second])).toEqual([{ ok: true }, { ok: true }]);
    expect(calls.map((call) => (call as Extract<Call, { op: 'update' }>).eq[1])).toEqual([A, B]);
  });

  it('works with the session it is wired into', async () => {
    const { client, calls } = fakeClient();
    const sync = createReviewSync(client, OWNER);
    let state = startSession([{ id: A, front: 'front', back: 'back' }], {}, today);
    state = answer(state, 'knew');
    expect(await sync.record(A, state.histories[A]!, state.today, state.examDay)).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({ op: 'update', values: { level: 1, last_reviewed: today, next_review: '2026-11-05' } });
  });
});

describe('createReviewSync failures', () => {
  it.each([
    ['offline', new TypeError('Failed to fetch'), MESSAGES.connection],
    ['a server error', { data: null, error: { code: '500', message: 'oops' } }, MESSAGES.connection],
    ['a signed-out session', { data: null, error: { code: '42501', message: 'permission denied for table review_state' } }, MESSAGES.signedOut],
    ['a date the guard refuses', { data: null, error: { code: '23514', message: 'the last review cannot be in the future' } }, MESSAGES.deviceDate],
    ['an odd reply', { data: [{ item_id: A }, { item_id: B }], error: null }, MESSAGES.connection],
  ])('tells the student in one sentence on %s', async (_name, reply, message) => {
    const { client } = fakeClient({ update: [reply as Reply | Error] });
    expect(await createReviewSync(client, OWNER).record(A, [{ day: today, result: 'knew' }], today)).toEqual({ ok: false, message, failed: [A] });
  });

  it('says when a question is not published (the insert policy refuses it)', async () => {
    const { client } = fakeClient({
      update: [{ data: [], error: null }],
      insert: [{ error: { code: '42501', message: 'new row violates row-level security policy for table "review_state"' } }],
    });
    expect(await createReviewSync(client, OWNER).record(A, [{ day: today, result: 'knew' }], today)).toEqual({ ok: false, message: MESSAGES.unavailable, failed: [A] });
  });

  it('keeps unsaved rows and saves them on retry', async () => {
    const { client, calls } = fakeClient({ update: [new TypeError('Failed to fetch')] });
    const sync = createReviewSync(client, OWNER);
    expect(await sync.record(A, [{ day: today, result: 'knew' }], today)).toEqual({ ok: false, message: MESSAGES.connection, failed: [A] });
    expect(await sync.retry()).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(await sync.retry()).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('one refused question never blocks the others, and stays waiting and reported (Codex on #234)', async () => {
    const refused = { error: { code: '42501', message: 'new row violates row-level security policy for table "review_state"' } };
    const noRow = { data: [], error: null };
    const { client, calls } = fakeClient({ update: [noRow, noRow, { data: [{ item_id: B }], error: null }, noRow], insert: [refused, refused, refused] });
    const sync = createReviewSync(client, OWNER);
    expect(await sync.record(A, [{ day: today, result: 'knew' }], today)).toEqual({ ok: false, message: MESSAGES.unavailable, failed: [A] });
    // B comes after the refused A in the waiting list and is still saved.
    expect(await sync.record(B, [{ day: today, result: 'missed' }], today)).toEqual({ ok: false, message: MESSAGES.unavailable, failed: [A] });
    const writes = calls.map((call) => `${call.op} ${call.op === 'update' ? call.eq[1] : (call as Extract<Call, { op: 'insert' }>).values.item_id}`);
    expect(writes).toEqual([`update ${A}`, `insert ${A}`, `update ${A}`, `insert ${A}`, `update ${B}`]);
    // A is kept for a retry; B, saved, is not sent again.
    expect(await sync.retry()).toEqual({ ok: false, message: MESSAGES.unavailable, failed: [A] });
    expect(calls.slice(5).map((call) => call.op)).toEqual(['update', 'insert']);
    expect(await sync.retry()).toEqual({ ok: true });
    expect(calls).toHaveLength(8);
  });

  it('tries every waiting row and shows the sentence that applies to them all first', async () => {
    const refused = { error: { code: '42501', message: 'new row violates row-level security policy for table "review_state"' } };
    const { client, calls } = fakeClient({
      update: [new TypeError('Failed to fetch'), new TypeError('Failed to fetch'), { data: [], error: null }],
      insert: [refused],
    });
    const sync = createReviewSync(client, OWNER);
    expect((await sync.record(A, [{ day: today, result: 'knew' }], today)).ok).toBe(false);
    expect(await sync.record(B, [{ day: today, result: 'knew' }], today)).toEqual({ ok: false, message: MESSAGES.connection, failed: [A, B] });
    // Back online: the next step sends every waiting row, oldest first, then the new one.
    expect(await sync.record(C, [{ day: today, result: 'knew' }], today)).toEqual({ ok: true });
    expect(calls.filter((call) => call.op === 'update').map((call) => (call as Extract<Call, { op: 'update' }>).eq[1]))
      .toEqual([A, A, B, A, B, C]);
  });

  it('reports a history it cannot schedule instead of sending it', async () => {
    const { client, calls } = fakeClient();
    expect(await createReviewSync(client, OWNER).record(A, [{ day: '2026-11-05', result: 'knew' }], today)).toEqual({ ok: false, message: MESSAGES.deviceDate });
    expect(calls).toEqual([]);
  });

  it('every message is one plain sentence with no database words', () => {
    for (const message of Object.values(MESSAGES)) {
      expect(message).toMatch(/^[a-z][^.]*\.$/);
      expect(message).not.toMatch(/review_state|42501|23514|sql|row-level/i);
    }
    expect(syncMessage(undefined)).toBe(MESSAGES.connection);
  });
});

describe('startReviewSync', () => {
  it('leaves accounts-off and signed-out reviews on the device without any call', async () => {
    const { client, calls } = fakeClient();
    expect(await startReviewSync(null, { signedIn: true, userId: A, email: '' })).toEqual({ mode: 'device' });
    expect(await startReviewSync(client, { signedIn: false })).toEqual({ mode: 'device' });
    expect(calls).toEqual([]);
  });

  it('loads first, then saves to the account', async () => {
    const { client } = fakeClient({ select: [{ data: [row(A)], error: null }] });
    const started = await startReviewSync(client, { signedIn: true, userId: OWNER, email: '' });
    expect(started.mode).toBe('account');
    if (started.mode === 'account') expect(started.rows).toEqual([row(A)]);
  });

  it('stays on the device and says so when the load fails', async () => {
    const { client } = fakeClient({ select: [{ data: null, error: { code: '500' } }] });
    expect(await startReviewSync(client, { signedIn: true, userId: OWNER, email: '' })).toEqual({ mode: 'device', message: MESSAGES.load });
  });

  it('knows a published id from a sample id', () => {
    expect(isItemId(A)).toBe(true);
    expect(isItemId('red')).toBe(false);
  });
});

describe('a sync belongs to one account (Task 302)', () => {
  it('needs the owner id', () => {
    const { client } = fakeClient();
    expect(() => createReviewSync(client, '')).toThrow();
  });

  it('checks the session before every request', async () => {
    const { client, calls, auth } = fakeClient({ update: [{ data: [], error: null }] });
    expect(await createReviewSync(client, OWNER).record(A, [{ day: today, result: 'knew' }], today)).toEqual({ ok: true });
    expect(calls.map((call) => call.op)).toEqual(['update', 'insert']);
    expect(auth.reads).toBe(2);
  });

  it('sends nothing and drops the waiting rows when the student signed out', async () => {
    const { client, calls, auth } = fakeClient({ update: [new TypeError('Failed to fetch')] });
    const sync = createReviewSync(client, OWNER);
    expect((await sync.record(A, [{ day: today, result: 'knew' }], today)).ok).toBe(false);
    expect(calls).toHaveLength(1);
    auth.userId = null;
    expect(await sync.retry()).toEqual({ ok: false, message: MESSAGES.signedOut });
    expect(calls).toHaveLength(1);
    // Signing back in as the same student does not bring the dropped rows back.
    auth.userId = OWNER;
    expect(await sync.retry()).toEqual({ ok: false, message: MESSAGES.signedOut });
    expect(calls).toHaveLength(1);
  });

  it("never writes one student's rows under another student's sign-in", async () => {
    const { client, calls, auth } = fakeClient({ update: [new TypeError('Failed to fetch')] });
    const sync = createReviewSync(client, OWNER);
    expect((await sync.record(A, [{ day: today, result: 'knew' }], today)).ok).toBe(false);
    auth.userId = OTHER;
    expect(await sync.record(B, [{ day: today, result: 'knew' }], today)).toEqual({ ok: false, message: MESSAGES.signedOut });
    expect(calls).toHaveLength(1);
    // The other student's later steps are refused too: this sync is not theirs.
    expect(await sync.record(C, [{ day: today, result: 'knew' }], today)).toEqual({ ok: false, message: MESSAGES.signedOut });
    expect(calls).toHaveLength(1);
  });

  it('stops between the update and the insert if the account changes in between', async () => {
    const { client, calls, auth } = fakeClient();
    const sync = createReviewSync(client, OWNER);
    const noRow = { data: [], error: null } as Reply;
    let switched = false;
    const original = client.from.bind(client);
    client.from = (table) => {
      const chain = original(table);
      return {
        ...chain,
        update(values) {
          return {
            eq(column, value) {
              return {
                select(returning) {
                  calls.push({ op: 'update', values: { ...values }, eq: [column, value], returning });
                  if (!switched) { switched = true; auth.userId = OTHER; }
                  return Promise.resolve(noRow);
                },
              };
            },
          };
        },
      };
    };
    expect(await sync.record(A, [{ day: today, result: 'knew' }], today)).toEqual({ ok: false, message: MESSAGES.signedOut });
    expect(calls.map((call) => call.op)).toEqual(['update']);
  });

  it('a later row waiting behind the change is dropped too, not sent', async () => {
    const { client, calls, auth } = fakeClient({ update: [new TypeError('Failed to fetch'), new TypeError('Failed to fetch')] });
    const sync = createReviewSync(client, OWNER);
    await sync.record(A, [{ day: today, result: 'knew' }], today);
    await sync.record(B, [{ day: today, result: 'knew' }], today);
    const sent = calls.length;
    auth.userId = null;
    expect(await sync.retry()).toEqual({ ok: false, message: MESSAGES.signedOut });
    expect(calls).toHaveLength(sent);
  });

  it('startReviewSync stays on the device if the account changed while the rows loaded', async () => {
    const { client, auth } = fakeClient();
    const original = client.from.bind(client);
    client.from = (table) => {
      auth.userId = OTHER;
      return original(table);
    };
    expect(await startReviewSync(client, { signedIn: true, userId: OWNER, email: '' }))
      .toEqual({ mode: 'device', message: MESSAGES.signedOut });
  });

  it('startReviewSync ties the sync to the student it started for', async () => {
    const { client, calls, auth } = fakeClient();
    const started = await startReviewSync(client, { signedIn: true, userId: OWNER, email: '' });
    expect(started.mode).toBe('account');
    if (started.mode !== 'account') return;
    auth.userId = OTHER;
    expect(await started.sync.record(A, [{ day: today, result: 'knew' }], today)).toEqual({ ok: false, message: MESSAGES.signedOut });
    expect(calls.filter((call) => call.op !== 'select')).toEqual([]);
  });
});
