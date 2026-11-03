/**
 * The /admin/flags inbox (Task 66): what the page shows, kept out of the component so it can be unit tested.
 * Pure logic: no page and no database. Reading and marking go through an injected adapter.
 *
 * The `flags` table has no grant for any website role (20261101120000_flags_and_submit_flag.sql), so the only way in
 * is a permission-checked database function (CLAUDE.md rule 1): Task 65's `admin_list_flags`, `admin_mark_flag_handled`
 * and `admin_reopen_flag`, reached through `inboxAdapter` in adminflagsrpc.ts (Task 305). With accounts off the page
 * uses `UNWIRED_ADAPTER`, which refuses everything, so it only ever says it is for the site owner.
 *
 * Rows from the adapter are untrusted: `parseFlagRows` checks every field before anything is shown, and comments are
 * shown as plain text by the component, never as HTML.
 */
import { REASONS, inbox, markHandled, type FlagRow, type ItemGroup } from './flaginbox';
import { reasonInWords, type Reason } from './flag';

/** The one sentence a signed-out visitor, a student, or an admin without two-factor sees. Nothing else is shown. */
export const REFUSAL_SENTENCE = 'this page is for the site owner.';

export type FlagStatus = 'open' | 'handled';
export const STATUSES: readonly FlagStatus[] = ['open', 'handled'];

/** What an adapter call can come back with. `refused` is not an admin, signed out, or no two-factor. */
export type Outcome<T> = { kind: 'ok'; value: T } | { kind: 'refused' } | { kind: 'failed' };

export interface AdminFlagsAdapter {
  /** Every report with this status. The value is checked by `parseFlagRows`. */
  loadFlags(status: FlagStatus): Promise<Outcome<unknown>>;
  /** Marks one report handled. The value may be the stored `handled_at` time; otherwise the page uses its own clock. */
  markHandled(flagId: string): Promise<Outcome<unknown>>;
  /** Puts one handled report back in the open list (Task 305). */
  reopen(flagId: string): Promise<Outcome<unknown>>;
}

/** Refuses everything. The page uses it when accounts are off in this build. */
export const UNWIRED_ADAPTER: AdminFlagsAdapter = Object.freeze({
  loadFlags: async () => ({ kind: 'refused' }) as const,
  markHandled: async () => ({ kind: 'refused' }) as const,
  reopen: async () => ({ kind: 'refused' }) as const,
});

// ------------------------------------------------------------------------------------------------ checking rows

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The same shape the flags table allows for `page` (flags_page_shape).
const PAGE = /^\/[A-Za-z0-9._~/%:@!$&'()*+,;=-]*$/;

const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const isTime = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

/** True for a page path the flags table would have stored: on this site, never `//elsewhere`. */
export function isSitePath(page: unknown): page is string {
  return typeof page === 'string' && page.length >= 1 && page.length <= 200 && PAGE.test(page) && !page.startsWith('//');
}

/** One stored row, checked field by field, or null if anything is off. */
export function parseFlagRow(input: unknown): FlagRow | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const r = input as Record<string, unknown>;
  if (!isUuid(r.id) || !isUuid(r.user_id) || !isSitePath(r.page)) return null;
  const itemId = r.item_id ?? null;
  const versionId = r.item_version_id ?? null;
  if (itemId !== null && !isUuid(itemId)) return null;
  if (versionId !== null && !isUuid(versionId)) return null;
  if (typeof r.reason !== 'string' || !(REASONS as readonly string[]).includes(r.reason)) return null;
  const comment = r.comment ?? null;
  if (comment !== null && (typeof comment !== 'string' || comment.length > 4000)) return null;
  if (r.status !== 'open' && r.status !== 'handled') return null;
  if (!isTime(r.created_at)) return null;
  const handledAt = r.handled_at ?? null;
  if (handledAt !== null && !isTime(handledAt)) return null;
  // The table keeps these paired (flags_handled_when); a row that breaks the pair is not trusted.
  if ((r.status === 'handled') !== (handledAt !== null)) return null;
  return {
    id: r.id,
    user_id: r.user_id,
    page: r.page,
    item_id: itemId,
    item_version_id: versionId,
    reason: r.reason as Reason,
    comment,
    status: r.status,
    created_at: r.created_at,
    handled_at: handledAt,
  };
}

