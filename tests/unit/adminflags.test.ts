import { describe, expect, it, vi } from 'vitest';
import {
  REFUSAL_SENTENCE,
  UNWIRED_ADAPTER,
  formatWhen,
  groupLabel,
  handledTime,
  isSitePath,
  loadView,
  makeMarker,
  makeMemoryAdapter,
  makeReopener,
  parseFlagRow,
  parseFlagRows,
  withHandled,
  withReopened,
  type AdminFlagsAdapter,
  type FlagRow,
} from '../../src/islands/adminflags';
import { groupByItem } from '../../src/islands/flaginbox';
import { cacheable } from '../../src/scripts/offlineplan';
import { strategyFor } from '../../src/scripts/swlogic';

// Made-up ids and rows: not real questions, students or comments.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = (n: number, over: Partial<FlagRow> = {}): FlagRow => ({
  id: id(n),
  user_id: id(900),
  page: '/learn/study-skills/questions',
  item_id: id(100),
  item_version_id: id(200),
  reason: 'typo',
  comment: `sample comment ${n}`,
  status: 'open',
  created_at: `2026-11-01T0${n}:00:00Z`,
  handled_at: null,
  ...over,
});

describe('the refusal', () => {
  it('is one sentence, in the lowercase brand voice', () => {
    expect(REFUSAL_SENTENCE).toBe('this page is for the site owner.');
  });

  it('is what the unwired adapter gives for both calls', async () => {
    expect(await loadView(UNWIRED_ADAPTER, 'open')).toEqual({ kind: 'refused' });
    expect(await loadView(UNWIRED_ADAPTER, 'handled')).toEqual({ kind: 'refused' });
    expect(await makeMarker(UNWIRED_ADAPTER)(id(1))).toEqual({ kind: 'refused' });
  });

  it('carries no rows or counts', async () => {
    const view = await loadView({ loadFlags: async () => ({ kind: 'refused' }), markHandled: async () => ({ kind: 'refused' }), reopen: UNWIRED_ADAPTER.reopen }, 'open');
    expect(Object.keys(view)).toEqual(['kind']);
  });
});

describe('checking rows from the database', () => {
  it('accepts a stored row as it is', () => {
    expect(parseFlagRow(row(1))).toEqual(row(1));
    expect(parseFlagRow(row(2, { item_id: null, item_version_id: null, comment: null }))).toEqual(
      row(2, { item_id: null, item_version_id: null, comment: null }),
    );
    expect(parseFlagRow(row(3, { status: 'handled', handled_at: '2026-11-02T00:00:00Z' }))).not.toBeNull();
  });

  it.each([
    ['a missing id', { id: undefined }],
    ['a made-up reason', { reason: 'spam' }],
    ['a made-up status', { status: 'deleted' }],
    ['a page on another site', { page: '//elsewhere.example/x' }],
    ['a page that is a full address', { page: 'https://elsewhere.example/' }],
    ['a script address', { page: 'javascript:alert(1)' }],
    ['a comment that is not text', { comment: 42 }],
    ['handled without a time', { status: 'handled', handled_at: null }],
    ['open with a handled time', { handled_at: '2026-11-02T00:00:00Z' }],
    ['a created time that is not a time', { created_at: 'yesterday-ish' }],
    ['an item id that is not a uuid', { item_id: 'q1' }],
  ])('refuses %s', (_name, over) => {
    expect(parseFlagRow({ ...row(1), ...over })).toBeNull();
  });

  it('refuses the whole list if it is not a list or any row is off', () => {
    expect(parseFlagRows(null)).toBeNull();
    expect(parseFlagRows({ rows: [] })).toBeNull();
    expect(parseFlagRows([row(1), { ...row(2), reason: 'spam' }])).toBeNull();
    expect(parseFlagRows([])).toEqual([]);
  });

  it('keeps a comment that looks like HTML exactly as written, to be shown as text', () => {
    const html = '<img src=x onerror=alert(1)><b>bold</b>';
    expect(parseFlagRow(row(1, { comment: html }))?.comment).toBe(html);
  });

  it('knows which pages are on this site', () => {
    expect(isSitePath('/play')).toBe(true);
    expect(isSitePath('//evil.example')).toBe(false);
    expect(isSitePath('/x\\y')).toBe(false);
    expect(isSitePath('play')).toBe(false);
  });
});

