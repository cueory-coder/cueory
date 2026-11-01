/**
 * Converts a validated FlagReport and page context into the exact arguments for the
 * database's submit_flag function (D-34, D-73). Pure logic; no network or DOM access.
 */
import { REASONS, type CheckedReport } from './flag';

export interface FlagContext {
  page: string;
}

// item_id and item_version types are provisional: flag.ts treats them as slug/integer
// but the database uses uuids. Decide with whoever writes submit_flag (no migration yet).
export interface FlagArgs {
  page: string;
  item_id: string | null;
  item_version: number | null;
  reason: string;
  comment: string;
}

export type FlagArgumentsResult =
  | { ok: true; args: FlagArgs }
  | { ok: false; message: string };

/**
 * Returns the path with query and hash stripped, or null if the path is invalid.
 * Applies the same rule checkReport uses: starts with /, only [a-z0-9/_.-] (case-insensitive),
 * no //, no .., at most 200 characters after stripping.
 */
function normalizePage(raw: string): string | null {
  const queryAt = raw.indexOf('?');
  const hashAt = raw.indexOf('#');
  let end = raw.length;
  if (queryAt !== -1) end = Math.min(end, queryAt);
  if (hashAt !== -1) end = Math.min(end, hashAt);
  const path = raw.slice(0, end) || '/';

  if (path.length > 200) return null;
  if (!/^\/[a-z0-9/_.-]*$/i.test(path)) return null;
  if (path.includes('//')) return null;
  if (path.includes('..')) return null;
  return path;
}

export function flagArguments(report: CheckedReport, context: FlagContext): FlagArgumentsResult {
  if (!report.ok) {
    return { ok: false, message: 'the report has errors that need fixing before it can be sent' };
  }

  const page = normalizePage(context.page);
  if (page === null) {
    return { ok: false, message: 'the page address is not valid for this site' };
  }

  const { itemId, itemVersion, reason, comment } = report.report;

  // Re-check reason and comment even on a pre-validated report — a hand-built ok:true
  // report could carry an invalid reason or an overlong comment.
  if (!REASONS.includes(reason as typeof REASONS[number])) {
    return { ok: false, message: 'the reason is not recognised' };
  }
  if ([...comment].length > 1_000) {
    return { ok: false, message: 'the comment exceeds the 1,000-character limit' };
  }

  return {
    ok: true,
    args: {
      page,
      item_id: itemId ?? null,
      item_version: itemVersion ?? null,
      reason,
      comment,
    },
  };
}
