import { describe, expect, it } from 'vitest';
import { exportCsvBlobs, exportJsonBlob, StudyEventPages } from '../../src/islands/exportdata';
import {
  fromSupabase, loadExport, type ExportReader, type ExportRpc, type ExportTable, type SupabaseExportClient,
} from '../../src/islands/exportload';

const when = '2026-11-01T08:00:00.000Z';
const versionId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const reportId = '33333333-3333-4333-8333-333333333333';
const id = (n: number) => n.toString(16).padStart(8, '0') + '-0000-4000-8000-000000000000';
const fields = {
  profiles: 'display_name,created_at',
  attempts: 'id,item_version_id,picked,correct,created_at',
  exam_plans: 'id,course,exam_date,created_at',
  review_state: 'item_id,level,last_reviewed,next_review,updated_at',
  study_events: 'id,item_id,item_version_id,kind,ms_on_item,mark,at,created_at',
} as const;
const rows = {
  profiles: [{ display_name: 'Sample', created_at: when, user_id: 'private' }],
  attempts: [{ id: id(1), item_version_id: versionId, picked: ['a', 'c'], correct: true, created_at: when, user_id: 'private' }],
  exam_plans: [{ id: id(2), course: 'med-surg-1', exam_date: '2026-12-15', created_at: when }],
  review_state: [{ item_id: itemId, level: 2, last_reviewed: '2026-10-30', next_review: '2026-11-03', updated_at: when, user_id: 'private' }],
  study_events: [
    { id: id(3), item_id: itemId, item_version_id: versionId, kind: 'marked', ms_on_item: 4200, mark: 'learning',
      at: '2026-11-01T07:59:58.5+00:00', created_at: when, user_id: 'private' },
    { id: id(4), item_id: itemId, item_version_id: versionId, kind: 'answered', ms_on_item: 0, mark: null,
      at: when, created_at: when, user_id: 'private' },
  ],
  my_flags: [{ id: reportId, page: '/learn/study-skills', item_id: null, item_version_id: null,
    reason: 'confusing', comment: 'Sample report', created_at: when, status: 'private' }],
  my_sessions: [{ id: id(5), created_at: when, updated_at: '2026-11-01T09:00:00+00:00', not_after: null,
    user_agent: 'sample browser', ip: '203.0.113.5', user_id: 'private' }],
};
/** A sample of what auth.getUser() returns for a Google account: made-up values, no real person. */
const googleData = {
  iss: 'https://accounts.google.com', sub: '100000000000000000001', provider_id: '100000000000000000001',
  name: 'Sample Student', full_name: 'Sample Student', email: 'sample@example.invalid', email_verified: true,
  phone_verified: false, picture: 'https://example.invalid/photo.png', avatar_url: 'https://example.invalid/photo.png',
  custom_claims: { hd: 'example.invalid' },
};
const user = {
  id: 'private', aud: 'authenticated', role: 'authenticated', email: 'sample@example.invalid',
  created_at: '2026-10-01T12:00:00.123456Z', last_sign_in_at: when,
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: googleData,
  identities: [{ identity_id: 'private', id: 'private', user_id: 'private', provider: 'google', identity_data: googleData,
    created_at: '2026-10-01T12:00:00.123456Z', last_sign_in_at: when, updated_at: when, email: 'private' }],
};
const account = {
  createdAt: '2026-10-01T12:00:00.123456Z', lastSignInAt: when, providers: ['google'], userMetadata: googleData,
  identities: [{ provider: 'google', identityData: googleData, createdAt: '2026-10-01T12:00:00.123456Z', lastSignInAt: when }],
};
const sessions = [{ createdAt: when, updatedAt: '2026-11-01T09:00:00+00:00', notAfter: null, userAgent: 'sample browser', ip: '203.0.113.5' }];
type Table = keyof typeof fields;
type Source = Table | ExportRpc | 'user';
type Reply = { data: unknown; error: unknown };
const failed = { ok: false, message: "we couldn't load all your saved data. please try again." };

