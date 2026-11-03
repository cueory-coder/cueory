import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_FUNCTIONS,
  ADMIN_MESSAGES,
  REFUSAL_MESSAGE,
  adminProblem,
  inboxAdapter,
  listAllFlags,
  listFlags,
  markFlagHandled,
  parseAdminFlagRow,
  reopenFlag,
  type AdminFlagRow,
  type AdminFunction,
  type AdminRpc,
} from '../../src/islands/adminflagsrpc';

const sql = readFileSync(
  new URL('../../supabase/migrations/20261102153000_admin_flag_rpcs.sql', import.meta.url), 'utf8',
);

/** The real declaration from the migration, so the browser and the database can't drift apart. */
function declaration(name: AdminFunction) {
  const match = new RegExp(
    `create\\s+function\\s+public\\.${name}\\s*\\(([\\s\\S]*?)\\)\\s*returns([\\s\\S]*?)as\\s*\\$\\$([\\s\\S]*?)\\$\\$;`, 'i',
  ).exec(sql);
  if (!match) throw new Error(`The SQL declaration for ${name} was not found.`);
  const names = (text: string) => text.replace(/--[^\n]*/g, '').split(',')
    .map(part => part.trim().split(/\s+/)[0]!).filter(Boolean);
  const table = /\btable\s*\(([^)]*)\)/i.exec(match[2]!);
  const messages = [...match[3]!.matchAll(/\braise\s+exception\s+'((?:[^']|'')*)'/gi)]
    .map(m => m[1]!.replace(/''/g, "'"));
  if ([...match[3]!.matchAll(/\braise\s+exception\b/gi)].length !== messages.length) {
    throw new Error(`A nonliteral exception in ${name} needs an explicit contract check.`);
  }
  return { arguments: names(match[1]!), columns: table ? names(table[1]!) : [], messages: [...new Set(messages)] };
}

const flagId = '00000000-0000-4000-8000-000000000f01';
const row = (over: Partial<AdminFlagRow> = {}): AdminFlagRow => ({
  id: flagId,
  user_id: '00000000-0000-4000-8000-0000000000a3',
  page: '/learn/sample',
  item_id: null,
  item_version_id: null,
  reason: 'typo',
  comment: 'sample comment',
  status: 'open',
  created_at: '2026-11-02T10:00:00.123456+00:00',
  handled_at: null,
  ...over,
});
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const refusal = { code: '42501', message: REFUSAL_MESSAGE, details: null, hint: null };

/** A fake Supabase rpc that answers each call in turn, never touching the network. */
function fake(...replies: Array<{ data: unknown; error: unknown } | Error>) {
  const queue = [...replies];
  return vi.fn<AdminRpc>(async () => {
    const next = queue.shift();
    if (!next) throw new Error('unexpected call');
    if (next instanceof Error) throw next;
    return next;
  });
}

describe('the SQL contract', () => {
  it('names the three functions and their arguments exactly as the migration does', () => {
    expect([...ADMIN_FUNCTIONS]).toEqual(['admin_list_flags', 'admin_mark_flag_handled', 'admin_reopen_flag']);
    expect(declaration('admin_list_flags').arguments).toEqual(['flag_status', 'max_rows', 'before_created_at', 'before_id']);
    expect(declaration('admin_mark_flag_handled').arguments).toEqual(['flag_id']);
    expect(declaration('admin_reopen_flag').arguments).toEqual(['flag_id']);
  });

  it('reads exactly the columns admin_list_flags returns', () => {
    expect(declaration('admin_list_flags').columns.sort()).toEqual(Object.keys(row()).sort());
  });

  it('every function refuses first with the one refusal message', () => {
    for (const name of ADMIN_FUNCTIONS) expect(declaration(name).messages[0]).toBe(REFUSAL_MESSAGE);
  });

  for (const name of ADMIN_FUNCTIONS) {
    for (const message of declaration(name).messages) {
      it(`${name}: "${message}" has its own plain sentence`, () => {
        const problem = adminProblem({ code: '22023', message });
        // An unmapped message falls back to "failed"; every literal the SQL raises must be mapped on purpose.
        expect(problem).not.toBe('failed');
      });
    }
  }
});