describe('loading one filter', () => {
  const rows = [row(1), row(2, { status: 'handled', handled_at: '2026-11-02T00:00:00Z' }), row(3)];
  const adapter = makeMemoryAdapter(rows);

  it('shows only open reports, newest first', async () => {
    const view = await loadView(adapter, 'open');
    expect(view.kind === 'ok' && view.rows.map((r) => r.id)).toEqual([id(3), id(1)]);
  });

  it('shows only handled reports', async () => {
    const view = await loadView(adapter, 'handled');
    expect(view.kind === 'ok' && view.rows.map((r) => r.id)).toEqual([id(2)]);
  });

  it('keeps to the filter even if the adapter sends the other kind too', async () => {
    const leaky: AdminFlagsAdapter = { loadFlags: async () => ({ kind: 'ok', value: rows }), markHandled: async () => ({ kind: 'failed' }), reopen: async () => ({ kind: 'failed' }) };
    const view = await loadView(leaky, 'open');
    expect(view.kind === 'ok' && view.rows.every((r) => r.status === 'open')).toBe(true);
  });

  it('asks the adapter for the status being shown', async () => {
    const loadFlags = vi.fn(async () => ({ kind: 'ok' as const, value: [] }));
    await loadView({ loadFlags, markHandled: async () => ({ kind: 'failed' }), reopen: async () => ({ kind: 'failed' }) }, 'handled');
    expect(loadFlags).toHaveBeenCalledWith('handled');
  });

  it('treats a thrown error or bad rows as "could not load", never as rows', async () => {
    const throws: AdminFlagsAdapter = { loadFlags: async () => { throw new Error('offline'); }, markHandled: async () => ({ kind: 'failed' }), reopen: async () => ({ kind: 'failed' }) };
    expect(await loadView(throws, 'open')).toEqual({ kind: 'failed' });
    const bad: AdminFlagsAdapter = { loadFlags: async () => ({ kind: 'ok', value: [{ id: 'x' }] }), markHandled: async () => ({ kind: 'failed' }), reopen: async () => ({ kind: 'failed' }) };
    expect(await loadView(bad, 'open')).toEqual({ kind: 'failed' });
  });

  it('groups by question with flaginbox, page reports in their own group', async () => {
    const view = await loadView(makeMemoryAdapter([row(1), row(2, { item_id: null, item_version_id: null }), row(3)]), 'open');
    const groups = view.kind === 'ok' ? groupByItem(view.rows) : [];
    expect(groups.map((g) => [groupLabel(g), g.summary])).toEqual([
      [`question ${id(100)}, version ${id(200)}`, '2 reports, 2 not handled'],
      ['page reports (no question attached)', '1 report, 1 not handled'],
    ]);
  });
});

describe('mark handled', () => {
  it('calls the database once, even when pressed twice quickly', async () => {
    let finish!: (v: { kind: 'ok'; value: unknown }) => void;
    const markHandled = vi.fn(() => new Promise<{ kind: 'ok'; value: unknown }>((resolve) => { finish = resolve; }));
    const mark = makeMarker({ loadFlags: async () => ({ kind: 'refused' }), markHandled, reopen: UNWIRED_ADAPTER.reopen }, () => new Date('2026-11-02T10:00:00Z'));
    const first = mark(id(1));
    const second = mark(id(1));
    finish({ kind: 'ok', value: null });
    expect(await first).toEqual({ kind: 'ok', handledAt: '2026-11-02T10:00:00.000Z' });
    expect(await second).toEqual(await first);
    expect(markHandled).toHaveBeenCalledTimes(1);
    expect(markHandled).toHaveBeenCalledWith(id(1));
  });

  it('allows a new try after a failure', async () => {
    const markHandled = vi.fn(async () => ({ kind: 'failed' as const }));
    const mark = makeMarker({ loadFlags: async () => ({ kind: 'refused' }), markHandled, reopen: UNWIRED_ADAPTER.reopen });
    expect(await mark(id(1))).toEqual({ kind: 'failed' });
    expect(await mark(id(1))).toEqual({ kind: 'failed' });
    expect(markHandled).toHaveBeenCalledTimes(2);
  });

  it('turns a thrown error into a failure and a refusal into a refusal', async () => {
    const throws = makeMarker({ loadFlags: async () => ({ kind: 'refused' }), markHandled: async () => { throw new Error('x'); }, reopen: UNWIRED_ADAPTER.reopen });
    expect(await throws(id(1))).toEqual({ kind: 'failed' });
    expect(await makeMarker(UNWIRED_ADAPTER)(id(1))).toEqual({ kind: 'refused' });
  });

  it('updates just that row, keeping status and time paired', () => {
    const rows = [row(1), row(2)];
    const next = withHandled(rows, id(2), '2026-11-02T10:00:00Z');
    expect(next[0]).toBe(rows[0]);
    expect(next[1]).toEqual({ ...row(2), status: 'handled', handled_at: '2026-11-02T10:00:00Z' });
    expect(rows[1]!.status).toBe('open');
  });

  it("uses the database's own handled time when it sends one", () => {
    const now = () => new Date('2026-11-02T10:00:00Z');
    expect(handledTime('2026-11-02T09:00:00Z', now)).toBe('2026-11-02T09:00:00Z');
    expect(handledTime({ handled_at: '2026-11-02T08:00:00Z' }, now)).toBe('2026-11-02T08:00:00Z');
    expect(handledTime(null, now)).toBe('2026-11-02T10:00:00.000Z');
    expect(handledTime('soon', now)).toBe('2026-11-02T10:00:00.000Z');
  });

  it('the in-browser sample moves a marked row to handled', async () => {
    const adapter = makeMemoryAdapter([row(1)], () => new Date('2026-11-02T10:00:00Z'));
    await makeMarker(adapter)(id(1));
    const handled = await loadView(adapter, 'handled');
    expect(handled.kind === 'ok' && handled.rows.map((r) => [r.id, r.handled_at])).toEqual([[id(1), '2026-11-02T10:00:00.000Z']]);
    expect(await loadView(adapter, 'open')).toEqual({ kind: 'ok', rows: [] });
  });
});