function reader(overrides: Partial<Record<Source, Reply | Error>> = {}) {
  const calls: string[] = [];
  const fetch = (table: Source) => {
    if (overrides[table] instanceof Error) throw overrides[table];
    return overrides[table] ?? { data: table === 'user' ? { user } : rows[table], error: null };
  };
  const db: ExportReader = {
    async select(table, columns) { calls.push(table + ':' + columns); return fetch(table) as Reply; },
    async *selectPages(table, columns) { calls.push(table + ':' + columns); yield fetch(table) as Reply; },
    async rpc(name) { calls.push('rpc:' + name); return fetch(name) as Reply; },
    async user() { calls.push('user'); return fetch('user') as Reply; },
  };
  return { db, calls };
}

describe('loadExport — personal data boundaries', () => {
  it('maps the five owned tables, my_flags, my_sessions and the sign-in record with no extra fields or lost records', async () => {
    const { db, calls } = reader();
    const result = await loadExport(db);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { studyEvents, ...rest } = result.data;
    expect(rest).toEqual({
      profile: { displayName: 'Sample', createdAt: when },
      attempts: [{ itemVersionId: versionId, picked: ['a', 'c'], correct: true, createdAt: when }],
      examPlans: [{ course: 'med-surg-1', examDate: '2026-12-15', createdAt: when }],
      reviewRows: [{ itemId, level: 2, lastReviewed: '2026-10-30', nextReview: '2026-11-03', updatedAt: when }],
      reports: [{ id: reportId, page: '/learn/study-skills', itemId: null, itemVersionId: null,
        reason: 'confusing', comment: 'Sample report', createdAt: when }],
      account,
      sessions,
    });
    expect(studyEvents).toBeInstanceOf(StudyEventPages);
    expect((studyEvents as StudyEventPages).count).toBe(2);
    const text = await exportJsonBlob(result.data, when).text();
    const exported = JSON.parse(text);
    expect(exported.dropped).toEqual([]);
    expect(exported.attempts).toEqual(result.data.attempts);
    expect(exported.reports).toEqual(result.data.reports);
    expect(exported.account).toEqual(account);
    expect(exported.sessions).toEqual([{ ...sessions[0], updatedAt: '2026-11-01T09:00:00.000Z' }]);
    expect(exported.studyEvents).toEqual([
      { itemId, itemVersionId: versionId, kind: 'marked', msOnItem: 4200, mark: 'learning',
        at: '2026-11-01T07:59:58.500Z', createdAt: when },
      { itemId, itemVersionId: versionId, kind: 'answered', msOnItem: 0, mark: null, at: when, createdAt: when },
    ]);
    expect(JSON.stringify(rest) + text).not.toContain('private');
    expect(calls).toEqual([
      'profiles:' + fields.profiles, 'attempts:' + fields.attempts,
      'exam_plans:' + fields.exam_plans, 'review_state:' + fields.review_state,
      'study_events:' + fields.study_events, 'rpc:my_flags', 'rpc:my_sessions', 'user',
    ]);
  });

  it('exports the sign-in record as plain copies, and never the user, identity or session ids', async () => {
    const result = await loadExport(reader().db);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.account?.userMetadata).not.toBe(user.user_metadata);
    expect(result.data.account?.identities?.[0]?.identityData).not.toBe(googleData);
    const text = await exportJsonBlob(result.data, when).text();
    expect(text).not.toContain('private');
    expect(text).not.toContain(id(5));
    const files = exportCsvBlobs(result.data);
    const accountCsv = await files.find(file => file.fileName === 'account.csv')!.blob.text();
    expect(accountCsv).toContain('identities[0].identityData.picture,https://example.invalid/photo.png\r\n');
    expect(accountCsv).toContain('userMetadata.custom_claims.hd,example.invalid\r\n');
    expect(accountCsv).not.toContain('private');
    const sessionsCsv = await files.find(file => file.fileName === 'sessions.csv')!.blob.text();
    expect(sessionsCsv).toBe('createdAt,updatedAt,notAfter,userAgent,ip\r\n' +
      when + ',2026-11-01T09:00:00.000Z,,sample browser,203.0.113.5\r\n');
  });

  it('accepts an email-only account that Supabase gave no last sign-in, metadata or identities', async () => {
    const plainUser = { id: 'private', created_at: when, app_metadata: { provider: 'email', providers: ['email'] } };
    const result = await loadExport(reader({ user: { data: { user: plainUser }, error: null } }).db);
    expect(result.ok && result.data.account).toEqual({
      createdAt: when, lastSignInAt: null, providers: ['email'], userMetadata: {}, identities: [],
    });
  });

  it('has empty sections when the account has no rows, without inventing email', async () => {
    const overrides = Object.fromEntries(Object.keys(rows).map(key => [key, { data: [], error: null }]));
    const result = await loadExport(reader(overrides).db);
    expect(result).toEqual({
      ok: true,
      data: { profile: {}, account, attempts: [], examPlans: [], reviewRows: [], reports: [], sessions: [],
        studyEvents: expect.any(StudyEventPages) },
    });
    if (!result.ok) return;
    expect((result.data.studyEvents as StudyEventPages).count).toBe(0);
    expect(JSON.parse(await exportJsonBlob(result.data, when).text()).studyEvents).toEqual([]);
  });

  it.each(['profiles', 'attempts', 'exam_plans', 'review_state', 'study_events', 'my_flags', 'my_sessions', 'user'] as const)(
    'fails closed on a %s refusal without returning any personal data', async table => {
      const response = { data: table === 'user' ? { user } : rows[table], error: { message: 'private SQL error' } };
      expect(await loadExport(reader({ [table]: response }).db)).toEqual(failed);
    },
  );

  it('fails closed on network errors, missing rows and duplicate profiles', async () => {
    expect(await loadExport(reader({ attempts: new Error('private key') }).db)).toEqual(failed);
    expect(await loadExport(reader({ my_flags: { data: null, error: null } }).db)).toEqual(failed);
    expect(await loadExport(reader({ my_sessions: { data: null, error: null } }).db)).toEqual(failed);
    expect(await loadExport(reader({ user: { data: { user: null }, error: null } }).db)).toEqual(failed);
    expect(await loadExport(reader({ user: new Error('private token') }).db)).toEqual(failed);
    expect(await loadExport(reader({ profiles: { data: [rows.profiles[0], rows.profiles[0]], error: null } }).db)).toEqual(failed);
  });

  it.each([
    ['attempts', { ...rows.attempts[0], picked: ['a', 'a'] }],
    ['attempts', { ...rows.attempts[0], created_at: '2026-02-30T08:00:00Z' }],
    ['attempts', { ...rows.attempts[0], created_at: '2026-11-01T24:00:00Z' }],
    ['exam_plans', { ...rows.exam_plans[0], course: 'Med Surg' }],
    ['review_state', { ...rows.review_state[0], next_review: '2026-02-30' }],
    ['study_events', { ...rows.study_events[0], kind: 'viewed' }],
    ['study_events', { ...rows.study_events[0], mark: null }],
    ['study_events', { ...rows.study_events[1], mark: 'know' }],
    ['study_events', { ...rows.study_events[0], mark: 'maybe' }],
    ['study_events', { ...rows.study_events[0], ms_on_item: 1_800_001 }],
    ['study_events', { ...rows.study_events[0], ms_on_item: '4200' }],
    ['study_events', { ...rows.study_events[0], at: '2026-02-30T08:00:00Z' }],
    ['study_events', { ...rows.study_events[0], item_version_id: 'private' }],
    ['my_flags', { ...rows.my_flags[0], page: '//outside.example' }],
    ['my_flags', { ...rows.my_flags[0], reason: 'not-allowed' }],
    ['my_flags', { ...rows.my_flags[0], comment: 'x'.repeat(1001) }],
    ['my_sessions', { ...rows.my_sessions[0], ip: 203 }],
    ['my_sessions', { ...rows.my_sessions[0], created_at: '2026-02-30T08:00:00Z' }],
    ['my_sessions', { ...rows.my_sessions[0], id: 'private' }],
  ] as const)('does not silently drop invalid %s records', async (table, record) => {
    expect(await loadExport(reader({ [table]: { data: [record], error: null } }).db)).toEqual(failed);
  });

  const deep: Record<string, unknown> = {};
  let level = deep;
  for (let n = 0; n < 6; n++) { level.next = {}; level = level.next as Record<string, unknown>; }
  it.each([
    ['a bad creation time', { ...user, created_at: '2026-02-30T08:00:00Z' }],
    ['a sign-in method that is not a name', { ...user, app_metadata: { providers: ['Google Sign-In'] } }],
    ['metadata that is a list', { ...user, user_metadata: ['private'] }],
    ['metadata nested too deep', { ...user, user_metadata: deep }],
    ['metadata with a function', { ...user, user_metadata: { name: () => 'private' } }],
    ['an identity without a provider', { ...user, identities: [{ identity_data: googleData }] }],
    ['identities that are not a list', { ...user, identities: { 0: user.identities[0] } }],
    ['too many identities', { ...user, identities: Array(21).fill(user.identities[0]) }],
  ])('fails closed on a sign-in record with %s', async (_, record) => {
    expect(await loadExport(reader({ user: { data: { user: record }, error: null } }).db)).toEqual(failed);
  });

  it('does not run getters in the sign-in record', async () => {
    const identityData = { ...googleData };
    Object.defineProperty(identityData, 'name', { get: () => { throw Error('getter ran'); }, enumerable: true });
    const record = { ...user, identities: [{ ...user.identities[0], identity_data: identityData }] };
    expect(await loadExport(reader({ user: { data: { user: record }, error: null } }).db)).toEqual(failed);
  });

  it('does not execute getters supplied by a database-reader mock', async () => {
    const malicious = { ...rows.profiles[0] };
    Object.defineProperty(malicious, 'display_name', { get: () => { throw Error('getter ran'); }, enumerable: true });
    expect(await loadExport(reader({ profiles: { data: [malicious], error: null } }).db)).toEqual(failed);
  });
});