describe('adminProblem', () => {
  it.each([
    [refusal, 'refused'],
    [{ code: '42501', message: 'permission denied for function admin_list_flags' }, 'refused'],
    [{ code: '28000', message: 'x' }, 'refused'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 'refused'],
    [{ status: 401 }, 'refused'],
    [{ status: 403 }, 'refused'],
    [{ code: '22023', message: 'that report was not found' }, 'not-found'],
    [{ code: '22023', message: 'show open or handled reports' }, 'bad-request'],
    [{ code: '22023', message: 'ask for between 1 and 200 reports' }, 'bad-request'],
    [{ code: '22023', message: 'the next page needs the time and the id of the last report' }, 'bad-request'],
    [{ code: '57014', message: 'canceling statement due to statement timeout' }, 'failed'],
    [{ code: 'PGRST202', message: 'Could not find the function' }, 'failed'],
    ['a string', 'failed'],
    [null, 'failed'],
    [{ message: 'toString' }, 'failed'],
  ] as const)('%j is %s', (error, problem) => {
    expect(adminProblem(error)).toBe(problem);
  });

  it('has a lowercase, plain sentence for each problem, never the database text', () => {
    for (const message of Object.values(ADMIN_MESSAGES)) {
      expect(message).toMatch(/^[a-z]/);
      expect(message).not.toMatch(/42501|22023|admin_|flags|sql/i);
    }
  });
});

describe('parseAdminFlagRow', () => {
  it('accepts a stored row, with or without a question and comment', () => {
    expect(parseAdminFlagRow(row())).toEqual(row());
    const withItem = row({ item_id: id(0xe1), item_version_id: id(0xf1), comment: null });
    expect(parseAdminFlagRow(withItem)).toEqual(withItem);
    const handled = row({ status: 'handled', handled_at: '2026-11-02T11:00:00+00:00' });
    expect(parseAdminFlagRow(handled)).toEqual(handled);
  });

  it('drops any extra field', () => {
    expect(parseAdminFlagRow({ ...row(), email: 'someone@example.com' })).toEqual(row());
  });

  it.each([
    ['a bad id', { id: 'nope' }],
    ['a bad user', { user_id: 12 }],
    ['a page on another site', { page: '//evil.example/x' }],
    ['a page with markup', { page: '/<script>' }],
    ['an unknown reason', { reason: 'rude' }],
    ['a comment over 1,000 characters', { comment: 'a'.repeat(1001) }],
    ['an empty comment', { comment: '' }],
    ['an unknown status', { status: 'deleted' }],
    ['a bad time', { created_at: 'yesterday' }],
    ['handled without a time', { status: 'handled' }],
    ['open with a handled time', { handled_at: '2026-11-02T11:00:00Z' }],
  ] as const)('refuses %s', (_label, change) => {
    expect(parseAdminFlagRow({ ...row(), ...change })).toBeNull();
  });

  it('accepts an item whose version was deleted, and a version without its item', () => {
    const noVersion = row({ item_id: id(0xe1), item_version_id: null });
    expect(parseAdminFlagRow(noVersion)).toEqual(noVersion);
    const noItem = row({ item_id: null, item_version_id: id(0xf1) });
    expect(parseAdminFlagRow(noItem)).toEqual(noItem);
  });

  it('refuses things that are not rows', () => {
    for (const value of [null, undefined, 'x', 1, [], [row()]]) expect(parseAdminFlagRow(value)).toBeNull();
  });
});

