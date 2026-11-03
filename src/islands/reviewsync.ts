/**
 * Saves spaced review to the signed-in student's own review_state rows (Task 144, D-87).
 *
 * No Supabase dependency: the page injects the client (or a fake in tests), typed by the few calls used here.
 * Columns follow supabase/migrations/20261101110000_review_state_and_exam_plans.sql exactly:
 *   - read:   item_id, level, last_reviewed, next_review (the student's own rows, row-level security);
 *   - insert: item_id, level, last_reviewed, next_review;
 *   - update: level, last_reviewed, next_review.
 * The user id is never sent: the database fills it in from the signed token.
 *
 * Writes are an update, then an insert when the student has no row yet. PostgREST's upsert puts every sent column,
 * item_id included, in its ON CONFLICT ... DO UPDATE SET list, and students may not update item_id, so an upsert would
 * be refused (PostgREST/postgrest#2446). Update-then-insert sends only granted columns in each request.
 *
 * Only published questions (uuid ids) are saved. Sample decks use plain ids and stay on the device.
 * Accounts off or signed out: nothing here runs and the review works exactly as before.
 */
import { nextReview, type Review } from './review';
import type { ReviewStateRow } from './reviewqueue';
import type { SessionHistories } from './reviewsession';
import type { SessionState } from './supabaseclient';

export type { ReviewStateRow };

/** The columns a student may set on insert. */
export type ReviewStateInsert = ReviewStateRow;
/** The columns a student may change on update. */
export type ReviewStateUpdate = Omit<ReviewStateRow, 'item_id'>;

interface Reply { data?: unknown; error?: unknown }

/** The part of the Supabase client this file uses. `from('review_state')` with the chains below, nothing else. */
export interface ReviewStateClient {
  from(table: 'review_state'): {
    select(columns: typeof COLUMNS): ReadQuery;
    update(values: ReviewStateUpdate): {
      eq(column: 'item_id', value: string): { select(columns: 'item_id'): PromiseLike<Reply> };
    };
    insert(values: ReviewStateInsert): PromiseLike<Reply>;
  };
}

interface ReadQuery {
  gt(column: 'item_id', value: string): ReadQuery;
  order(column: 'item_id', options: { ascending: true }): ReadQuery;
  limit(count: number): PromiseLike<Reply>;
}

/**
 * `failed`: the published questions whose newest step is still waiting after this attempt (kept for the next save or
 * retry). Left out when nothing was sent (a step the device's date can't schedule).
 */
export type SyncOutcome = { ok: true } | { ok: false; message: string; failed?: string[] };

const COLUMNS = 'item_id,level,last_reviewed,next_review' as const;
const KEYS = ['item_id', 'level', 'last_reviewed', 'next_review'] as const;
export const PAGE_SIZE = 500;
/** The same cap export-my-data uses. More rows than this means something is wrong, so the load stops. */
export const MAX_ROWS = 50_000;

export const MESSAGES = {
  load: "your saved reviews couldn't be loaded, so this review will stay on this device.",
  connection: "this review wasn't saved to your account yet, so check your connection and try again.",
  signedOut: "you're signed out, so sign in again to save this review to your account.",
  unavailable: "this question can't be saved to your account right now, so this review stays on this device.",
  deviceDate: "your device's date looks wrong, so this review wasn't saved to your account.",
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = 86_400_000;

/** A published question's id. Anything else (a sample card) is never sent. */
export function isItemId(id: unknown): id is string {
  return typeof id === 'string' && UUID.test(id);
}

function dayNumber(day: unknown): number | undefined {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day.startsWith('0000')) return undefined;
  const time = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== day) return undefined;
  return time / DAY;
}

/** The same shape rules the table enforces, so a row the database would refuse is never built or accepted. */
function checkRow(row: ReviewStateRow): boolean {
  const last = dayNumber(row.last_reviewed);
  const next = dayNumber(row.next_review);
  return isItemId(row.item_id) && [0, 1, 2, 3].includes(row.level) && last !== undefined && next !== undefined &&
    next > last && next <= last + 366;
}

