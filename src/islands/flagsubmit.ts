/**
 * Converts a validated FlagReport and page context into the exact arguments for the
 * database's submit_flag function (D-34, D-73). Pure logic; no network or DOM access.
 */
import { type CheckedReport } from './flag';

export interface FlagContext {
  page: string;
}

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
 * A valid page path starts with `/`, contains no scheme and no `//`, and is ≤ 300 chars
 * after stripping.
 */
function normalizePage(raw: string): string | null {
  // Reject any scheme (e.g. javascript:, https://, //)
  if (raw.includes('://')) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//')) return null;

  // Strip query string and hash
  const queryAt = raw.indexOf('?');
  const hashAt = raw.indexOf('#');
  let end = raw.length;
  if (queryAt !== -1) end = Math.min(end, queryAt);
  if (hashAt !== -1) end = Math.min(end, hashAt);
  const path = raw.slice(0, end) || '/';

  if (path.length > 300) return null;
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
