import { describe, expect, it } from 'vitest';
import { exportJson } from '../../src/islands/exportdata';
import { fromSupabase, loadExport, type ExportReader, type ExportTable, type SupabaseExportClient } from '../../src/islands/exportload';

const when = '2026-11-01T08:00:00.000Z';
const versionId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const reportId = '33333333-3333-4333-8333-333333333333';
const id = (n: number) => n.toString(16).padStart(8, '0') + '-0000-4000-8000-000000000000';
const fields = {
  profiles: 'display_name,created_at',
  attempts: 'id,item_version_id,picked,correct,created_at',
  exam_plans: 'id,course,exam_date,created_at',
  review_state: 'item_id,level,last_reviewed,next_review',
  study_events: 'id,item_id,item_version_id,kind,ms_on_item,mark,at,created_at',
} as const;
const rows = {
  profiles: [{ display_name: 'Sample', created_at: when, user_id: 'private' }],
  attempts: [{ id: id(1), item_version_id: versionId, picked: ['a', 'c'], correct: true, created_at: when, user_id: 'private' }],
  exam_plans: [{ id: id(2), course: 'med-surg-1', exam_date: '2026-12-15', created_at: when }],
  review_state: [{ item_id: itemId, level: 2, last_reviewed: '2026-10-30', next_review: '2026-11-03', user_id: 'private' }],
  study_events: [
    { id: id(3), item_id: itemId, item_version_id: versionId, kind: 'marked', ms_on_item: 4200, mark: 'learning',
      at: '2026-11-01T07:59:58.5+00:00', created_at: when, user_id: 'private' },
    { id: id(4), item_id: itemId, item_version_id: versionId, kind: 'answered', ms_on_item: 0, mark: null,
      at: when, created_at: when, user_id: 'private' },
  ],
  my_flags: [{ id: reportId, page: '/learn/study-skills', item_id: null, item_version_id: null,
    reason: 'confusing', comment: 'Sample report', created_at: when, status: 'private' }],
};
type Table = keyof typeof fields;
type Source = Table | 'my_flags';
type Reply = { data: unknown; error: unknown };
const failed = { ok: false, message: "we couldn't load all your saved data. please try again." };

function reader(overrides: Partial<Record<Source, Reply | Error>> = {}) {
  const calls: string[] = [];
  const fetch = (table: Source) => {
    if (overrides[table] instanceof Error) throw overrides[table];
    return overrides[table] ?? { data: rows[table], error: null };
  };
  const db: ExportReader = {
    async select(table, columns) { calls.push(table + ':' + columns); return fetch(table) as Reply; },
    async rpc(name) { calls.push('rpc:' + name); return fetch(name) as Reply; },
  };
  return { db, calls };
}

describe('loadExport — personal data boundaries', () => {
  it('maps the five owned tables and my_flags with no extra fields or lost records', async () => {
    const { db, calls } = reader();
    const result = await loadExport(db);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      profile: { displayName: 'Sample', createdAt: when },
      attempts: [{ itemVersionId: versionId, picked: ['a', 'c'], correct: true, createdAt: when }],
      examPlans: [{ course: 'med-surg-1', examDate: '2026-12-15', createdAt: when }],
      reviewRows: [{ itemId, level: 2, lastReviewed: '2026-10-30', nextReview: '2026-11-03' }],
      reports: [{ id: reportId, page: '/learn/study-skills', itemId: null, itemVersionId: null,
        reason: 'confusing', comment: 'Sample report', createdAt: when }],
      studyEvents: [
        { itemId, itemVersionId: versionId, kind: 'marked', msOnItem: 4200, mark: 'learning',
          at: '2026-11-01T07:59:58.5+00:00', createdAt: when },
        { itemId, itemVersionId: versionId, kind: 'answered', msOnItem: 0, mark: null, at: when, createdAt: when },
      ],
    });
    const exported = JSON.parse(exportJson(result.data, when));
    expect(exported.dropped).toEqual([]);
    expect(exported.attempts).toEqual(result.data.attempts);
    expect(exported.reports).toEqual(result.data.reports);
    expect(exported.studyEvents.map((row: { at: string }) => row.at)).toEqual(['2026-11-01T07:59:58.500Z', when]);
    expect(JSON.stringify(result.data)).not.toContain('private');
    expect(calls).toEqual([
      'profiles:' + fields.profiles, 'attempts:' + fields.attempts,
      'exam_plans:' + fields.exam_plans, 'review_state:' + fields.review_state,
      'study_events:' + fields.study_events, 'rpc:my_flags',
    ]);
  });

  it('has empty sections when the account has no rows, without inventing email', async () => {
    const overrides = Object.fromEntries(Object.keys(rows).map(key => [key, { data: [], error: null }]));
    expect(await loadExport(reader(overrides).db)).toEqual({
      ok: true, data: { profile: {}, attempts: [], examPlans: [], reviewRows: [], reports: [], studyEvents: [] },
    });
  });

  it.each(['profiles', 'attempts', 'exam_plans', 'review_state', 'study_events', 'my_flags'] as const)(
    'fails closed on a %s refusal without returning any personal data', async table => {
      const response = { data: rows[table], error: { message: 'private SQL error' } };
      expect(await loadExport(reader({ [table]: response }).db)).toEqual(failed);
    },
  );

  it('fails closed on network errors, missing rows and duplicate profiles', async () => {
    expect(await loadExport(reader({ attempts: new Error('private key') }).db)).toEqual(failed);
    expect(await loadExport(reader({ my_flags: { data: null, error: null } }).db)).toEqual(failed);
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
  ] as const)('does not silently drop invalid %s records', async (table, record) => {
    expect(await loadExport(reader({ [table]: { data: [record], error: null } }).db)).toEqual(failed);
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
    rpc: (name: 'my_flags') => query(name),
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
    expect(result.data.studyEvents).toHaveLength(501);
    expect(calls.filter(x => x.startsWith('study_events:'))).toEqual([
      'study_events:0-499:id',
      'study_events:0-499:id.gt(' + id(509) + ')',
    ]);
  });

  it('refuses to silently truncate an oversized exam-plan result', async () => {
    const source = { ...rows, exam_plans: Array(11).fill(rows.exam_plans[0]) };
    expect(await loadExport(fromSupabase(supabase(source).client))).toEqual(failed);
  });
});