function supabase(dataset: Record<string, unknown[]>, failure?: { name: string; page: number }, mutate?: () => void) {
  const calls: string[] = [];
  const requests = new Map<string, number>();
  const query = (name: string) => {
    let sortedBy = '';
    let after: { field: string; value: string } | undefined;
    const q = {
      order(column: string, options: { ascending: boolean }) {
        expect(options.ascending).toBe(true);
        sortedBy = column;
        return q;
      },
      gt(field: string, value: string) { after = { field, value }; return q; },
      async range(from: number, to: number): Promise<Reply> {
        const page = (requests.get(name) ?? 0) + 1;
        requests.set(name, page);
        calls.push(name + ':' + from + '-' + to + ':' + sortedBy + (after ? '.gt(' + after.value + ')' : ''));
        if (failure?.name === name && failure.page === page) return { data: null, error: 'private' };
        // Simulate a second tab removing an already-read row before page two.
        if (name === 'review_state' && page === 2 && mutate) mutate();
        const set = [...(dataset[name] ?? [])] as Record<string, unknown>[];
        set.sort((a, b) => String(a[sortedBy]).localeCompare(String(b[sortedBy])));
        const keyset = after;
        const matching = keyset ? set.filter(r => String(r[keyset.field]) > keyset.value) : set;
        return { data: matching.slice(from, to + 1), error: null };
      },
    };
    return q;
  };
  const client = {
    from: (name: ExportTable) => ({ select: (columns: string) => {
      expect(columns).toBe(fields[name]); return query(name);
    } }),
    rpc: (name: ExportRpc) => query(name),
    auth: { getUser: async () => ({ data: { user }, error: null }) },
  } satisfies SupabaseExportClient;
  return { client, calls };
}

