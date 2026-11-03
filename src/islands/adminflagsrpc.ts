/**
 * Typed calls to the admin flag-inbox functions (Task 65) for the /admin/flags page (Task 66).
 *
 * The database decides who is an admin: every function checks `public.is_admin()` (an account in `public.admins`,
 * signed in with two-factor) before it reads or changes anything, and refuses everyone else with error 42501. This
 * file never decides that itself. It only checks what it sends, checks the shape of what comes back, and turns each
 * refusal into one plain sentence. Raw database text is never shown.
 *
 * Function names, argument names and refusal messages are read verbatim from
 * supabase/migrations/20261102153000_admin_flag_rpcs.sql (tests/unit/adminflagsrpc.test.ts keeps them in step).
 * Error codes and HTTP statuses follow PostgREST (https://docs.postgrest.org/en/v14/references/errors.html): 42501 is
 * 403 for a signed-in caller and 401 for a signed-out one.
 */
import { REASONS, type Reason } from './flag';

export const ADMIN_FUNCTIONS = Object.freeze(['admin_list_flags', 'admin_mark_flag_handled', 'admin_reopen_flag'] as const);
export type AdminFunction = typeof ADMIN_FUNCTIONS[number];

/** A Supabase client's `rpc`, e.g. `(fn, args) => supabase.rpc(fn, args)`. Injected, so tests use a fake. */
export type AdminRpc = (fn: AdminFunction, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

export type FlagStatus = 'open' | 'handled';
export const FLAG_STATUSES: readonly FlagStatus[] = Object.freeze(['open', 'handled']);

/** One row of `admin_list_flags`. UUIDs and times arrive as strings. */
export interface AdminFlagRow {
  id: string;
  user_id: string;
  page: string;
  item_id: string | null;
  item_version_id: string | null;
  reason: Reason;
  comment: string | null;
  status: FlagStatus;
  created_at: string;
  handled_at: string | null;
}

/** Where the next page starts: the last row's own `created_at` text (kept as sent, to the microsecond) and id. */
export interface FlagCursor { createdAt: string; id: string }
export interface FlagPage { rows: AdminFlagRow[]; next: FlagCursor | null }

export type AdminProblem = 'refused' | 'not-found' | 'bad-request' | 'failed';
export type AdminResult<T> = { ok: true; value: T } | { ok: false; problem: AdminProblem; message: string };

/** The plain sentence for each problem. `refused` covers signed out, not an admin, and no two-factor alike. */
export const ADMIN_MESSAGES: Readonly<Record<AdminProblem, string>> = Object.freeze({
  refused: 'this page is for the site owner, signed in with two-factor.',
  'not-found': 'that report is no longer there. reload the list.',
  'bad-request': 'the reports could not be loaded. please reload the page.',
  failed: 'something went wrong. please try again.',
});

/** The database's refusal, raised by every admin function before anything else (error 42501). */
export const REFUSAL_MESSAGE = 'only the site owner, signed in with two-factor, can do this';

/** Each literal message the SQL raises, and what it means here. */
const SQL_MESSAGES: Readonly<Record<string, AdminProblem>> = Object.freeze({
  [REFUSAL_MESSAGE]: 'refused',
  'that report was not found': 'not-found',
  'show open or handled reports': 'bad-request',
  'ask for between 1 and 200 reports': 'bad-request',
  'the next page needs the time and the id of the last report': 'bad-request',
});

/**
 * Codes that mean "not allowed": 42501 (insufficient_privilege: our refusal, or a signed-out caller with no execute
 * grant), 28000 (invalid authorization), and PostgREST's JWT errors PGRST301 and PGRST302.
 */
const REFUSAL_CODES = new Set(['42501', '28000', 'PGRST301', 'PGRST302']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;
// The shape the flags table allows for `page` (flags_page_shape).
const PAGE = /^\/[A-Za-z0-9._~/%:@!$&'()*+,;=-]*$/;
export const MAX_ROWS = 200;
export const DEFAULT_ROWS = 100;

const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const isTime = (v: unknown): v is string => typeof v === 'string' && TIME.test(v) && !Number.isNaN(Date.parse(v));
const isPage = (v: unknown): v is string =>
  typeof v === 'string' && v.length >= 1 && v.length <= 200 && PAGE.test(v) && !v.startsWith('//');
const plain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

const fail = (problem: AdminProblem): { ok: false; problem: AdminProblem; message: string } =>
  ({ ok: false, problem, message: ADMIN_MESSAGES[problem] });

/** What an RPC error means. Unknown errors are `failed`, never `refused` or a raw message. */
export function adminProblem(error: unknown): AdminProblem {
  if (!plain(error)) return 'failed';
  const { message, code, status } = error;
  if (typeof message === 'string' && Object.hasOwn(SQL_MESSAGES, message)) return SQL_MESSAGES[message]!;
  if (typeof code === 'string' && REFUSAL_CODES.has(code)) return 'refused';
  if (status === 401 || status === 403) return 'refused';
  return 'failed';
}

/** One row, checked field by field against the table's own rules, or null. */
export function parseAdminFlagRow(input: unknown): AdminFlagRow | null {
  if (!plain(input)) return null;
  const { id, user_id, page, reason, status, created_at } = input;
  const item_id = input.item_id ?? null;
  const item_version_id = input.item_version_id ?? null;
  const comment = input.comment ?? null;
  const handled_at = input.handled_at ?? null;
  if (!isUuid(id) || !isUuid(user_id) || !isPage(page)) return null;
  if ((item_id !== null && !isUuid(item_id)) || (item_version_id !== null && !isUuid(item_version_id))) return null;
  if ((item_id === null) !== (item_version_id === null)) return null;
  if (typeof reason !== 'string' || !(REASONS as readonly string[]).includes(reason)) return null;
  if (comment !== null && (typeof comment !== 'string' || comment.length < 1 || [...comment].length > 1000)) return null;
  if (status !== 'open' && status !== 'handled') return null;
  if (!isTime(created_at) || (handled_at !== null && !isTime(handled_at))) return null;
  if ((status === 'handled') !== (handled_at !== null)) return null;
  return { id, user_id, page, item_id, item_version_id, reason: reason as Reason, comment, status, created_at, handled_at };
}

async function call(rpc: AdminRpc, fn: AdminFunction, args: Record<string, unknown>): Promise<AdminResult<unknown>> {
  try {
    const reply = await rpc(fn, args);
    if (!plain(reply)) return fail('failed');
    if (reply.error != null) return fail(adminProblem(reply.error));
    return { ok: true, value: reply.data };
  } catch {
    return fail('failed');
  }
}

export interface ListOptions {
  /** 1 to 200; 100 if left out. */
  limit?: number;
  /** The `next` of the page before. */
  after?: FlagCursor | null;
}

/** One page of reports with this status, newest first. `next` is set when the page came back full. */
export async function listFlags(rpc: AdminRpc, status: FlagStatus, options: ListOptions = {}): Promise<AdminResult<FlagPage>> {
  const limit = options.limit ?? DEFAULT_ROWS;
  const after = options.after ?? null;
  if (!(FLAG_STATUSES as readonly unknown[]).includes(status)) return fail('bad-request');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_ROWS) return fail('bad-request');
  if (after !== null && (!plain(after) || !isTime(after.createdAt) || !isUuid(after.id))) return fail('bad-request');

  const result = await call(rpc, 'admin_list_flags', {
    flag_status: status,
    max_rows: limit,
    before_created_at: after?.createdAt ?? null,
    before_id: after?.id ?? null,
  });
  if (!result.ok) return result;
  if (!Array.isArray(result.value) || result.value.length > limit) return fail('failed');
  const rows: AdminFlagRow[] = [];
  for (const item of result.value) {
    const row = parseAdminFlagRow(item);
    // A row of another status, or one the table could not hold, means the reply is not to be trusted.
    if (!row || row.status !== status) return fail('failed');
    rows.push(row);
  }
  const last = rows[rows.length - 1];
  const next = rows.length === limit && last ? { createdAt: last.created_at, id: last.id } : null;
  return { ok: true, value: { rows, next } };
}

/** Marks one report handled. The value is the stored handled time (the first one, if it was already handled). */
export async function markFlagHandled(rpc: AdminRpc, flagId: string): Promise<AdminResult<{ handledAt: string }>> {
  if (!isUuid(flagId)) return fail('bad-request');
  const result = await call(rpc, 'admin_mark_flag_handled', { flag_id: flagId });
  if (!result.ok) return result;
  return isTime(result.value) ? { ok: true, value: { handledAt: result.value } } : fail('failed');
}

/** Puts one handled report back in the open list. */
export async function reopenFlag(rpc: AdminRpc, flagId: string): Promise<AdminResult<null>> {
  if (!isUuid(flagId)) return fail('bad-request');
  const result = await call(rpc, 'admin_reopen_flag', { flag_id: flagId });
  if (!result.ok) return result;
  // A function returning void comes back as null (or nothing).
  return result.value == null ? { ok: true, value: null } : fail('failed');
}

/** Every report with this status, page by page, up to `maxRows` (2,000 by default). Stops at the first problem. */
export async function listAllFlags(
  rpc: AdminRpc, status: FlagStatus, maxRows = 2000,
): Promise<AdminResult<{ rows: AdminFlagRow[]; complete: boolean }>> {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) return fail('bad-request');
  const rows: AdminFlagRow[] = [];
  let after: FlagCursor | null = null;
  while (rows.length < maxRows) {
    const page: AdminResult<FlagPage> = await listFlags(rpc, status, { limit: Math.min(MAX_ROWS, maxRows - rows.length), after });
    if (!page.ok) return page;
    rows.push(...page.value.rows);
    after = page.value.next;
    if (!after) return { ok: true, value: { rows, complete: true } };
  }
  return { ok: true, value: { rows, complete: false } };
}

/**
 * The adapter the /admin/flags page takes (`AdminFlagsAdapter` in adminflags.ts), built over these calls:
 * `inboxAdapter((fn, args) => supabase.rpc(fn, args))` (Task 305). Typed here by shape, so this file doesn't depend
 * on the page's.
 */
export type InboxOutcome = { kind: 'ok'; value: unknown } | { kind: 'refused' } | { kind: 'failed' };
export interface InboxAdapter {
  loadFlags(status: FlagStatus): Promise<InboxOutcome>;
  markHandled(flagId: string): Promise<InboxOutcome>;
  reopen(flagId: string): Promise<InboxOutcome>;
}

export function inboxAdapter(rpc: AdminRpc, maxRows = 2000): InboxAdapter {
  const outcome = <T>(result: AdminResult<T>, value: (v: T) => unknown): InboxOutcome =>
    result.ok ? { kind: 'ok', value: value(result.value) } : result.problem === 'refused' ? { kind: 'refused' } : { kind: 'failed' };
  return {
    loadFlags: async (status) => outcome(await listAllFlags(rpc, status, maxRows), (v) => v.rows),
    markHandled: async (flagId) => outcome(await markFlagHandled(rpc, flagId), (v) => v.handledAt),
    reopen: async (flagId) => outcome(await reopenFlag(rpc, flagId), () => null),
  };
}