describe('reopen (Task 305)', () => {
  const refuseAll = { loadFlags: async () => ({ kind: 'refused' as const }), markHandled: async () => ({ kind: 'refused' as const }) };

  it('calls the database once, even when pressed twice quickly', async () => {
    let finish!: (v: { kind: 'ok'; value: unknown }) => void;
    const reopen = vi.fn(() => new Promise<{ kind: 'ok'; value: unknown }>((resolve) => { finish = resolve; }));
    const run = makeReopener({ ...refuseAll, reopen });
    const first = run(id(1));
    const second = run(id(1));
    finish({ kind: 'ok', value: null });
    expect(await first).toEqual({ kind: 'ok' });
    expect(await second).toEqual({ kind: 'ok' });
    expect(reopen).toHaveBeenCalledTimes(1);
  });

  it('turns a thrown error into a failure and a refusal into a refusal', async () => {
    expect(await makeReopener({ ...refuseAll, reopen: async () => { throw new Error('x'); } })(id(1))).toEqual({ kind: 'failed' });
    expect(await makeReopener(UNWIRED_ADAPTER)(id(1))).toEqual({ kind: 'refused' });
  });

  it('opens just that row again, with no handled time', () => {
    const rows = [row(1), row(2, { status: 'handled', handled_at: '2026-11-02T10:00:00Z' })];
    const next = withReopened(rows, id(2));
    expect(next[0]).toBe(rows[0]);
    expect(next[1]).toEqual({ ...rows[1], status: 'open', handled_at: null });
    expect(rows[1]!.status).toBe('handled');
  });

  it('the in-browser sample moves a reopened row back to open', async () => {
    const adapter = makeMemoryAdapter([row(1, { status: 'handled', handled_at: '2026-11-02T10:00:00Z' })]);
    expect(await makeReopener(adapter)(id(1))).toEqual({ kind: 'ok' });
    const open = await loadView(adapter, 'open');
    expect(open.kind === 'ok' && open.rows.map((r) => [r.id, r.status, r.handled_at])).toEqual([[id(1), 'open', null]]);
    expect(await makeReopener(adapter)(id(9))).toEqual({ kind: 'failed' });
  });
});

describe('words', () => {
  it('writes times in the given time zone', () => {
    // Some ICU versions put a narrow no-break space before PM.
    expect(formatWhen('2026-11-01T15:00:00Z', 'UTC').replace(/\s/g, ' ')).toBe('Nov 1, 2026, 3:00 PM');
    expect(formatWhen('not a time', 'UTC')).toBe('');
  });

  it('names a question group with only an item', () => {
    expect(groupLabel({ item_id: id(1), item_version_id: null })).toBe(`question ${id(1)}`);
  });
});

describe('/admin/flags is never stored for offline use', () => {
  it.each(['/admin/flags', '/admin/flags/', '/admin/flags?status=handled', '/ADMIN/flags', '/preview/admin-flags'])(
    'the offline policy refuses %s',
    (url) => {
      expect(cacheable(url, 'https://cueory.app')).toBe(false);
      expect(strategyFor({ method: 'GET', url }, 'https://cueory.app')).toBeNull();
    },
  );
});