describe('fromSupabase — no silent row truncation', () => {
  it('loads more than the default 1,000 rows using stable, bounded pages', async () => {
    const many = { ...rows,
      attempts: Array.from({ length: 1002 }, (_, i) => ({ ...rows.attempts[0], id: id(i + 1) })),
      my_flags: Array.from({ length: 501 }, (_, i) => ({ ...rows.my_flags[0], id: id(i + 1) })) };
    const { client, calls } = supabase(many);
    const result = await loadExport(fromSupabase(client));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.attempts).toHaveLength(1002);
    expect(result.data.reports).toHaveLength(501);
    expect(calls.filter(x => x.startsWith('attempts:'))).toEqual([
      'attempts:0-499:id',
      'attempts:0-499:id.gt(' + id(500) + ')',
      'attempts:0-499:id.gt(' + id(1000) + ')',
    ]);
    expect(calls.some(x => x.startsWith('flags:'))).toBe(false);
  });

  it('pages my_sessions by its id and reads the sign-in record from auth.getUser()', async () => {
    const many = { ...rows, my_sessions: Array.from({ length: 501 }, (_, i) => ({ ...rows.my_sessions[0], id: id(i + 1) })) };
    const { client, calls } = supabase(many);
    const result = await loadExport(fromSupabase(client));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sessions).toHaveLength(501);
    expect(result.data.account).toEqual(account);
    expect(calls.filter(x => x.startsWith('my_sessions:'))).toEqual([
      'my_sessions:0-499:id',
      'my_sessions:0-499:id.gt(' + id(500) + ')',
    ]);
  });

  it('fails the whole export when a later page is unavailable', async () => {
    const source = { ...rows,
      attempts: Array.from({ length: 501 }, (_, i) => ({ ...rows.attempts[0], id: id(i + 1) })) };
    expect(await loadExport(fromSupabase(supabase(source, { name: 'attempts', page: 2 }).client))).toEqual(failed);
  });

  it('does not skip retained rows after an earlier review row is deleted between pages', async () => {
    const reviewRows = Array.from({ length: 502 }, (_, i) => ({ ...rows.review_state[0], item_id: id(i + 1) }));
    const source = { ...rows, review_state: reviewRows };
    const { client, calls } = supabase(source, undefined, () => { reviewRows.shift(); });
    const result = await loadExport(fromSupabase(client));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.reviewRows).toHaveLength(502);
    expect(result.data.reviewRows?.some(row => row.itemId === id(501))).toBe(true);
    expect(result.data.reviewRows?.some(row => row.itemId === id(502))).toBe(true);
    expect(calls.filter(x => x.startsWith('review_state:'))).toEqual([
      'review_state:0-499:item_id',
      'review_state:0-499:item_id.gt(' + id(500) + ')',
    ]);
  });

  it('pages study events by their id and reads them only from study_events', async () => {
    const events = Array.from({ length: 501 }, (_, i) => ({ ...rows.study_events[1], id: id(i + 10) }));
    const { client, calls } = supabase({ ...rows, study_events: events });
    const result = await loadExport(fromSupabase(client));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data.studyEvents as StudyEventPages).count).toBe(501);
    expect(calls.filter(x => x.startsWith('study_events:'))).toEqual([
      'study_events:0-499:id',
      'study_events:0-499:id.gt(' + id(509) + ')',
    ]);
  });

  it('refuses to silently truncate an oversized exam-plan result', async () => {
    const source = { ...rows, exam_plans: Array(11).fill(rows.exam_plans[0]) };
    expect(await loadExport(fromSupabase(supabase(source).client))).toEqual(failed);
  });

  it('fails the whole export when a later study-event page is unavailable or has a bad row', async () => {
    const events = Array.from({ length: 501 }, (_, i) => ({ ...rows.study_events[1], id: id(i + 10) }));
    expect(await loadExport(fromSupabase(supabase({ ...rows, study_events: events }, { name: 'study_events', page: 2 }).client)))
      .toEqual(failed);
    const bad = events.map((event, i) => i === 500 ? { ...event, kind: 'viewed' } : event);
    expect(await loadExport(fromSupabase(supabase({ ...rows, study_events: bad }).client))).toEqual(failed);
  });
});