describe('listFlags', () => {
  it('sends exactly the SQL arguments and returns checked rows', async () => {
    const rpc = fake({ data: [row()], error: null });
    const result = await listFlags(rpc, 'open');
    expect(result).toEqual({ ok: true, value: { rows: [row()], next: null } });
    expect(rpc).toHaveBeenCalledWith('admin_list_flags', {
      flag_status: 'open', max_rows: 100, before_created_at: null, before_id: null,
    });
    expect(Object.keys(rpc.mock.calls[0]![1])).toEqual(declaration('admin_list_flags').arguments);
  });

  it('gives a cursor when the page is full, keeping the time text exactly as sent', async () => {
    const rows = [row({ id: id(2), created_at: '2026-11-02T10:00:02.654321+00:00' }),
      row({ id: id(1), created_at: '2026-11-02T10:00:01.123456+00:00' })];
    const rpc = fake({ data: rows, error: null }, { data: [], error: null });
    const first = await listFlags(rpc, 'open', { limit: 2 });
    expect(first.ok && first.value.next).toEqual({ createdAt: '2026-11-02T10:00:01.123456+00:00', id: id(1) });
    if (!first.ok) throw new Error('expected a page');
    await listFlags(rpc, 'open', { limit: 2, after: first.value.next });
    expect(rpc.mock.calls[1]![1]).toEqual({
      flag_status: 'open', max_rows: 2, before_created_at: '2026-11-02T10:00:01.123456+00:00', before_id: id(1),
    });
  });

  it.each([
    ['an unknown status', 'all', {}],
    ['a limit of 0', 'open', { limit: 0 }],
    ['a limit over 200', 'open', { limit: 201 }],
    ['a fractional limit', 'open', { limit: 1.5 }],
    ['a cursor with a bad id', 'open', { after: { createdAt: '2026-11-02T10:00:00Z', id: 'x' } }],
    ['a cursor with a bad time', 'open', { after: { createdAt: 'later', id: flagId } }],
  ] as const)('refuses %s without calling the database', async (_label, status, options) => {
    const rpc = fake();
    expect(await listFlags(rpc, status as 'open', options as never)).toEqual({
      ok: false, problem: 'bad-request', message: ADMIN_MESSAGES['bad-request'],
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('turns the database refusal into the one plain sentence', async () => {
    expect(await listFlags(fake({ data: null, error: refusal }), 'open')).toEqual({
      ok: false, problem: 'refused', message: 'this page is for the site owner, signed in with two-factor.',
    });
  });

  it.each([
    ['not a list', { not: 'a list' }],
    ['a bad row', [row(), { ...row(), page: 'https://evil.example' }]],
    ['a row of the other status', [row({ status: 'handled', handled_at: '2026-11-02T11:00:00Z' })]],
    ['more rows than asked for', [row({ id: id(1) }), row({ id: id(2) }), row({ id: id(3) })]],
  ])('treats %s as a failure, never showing it', async (_label, data) => {
    const result = await listFlags(fake({ data, error: null }), 'open', { limit: 2 });
    expect(result).toEqual({ ok: false, problem: 'failed', message: ADMIN_MESSAGES.failed });
  });

  it('treats a thrown error or an odd reply as a failure', async () => {
    expect((await listFlags(fake(new Error('network down')), 'open')).ok).toBe(false);
    const odd = vi.fn<AdminRpc>(async () => null as never);
    expect(await listFlags(odd, 'open')).toMatchObject({ ok: false, problem: 'failed' });
  });
});

describe('listAllFlags', () => {
  it('follows the pages until one comes back short', async () => {
    const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => row({ id: id(from - i) }));
    const rpc = fake({ data: page(500, 200), error: null }, { data: page(300, 200), error: null }, { data: page(100, 5), error: null });
    const result = await listAllFlags(rpc, 'open');
    expect(result.ok && result.value.rows.length).toBe(405);
    expect(result.ok && result.value.complete).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc.mock.calls[2]![1]).toMatchObject({ before_id: id(101) });
  });

  it('stops at the cap and says the list is not complete', async () => {
    const full = Array.from({ length: 200 }, (_, i) => row({ id: id(1000 - i) }));
    const rpc = fake({ data: full, error: null }, { data: [row({ id: id(7) })], error: null });
    const result = await listAllFlags(rpc, 'open', 201);
    expect(result).toMatchObject({ ok: true, value: { complete: false } });
    expect(result.ok && result.value.rows.length).toBe(201);
    expect(rpc.mock.calls.map(c => c[1].max_rows)).toEqual([200, 1]);
  });

  it('stops at the first problem', async () => {
    const rpc = fake({ data: Array.from({ length: 200 }, (_, i) => row({ id: id(1000 - i) })), error: null },
      { data: null, error: refusal });
    expect(await listAllFlags(rpc, 'open')).toMatchObject({ ok: false, problem: 'refused' });
  });
});

describe('markFlagHandled and reopenFlag', () => {
  it('marks a report handled and returns the stored time', async () => {
    const rpc = fake({ data: '2026-11-02T12:00:00.5+00:00', error: null });
    expect(await markFlagHandled(rpc, flagId)).toEqual({ ok: true, value: { handledAt: '2026-11-02T12:00:00.5+00:00' } });
    expect(rpc).toHaveBeenCalledWith('admin_mark_flag_handled', { flag_id: flagId });
  });

  it('reopens a report', async () => {
    const rpc = fake({ data: null, error: null });
    expect(await reopenFlag(rpc, flagId)).toEqual({ ok: true, value: null });
    expect(rpc).toHaveBeenCalledWith('admin_reopen_flag', { flag_id: flagId });
  });

  it('refuses a bad id without calling the database', async () => {
    const rpc = fake();
    expect(await markFlagHandled(rpc, 'not-an-id')).toMatchObject({ ok: false, problem: 'bad-request' });
    expect(await reopenFlag(rpc, '')).toMatchObject({ ok: false, problem: 'bad-request' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps a missing report and a refusal to plain sentences', async () => {
    const missing = { code: '22023', message: 'that report was not found' };
    expect(await markFlagHandled(fake({ data: null, error: missing }), flagId)).toEqual({
      ok: false, problem: 'not-found', message: 'that report is no longer there. reload the list.',
    });
    expect(await reopenFlag(fake({ data: null, error: refusal }), flagId)).toMatchObject({ ok: false, problem: 'refused' });
  });

  it('never reports success on a reply it does not expect', async () => {
    expect(await markFlagHandled(fake({ data: true, error: null }), flagId)).toMatchObject({ ok: false, problem: 'failed' });
    expect(await reopenFlag(fake({ data: 'x', error: null }), flagId)).toMatchObject({ ok: false, problem: 'failed' });
  });
});

describe('inboxAdapter (the shape the /admin/flags page takes)', () => {
  it('loads every report of a status and marks one handled', async () => {
    const rpc = fake({ data: [row()], error: null }, { data: '2026-11-02T12:00:00+00:00', error: null });
    const adapter = inboxAdapter(rpc);
    expect(await adapter.loadFlags('open')).toEqual({ kind: 'ok', value: [row()] });
    expect(await adapter.markHandled(flagId)).toEqual({ kind: 'ok', value: '2026-11-02T12:00:00+00:00' });
  });

  it('says so when the list was cut off at the cap, and not otherwise', async () => {
    const full = Array.from({ length: 200 }, (_, i) => row({ id: id(1000 - i) }));
    const capped = await inboxAdapter(fake({ data: full, error: null }), 200).loadFlags('open');
    expect(capped).toMatchObject({ kind: 'ok', complete: false });
    const whole = await inboxAdapter(fake({ data: [row()], error: null })).loadFlags('open');
    expect(whole.kind === 'ok' && whole.complete).toBeUndefined();
  });

  it('turns a refusal into refused and anything else into failed', async () => {
    const adapter = inboxAdapter(fake({ data: null, error: refusal }, { data: null, error: { code: '22023', message: 'that report was not found' } }));
    expect(await adapter.loadFlags('open')).toEqual({ kind: 'refused' });
    expect(await adapter.markHandled(flagId)).toEqual({ kind: 'failed' });
  });
});