/** Every row checked, or null if the value is not a list or any row is off (shown as "could not load"). */
export function parseFlagRows(input: unknown): FlagRow[] | null {
  if (!Array.isArray(input)) return null;
  const rows: FlagRow[] = [];
  for (const item of input) {
    const row = parseFlagRow(item);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

// --------------------------------------------------------------------------------------------------- the view

export type View = { kind: 'ok'; rows: FlagRow[] } | { kind: 'refused' } | { kind: 'failed' };

/** Loads one status through the adapter. A thrown error is a failure; bad rows are a failure, never shown. */
export async function loadView(adapter: AdminFlagsAdapter, status: FlagStatus): Promise<View> {
  let outcome: Outcome<unknown>;
  try {
    outcome = await adapter.loadFlags(status);
  } catch {
    return { kind: 'failed' };
  }
  if (outcome?.kind === 'refused') return { kind: 'refused' };
  if (outcome?.kind !== 'ok') return { kind: 'failed' };
  const rows = parseFlagRows(outcome.value);
  if (!rows) return { kind: 'failed' };
  // The adapter is asked for one status; `inbox` keeps only that one either way, newest first.
  return { kind: 'ok', rows: inbox(rows, { handled: status === 'handled' }) };
}

/**
 * The rows with one report marked handled at `when`, using flaginbox's `markHandled`. Other rows are untouched. A
 * row marked on this visit stays where it is, now saying "handled", so keyboard focus never lands on nothing;
 * changing the filter loads the list again.
 */
export function withHandled(rows: FlagRow[], flagId: string, when: string): FlagRow[] {
  return rows.map((row) => (row.id === flagId ? markHandled(row, when) : row));
}

/** The rows with one report reopened: open again, with no handled time, staying where it is like a marked row. */
export function withReopened(rows: FlagRow[], flagId: string): FlagRow[] {
  return rows.map((row) => (row.id === flagId ? { ...row, status: 'open', handled_at: null } : row));
}

/** The time to record: the database's own `handled_at` when it sends one back, otherwise `now`. */
export function handledTime(value: unknown, now: () => Date): string {
  if (isTime(value)) return value;
  if (value && typeof value === 'object' && isTime((value as Record<string, unknown>).handled_at)) {
    return (value as Record<string, string>).handled_at;
  }
  return now().toISOString();
}

export type MarkOutcome = { kind: 'ok'; handledAt: string } | { kind: 'refused' } | { kind: 'failed' };

/** One call per report at a time: a second press while the first is still on its way gets the same answer. */
function oncePerReport<T>(action: (flagId: string) => Promise<T>): (flagId: string) => Promise<T> {
  const inFlight = new Map<string, Promise<T>>();
  return (flagId) => {
    const existing = inFlight.get(flagId);
    if (existing) return existing;
    const run = action(flagId).finally(() => inFlight.delete(flagId));
    inFlight.set(flagId, run);
    return run;
  };
}

/** Marks reports handled through the adapter, at most one call per report at a time. */
export function makeMarker(adapter: AdminFlagsAdapter, now: () => Date = () => new Date()) {
  return oncePerReport(async (flagId): Promise<MarkOutcome> => {
    try {
      const outcome = await adapter.markHandled(flagId);
      if (outcome?.kind === 'ok') return { kind: 'ok', handledAt: handledTime(outcome.value, now) };
      return outcome?.kind === 'refused' ? { kind: 'refused' } : { kind: 'failed' };
    } catch {
      return { kind: 'failed' };
    }
  });
}

export type ReopenOutcome = { kind: 'ok' } | { kind: 'refused' } | { kind: 'failed' };

/** Reopens reports through the adapter, at most one call per report at a time. */
export function makeReopener(adapter: AdminFlagsAdapter) {
  return oncePerReport(async (flagId): Promise<ReopenOutcome> => {
    try {
      const outcome = await adapter.reopen(flagId);
      if (outcome?.kind === 'ok') return { kind: 'ok' };
      return outcome?.kind === 'refused' ? { kind: 'refused' } : { kind: 'failed' };
    } catch {
      return { kind: 'failed' };
    }
  });
}

// ------------------------------------------------------------------------------------------------------ words

/** The heading of one group in the table. */
export function groupLabel(group: Pick<ItemGroup, 'item_id' | 'item_version_id'>): string {
  if (!group.item_id) return 'page reports (no question attached)';
  return group.item_version_id
    ? `question ${group.item_id}, version ${group.item_version_id}`
    : `question ${group.item_id}`;
}

/** What the student said was wrong, in words. */
export function reasonLabel(reason: Reason): string {
  return reasonInWords(reason);
}

/** A report's time, written out in the given time zone (the page passes the browser's own). */
export function formatWhen(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

// ------------------------------------------------------------------------------------------- the sample adapter

/**
 * An adapter over rows kept in memory, for the labeled sample on /preview/admin-flags and for tests. It never
 * talks to the database.
 */
export function makeMemoryAdapter(seed: readonly FlagRow[], now: () => Date = () => new Date()): AdminFlagsAdapter {
  let rows = seed.map((row) => ({ ...row }));
  return {
    loadFlags: async (status) => ({ kind: 'ok', value: rows.filter((row) => row.status === status).map((row) => ({ ...row })) }),
    markHandled: async (flagId) => {
      const row = rows.find((r) => r.id === flagId);
      if (!row) return { kind: 'failed' };
      const when = row.handled_at ?? now().toISOString();
      rows = withHandled(rows, flagId, when);
      return { kind: 'ok', value: when };
    },
    reopen: async (flagId) => {
      if (!rows.some((r) => r.id === flagId)) return { kind: 'failed' };
      rows = withReopened(rows, flagId);
      return { kind: 'ok', value: null };
    },
  };
}

export type { FlagRow, ItemGroup };