/** A study_events table of `total` rows that makes each page only when it is asked for, so the test holds no full set. */
function generatedEvents(total: number) {
  const pages: { size: number; first: string | undefined }[] = [];
  const at = (n: number) => new Date(Date.UTC(2026, 9, 1) + n * 1000).toISOString();
  const query = () => {
    let after = -1;
    const q = {
      order(column: string) { expect(column).toBe('id'); return q; },
      gt(field: string, value: string) { expect(field).toBe('id'); after = parseInt(value.slice(0, 8), 16); return q; },
      async range(from: number, to: number): Promise<Reply> {
        const start = after + 1 + from;
        const data = [];
        for (let n = start; n <= Math.min(after + 1 + to, total - 1); n++) {
          data.push({ id: id(n), item_id: itemId, item_version_id: versionId, kind: n % 3 === 0 ? 'marked' : 'answered',
            ms_on_item: n % 1_800_000, mark: n % 3 === 0 ? 'know' : null, at: at(n), created_at: at(n), user_id: 'private' });
        }
        pages.push({ size: data.length, first: data[0]?.id });
        return { data, error: null };
      },
    };
    return q;
  };
  const small = supabase(rows).client;
  const client = {
    from: (name: ExportTable) => name === 'study_events'
      ? { select: (columns: string) => { expect(columns).toBe(fields.study_events); return query(); } }
      : small.from(name),
    rpc: small.rpc,
    auth: small.auth,
  } as SupabaseExportClient;
  return { client, pages, at };
}

