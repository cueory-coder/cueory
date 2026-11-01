import { describe, expect, it } from 'vitest';
import { exportJson } from '../../src/islands/exportdata';
import { fromSupabase, loadExport, type ExportReader, type ExportTable, type SupabaseExportClient } from '../../src/islands/exportload';

const when = '2026-11-01T08:00:00.000Z';
const versionId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const reportId = '33333333-3333-4333-8333-333333333333';
const fields = {
  profiles: 'display_name,created_at',
  attempts: 'item_version_id,picked,correct,created_at',
  exam_plans: 'course,exam_date,created_at',
  review_state: 'item_id,level,last_reviewed,next_review',
} as const;
const rows = {
  profiles: [{ display_name: 'Sample', created_at: when, user_id: 'private' }],
  attempts: [{ item_version_id: versionId, picked: ['a', 'c'], correct: true, created_at: when, user_id: 'private' }],
  exam_plans: [{ course: 'med-surg-1', exam_date: '2026-12-15', created_at: when, id: 'private' }],
  review_state: [{ item_id: itemId, level: 2, last_reviewed: '2026-10-30', next_review: '2026-11-03', user_id: 'private' }],
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
  it('maps the four owned tables and my_flags with no extra fields or lost records', async () => {
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
    });
    const exported = JSON.parse(exportJson(result.data, when));
    expect(exported.dropped).toEqual([]);
    expect(exported.attempts).toEqual(result.data.attempts);
    expect(exported.reports).toEqual(result.data.reports);
    expect(JSON.stringify(result.data)).not.toContain('private');
    expect(calls).toEqual([
      'profiles:' + fields.profiles, 'attempts:' + fields.attempts,
      'exam_plans:' + fields.exam_plans, 'review_state:' + fields.review_state, 'rpc:my_flags',
    ]);
  });

  it('has empty sections when the account has no rows, without inventing email', async () => {
    const overrides = Object.fromEntries(Object.keys(rows).map(key => [key, { data: [], error: null }]));
    expect(await loadExport(reader(overrides).db)).toEqual({
      ok: true, data: { profile: {}, attempts: [], examPlans: [], reviewRows: [], reports: [] },
    });
  });

  it.each(['profiles', 'attempts', 'exam_plans', 'review_state', 'my_flags'] as const)(
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

function supabase(dataset: Record<string, unknown[]>, failure?: { name: string; offset: number }) {
  const calls: string[] = [];
  const query = (name: string) => {
    const sort: string[] = [];
    const q = {
      order(column: string, options: { ascending: boolean }) {
        sort.push(column + (options.ascending ? '.asc' : '.desc')); return q;
      },
      async range(from: number, to: number): Promise<Reply> {
        calls.push(name + ':' + from + '-' + to + ':' + sort.join(','));
        if (failure?.name === name && failure.offset === from) return { data: null, error: 'private' };
        return { data: (dataset[name] ?? []).slice(from, to + 1), error: null };
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
    const many = { ...rows, attempts: Array(1002).fill(rows.attempts[0]),
      my_flags: Array(501).fill(rows.my_flags[0]) };
    const { client, calls } = supabase(many);
    const result = await loadExport(fromSupabase(client));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.attempts).toHaveLength(1002);
    expect(result.data.reports).toHaveLength(501);
    expect(calls.filter(x => x.startsWith('attempts:'))).toEqual([
      'attempts:0-499:created_at.desc,id.asc',
      'attempts:500-999:created_at.desc,id.asc',
      'attempts:1000-1499:created_at.desc,id.asc',
    ]);
    expect(calls.some(x => x.startsWith('flags:'))).toBe(false);
  });

  it('fails the whole export when a later page is unavailable', async () => {
    const source = { ...rows, attempts: Array(501).fill(rows.attempts[0]) };
    expect(await loadExport(fromSupabase(supabase(source, { name: 'attempts', offset: 500 }).client))).toEqual(failed);
  });

  it('refuses to silently truncate an oversized exam-plan result', async () => {
    const source = { ...rows, exam_plans: Array(11).fill(rows.exam_plans[0]) };
    expect(await loadExport(fromSupabase(supabase(source).client))).toEqual(failed);
  });
});