/** One row exactly as selected: a plain object with only the four columns, as own data properties. */
function parseRow(value: unknown): ReviewStateRow | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return undefined;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== KEYS.length || Object.getOwnPropertySymbols(value).length) return undefined;
  const fields: Record<string, unknown> = {};
  for (const key of KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return undefined;
    fields[key] = descriptor.value;
  }
  const row = fields as unknown as ReviewStateRow;
  return checkRow(row) ? { item_id: row.item_id, level: row.level, last_reviewed: row.last_reviewed, next_review: row.next_review } : undefined;
}

/**
 * Reads all of the student's rows, page by page in item_id order (keyset paging, so a save in another tab can't skip
 * or repeat a row). Any bad reply, bad row, duplicate or out-of-order page fails the whole load: half a list would let
 * a review overwrite progress the student already has.
 */
export async function loadReviewState(client: ReviewStateClient):
Promise<{ ok: true; rows: ReviewStateRow[] } | { ok: false; message: string }> {
  const rows: ReviewStateRow[] = [];
  let cursor: string | undefined;
  try {
    for (;;) {
      let query = client.from('review_state').select(COLUMNS);
      if (cursor !== undefined) query = query.gt('item_id', cursor);
      const reply = await query.order('item_id', { ascending: true }).limit(PAGE_SIZE);
      if (!reply || reply.error != null || !Array.isArray(reply.data) || reply.data.length > PAGE_SIZE) {
        return { ok: false, message: MESSAGES.load };
      }
      if (reply.data.length === 0) return { ok: true, rows };
      for (const value of reply.data) {
        const row = parseRow(value);
        // Strictly ascending also rules out duplicates and a page that ignored the cursor.
        if (!row || (cursor !== undefined && row.item_id <= cursor)) return { ok: false, message: MESSAGES.load };
        rows.push(row);
        cursor = row.item_id;
      }
      if (rows.length > MAX_ROWS) return { ok: false, message: MESSAGES.load };
    }
  } catch {
    return { ok: false, message: MESSAGES.load };
  }
}

/**
 * Starting histories for the cards in this deck, from loaded rows (rows for other decks are left out, as
 * startSession requires). A row reviewed "after" today (the device's date is behind) counts as reviewed today.
 * Uses the stored level only; see syntheticHistory in reviewqueue.ts for the exam-shortened-date caveat.
 */
export function historiesFor(rows: readonly ReviewStateRow[], cardIds: readonly string[], today: string): SessionHistories {
  if (dayNumber(today) === undefined) throw new Error('Use a real calendar day written YYYY-MM-DD.');
  const wanted = new Set(cardIds);
  const histories: SessionHistories = {};
  for (const row of rows) {
    if (!wanted.has(row.item_id) || !checkRow(row)) continue;
    const day = row.last_reviewed > today ? today : row.last_reviewed;
    histories[row.item_id] = row.level === 0
      ? [{ day, result: 'missed' }]
      : Array.from({ length: row.level }, () => ({ day, result: 'knew' as const }));
  }
  return histories;
}

/** The row to save after a review step: the streak of knew results (0 to 3) and the next due day from the scheduler. */
export function rowAfterReview(itemId: string, history: readonly Review[], today: string, examDay?: string): ReviewStateRow {
  if (!isItemId(itemId)) throw new Error('Only published questions are saved to an account.');
  if (!Array.isArray(history) || history.length === 0) throw new Error('A saved review needs at least one result.');
  if (history[history.length - 1]!.day !== today) throw new Error('The last review must be today.');
  const next = nextReview(history, examDay, today)!; // Validates every review and day.
  let level = 0;
  for (const review of history) level = review.result === 'missed' ? 0 : Math.min(level + 1, 3);
  const row: ReviewStateRow = { item_id: itemId, level: level as ReviewStateRow['level'], last_reviewed: today, next_review: next };
  if (!checkRow(row)) throw new Error('The next review is outside what can be saved.');
  return row;
}

/** One plain sentence for a refused or failed write. Never shows database text or codes. */
export function syncMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null) return MESSAGES.connection;
  const { code, message } = error as { code?: unknown; message?: unknown };
  // review_state_guard() and the table's checks.
  if (code === '23514') return MESSAGES.deviceDate;
  if (code === '42501') {
    // The insert policy refuses a question that isn't published; anything else here is a missing sign-in.
    return typeof message === 'string' && message.startsWith('new row violates row-level security policy')
      ? MESSAGES.unavailable : MESSAGES.signedOut;
  }
  return MESSAGES.connection;
}

