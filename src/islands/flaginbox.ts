/**
 * Flag inbox model for /admin (ROADMAP Task 2, D-34).
 * Pure logic: no page, no network, no database.
 *
 * Rows follow public.flags in 20261101120000_flags_and_submit_flag.sql. The database checks that
 * status is handled exactly when handled_at is present; this helper receives those stored rows.
 *
 * Comments are never turned into HTML here; callers render them as plain text.
 */
import { REASONS, type Reason } from './flag';

/** A stored public.flags row. UUID and timestamptz values arrive as strings. */
export interface FlagRow {
  id: string;
  user_id: string;
  page: string;
  item_id: string | null;
  item_version_id: string | null;
  reason: Reason;
  /** Plain text, or null when the student left the field empty. */
  comment: string | null;
  status: 'open' | 'handled';
  /** ISO 8601 timestamp. */
  created_at: string;
  /** ISO 8601 timestamp when marked handled, or null if still open. */
  handled_at: string | null;
}

export interface InboxFilter {
  /** true = handled only; false = open only; omit for all. */
  handled?: boolean;
  reason?: Reason;
  /** Exact page path match. */
  page?: string;
}

/** Reports matching the filter, newest first. Never mutates the input array or its rows. */
export function inbox(flags: FlagRow[], filter?: InboxFilter): FlagRow[] {
  let result = flags;
  if (filter?.handled !== undefined) {
    const want = filter.handled ? 'handled' : 'open';
    result = result.filter((f) => f.status === want);
  }
  if (filter?.reason !== undefined) {
    const want = filter.reason;
    result = result.filter((f) => f.reason === want);
  }
  if (filter?.page !== undefined) {
    const want = filter.page;
    result = result.filter((f) => f.page === want);
  }
  return result.slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** Flags grouped under one item and version, with a plain-language summary. */
export interface ItemGroup {
  item_id: string | null;
  item_version_id: string | null;
  flags: FlagRow[];
  /** E.g. "3 reports, 2 not handled". */
  summary: string;
}

/** Groups reports by (item_id, item_version_id), including itemless reports, in first-appearance order. */
export function groupByItem(flags: FlagRow[]): ItemGroup[] {
  const order: string[] = [];
  const map = new Map<string, FlagRow[]>();
  for (const flag of flags) {
    const key = `${flag.item_id ?? ''}::${flag.item_version_id ?? ''}`;
    if (!map.has(key)) {
      order.push(key);
      map.set(key, []);
    }
    map.get(key)!.push(flag);
  }
  return order.map((key) => {
    const group = map.get(key)!;
    const total = group.length;
    const open = group.filter((f) => f.status === 'open').length;
    const totalStr = total === 1 ? '1 report' : `${total} reports`;
    const openStr = open === 1 ? '1 not handled' : `${open} not handled`;
    return {
      item_id: group[0]!.item_id,
      item_version_id: group[0]!.item_version_id,
      flags: group,
      summary: `${totalStr}, ${openStr}`,
    };
  });
}

/** Marks a row handled at the supplied ISO timestamp, keeping status and date paired as the table requires. */
export function markHandled(flag: FlagRow, when: string): FlagRow {
  return { ...flag, status: 'handled', handled_at: when };
}

export { REASONS };
