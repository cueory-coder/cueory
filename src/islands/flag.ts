/** Report validation only. Sending, account checks and rate limits belong to the server. */
export const REASONS = ['wrong-fact', 'typo', 'confusing', 'broken', 'other'] as const;
export type Reason = typeof REASONS[number];
export interface FlagReport {
  page: string;
  itemId?: string;
  itemVersion?: number;
  reason: Reason;
  comment: string;
}
export interface FlagProblem { field: keyof FlagReport; message: string }
export type CheckedReport = { ok: true; report: FlagReport } | { ok: false; problems: FlagProblem[] };

const words: Record<Reason, string> = {
  'wrong-fact': 'a wrong fact', typo: 'a typo', confusing: 'something confusing',
  broken: 'something broken', other: 'something else',
};
export function reasonInWords(reason: Reason): string { return words[reason]; }

function cleanComment(comment: string): string {
  return comment.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, '').trim();
}
export function charactersLeft(comment: string): number {
  return Math.max(0, 1_000 - [...cleanComment(comment)].length);
}

export function checkReport(input: unknown): CheckedReport {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, problems: [{ field: 'page', message: 'the report needs this page’s address.' }] };
  }
  const { page, itemId, itemVersion, reason, comment } = input as Record<string, unknown>;
  const problems: FlagProblem[] = [];
  if (typeof page !== 'string' || page.length > 200 || !/^\/[a-z0-9/_.-]*$/i.test(page) || page.includes('//') || page.includes('..')) {
    problems.push({ field: 'page', message: 'use a path on this site, up to 200 characters, without a query, fragment or doubled slashes or dots.' });
  }
  if (itemId !== undefined && (typeof itemId !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(itemId))) {
    problems.push({ field: 'itemId', message: 'use an item id of 1 to 80 letters, numbers, hyphens or underscores.' });
  }
  if (itemVersion !== undefined && (typeof itemVersion !== 'number' || !Number.isSafeInteger(itemVersion) || itemVersion < 1)) {
    problems.push({ field: 'itemVersion', message: 'use a whole item version of 1 or more.' });
  }
  if (typeof reason !== 'string' || !REASONS.includes(reason as Reason)) {
    problems.push({ field: 'reason', message: 'choose what is wrong.' });
  }
  const cleaned = typeof comment === 'string' ? cleanComment(comment) : '';
  if (typeof comment !== 'string') problems.push({ field: 'comment', message: 'write the comment as text.' });
  else if ([...cleaned].length > 1_000) problems.push({ field: 'comment', message: 'keep the comment to 1,000 characters or fewer.' });
  else if (reason === 'other' && !cleaned) problems.push({ field: 'comment', message: 'add a comment for something else.' });
  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    report: {
      page: page as string,
      ...(itemId === undefined ? {} : { itemId: itemId as string }),
      ...(itemVersion === undefined ? {} : { itemVersion: itemVersion as number }),
      reason: reason as Reason, comment: cleaned,
    },
  };
}