/** When several rows fail at once, the one sentence shown is the one that applies to them all first. */
const MESSAGE_ORDER: readonly string[] = [MESSAGES.signedOut, MESSAGES.connection, MESSAGES.deviceDate, MESSAGES.unavailable];

class WriteError extends Error {
  constructor(readonly reason: unknown) { super('review_state write failed'); }
}

function changed(reply: Reply | undefined): number {
  if (!reply || reply.error != null) throw new WriteError(reply?.error);
  if (!Array.isArray(reply.data) || reply.data.length > 1) throw new WriteError(undefined);
  return reply.data.length;
}

async function update(client: ReviewStateClient, row: ReviewStateRow): Promise<number> {
  const values: ReviewStateUpdate = { level: row.level, last_reviewed: row.last_reviewed, next_review: row.next_review };
  return changed(await client.from('review_state').update(values).eq('item_id', row.item_id).select('item_id'));
}

/** Update the student's row, or add it. If another tab added it in between (23505), update once more. */
async function writeRow(client: ReviewStateClient, row: ReviewStateRow): Promise<void> {
  if (await update(client, row) === 1) return;
  const values: ReviewStateInsert = { item_id: row.item_id, level: row.level, last_reviewed: row.last_reviewed, next_review: row.next_review };
  const reply = await client.from('review_state').insert(values);
  if (!reply) throw new WriteError(undefined);
  if (reply.error == null) return;
  const code = (reply.error as { code?: unknown }).code;
  if (code === '23505' && await update(client, row) === 1) return;
  throw new WriteError(reply.error);
}

export interface ReviewSync {
  /** Save one review step. Sample cards are skipped. Resolves when every waiting row is saved, or with the reason. */
  record(itemId: string, history: readonly Review[], today: string, examDay?: string): Promise<SyncOutcome>;
  /** Try every row that hasn't been saved yet again. */
  retry(): Promise<SyncOutcome>;
}

/**
 * Keeps unsaved rows (newest per question) until they are saved, and writes one at a time in order, so an older
 * step can never land after a newer one. Questions are independent: a row that is refused (for example a question
 * unpublished before its first save) stays waiting and is reported, and every other row is still sent.
 */
export function createReviewSync(client: ReviewStateClient): ReviewSync {
  const waiting = new Map<string, ReviewStateRow>();
  let queue: Promise<unknown> = Promise.resolve();

  const flush = (): Promise<SyncOutcome> => {
    const run = queue.then(async (): Promise<SyncOutcome> => {
      const failed: string[] = [];
      let message: string | undefined;
      for (const [id, row] of [...waiting]) {
        try {
          await writeRow(client, row);
        } catch (error) {
          failed.push(id);
          const reason = syncMessage(error instanceof WriteError ? error.reason : error);
          if (message === undefined || MESSAGE_ORDER.indexOf(reason) < MESSAGE_ORDER.indexOf(message)) message = reason;
          continue;
        }
        if (waiting.get(id) === row) waiting.delete(id);
      }
      return message === undefined ? { ok: true } : { ok: false, message, failed };
    });
    queue = run;
    return run;
  };

  return {
    record(itemId, history, today, examDay) {
      if (!isItemId(itemId)) return Promise.resolve({ ok: true });
      let row: ReviewStateRow;
      try {
        row = rowAfterReview(itemId, history, today, examDay);
      } catch {
        return Promise.resolve({ ok: false, message: MESSAGES.deviceDate });
      }
      waiting.delete(itemId); // Keep save order: the newest step for a question goes last.
      waiting.set(itemId, row);
      return flush();
    },
    retry: flush,
  };
}

export type ReviewSyncStart =
  | { mode: 'device' }
  | { mode: 'device'; message: string }
  | { mode: 'account'; sync: ReviewSync; rows: ReviewStateRow[] };

/**
 * The page's one entry point. Accounts off (no client) or signed out: device only, nothing changes. Signed in: loads
 * the student's rows first; if that fails, the review stays on this device and the student is told in one sentence.
 */
export async function startReviewSync(client: ReviewStateClient | null, session: SessionState): Promise<ReviewSyncStart> {
  if (!client || !session.signedIn) return { mode: 'device' };
  const loaded = await loadReviewState(client);
  if (!loaded.ok) return { mode: 'device', message: loaded.message };
  return { mode: 'account', sync: createReviewSync(client), rows: loaded.rows };
}
