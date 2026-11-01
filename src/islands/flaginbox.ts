/**
 * Flag inbox model for /admin (ROADMAP Task 2, D-34).
 * Pure logic: no page, no network, no database.
 *
 * PR #110 (database step 5) had not merged when this was written, so the row shape uses the
 * fallback declared in the task spec: { id, page, item_id, item_version, reason, comment,
 * created_at, handled_at }. When #110 merges, update the type to match the migration's columns
 * (item_version_id uuid, user_id uuid, status 'open'|'handled').
 *
 * Comments are never turned into HTML here; callers render them as plain text.
 */
import { REASONS, type Reason } from './flag';

/** A stored flag record (fallback shape — see module note above). */
export interface FlagRow {
  id: string;
  page: string;
  item_id: string | null;
  item_version: number | null;
  reason: Reason;
  /** Plain text, or null when the student left the field empty. */
  comment: string | null;
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
    const want = filter.handled;
    result = result.filter((f) => (f.handled_at !== null) === want);
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
  item_version: number | null;
  flags: FlagRow[];
  /** E.g. "3 reports, 2 not handled". */
  summary: string;
}

/** Groups reports by (item_id, item_version). Items with no item come last, in the order first seen. */
export function groupByItem(flags: FlagRow[]): ItemGroup[] {
  const order: string[] = [];
  const map = new Map<string, FlagRow[]>();
  for (const flag of flags) {
    const key = `${flag.item_id ?? ''}::${String(flag.item_version ?? '')}`;
    if (!map.has(key)) {
      order.push(key);
      map.set(key, []);
    }
    map.get(key)!.push(flag);
  }
  return order.map((key) => {
    const group = map.get(key)!;
    const total = group.length;
    const open = group.filter((f) => f.handled_at === null).length;
    const totalStr = total === 1 ? '1 report' : `${total} reports`;
    const openStr = open === 1 ? '1 not handled' : `${open} not handled`;
    return {
      item_id: group[0]!.item_id,
      item_version: group[0]!.item_version,
      flags: group,
      summary: `${totalStr}, ${openStr}`,
    };
  });
}

/** Returns a new flag row marked handled at `when`. Never mutates the input. */
export function markHandled(flag: FlagRow, when: string): FlagRow {
  return { ...flag, handled_at: when };
}

export { REASONS };