describe('a study history longer than 200,000 events (Task 140)', () => {
  it('exports every event, a page at a time, with every other section beside it', async () => {
    const total = 250_001;
    const { client, pages, at } = generatedEvents(total);
    const result = await loadExport(fromSupabase(client));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Bounded memory: the loader asked for 500 rows at a time and kept none of them as one array of rows. Its
    // pages hold one written Blob per database page, each the size of a page, not the size of the history.
    expect(pages.every(page => page.size <= 500)).toBe(true);
    expect(pages).toHaveLength(Math.ceil(total / 500));
    const events = result.data.studyEvents;
    expect(events).toBeInstanceOf(StudyEventPages);
    if (!(events instanceof StudyEventPages)) return;
    expect(events.count).toBe(total);
    const written = events.written();
    expect(written.dropped).toEqual([]);
    expect(written.text.json).toHaveLength(Math.ceil(total / 500));
    expect(written.text.csv).toHaveLength(Math.ceil(total / 500));
    for (const part of [...written.text.json, ...written.text.csv]) {
      expect(part).toBeInstanceOf(Blob);
      expect((part as Blob).size).toBeLessThan(500 * 400);
    }

    const exported = JSON.parse(await exportJsonBlob(result.data, when).text());
    expect(exported.studyEvents).toHaveLength(total);
    expect(exported.studyEvents[0]).toEqual({ itemId, itemVersionId: versionId, kind: 'marked', msOnItem: 0, mark: 'know',
      at: at(0), createdAt: at(0) });
    expect(exported.studyEvents[total - 1].at).toBe(at(total - 1));
    expect(exported.dropped).toEqual([]);
    expect(exported.attempts).toHaveLength(1);
    expect(exported.reports).toHaveLength(1);
    expect(exported.profile).toEqual({ displayName: 'Sample', createdAt: when });

    const files = exportCsvBlobs(result.data);
    const lines = (await files.find(file => file.fileName === 'studyEvents.csv')!.blob.text()).split('\r\n');
    expect(lines).toHaveLength(total + 2);
    expect(lines[0]).toBe('itemId,itemVersionId,kind,msOnItem,mark,at,createdAt');
    expect(lines[total]).toBe([itemId, versionId, 'answered', total - 1, '', at(total - 1), at(total - 1)].join(','));
    expect(await files.find(file => file.fileName === 'attempts.csv')!.blob.text()).toContain(versionId);
  }, 120_000);
});
