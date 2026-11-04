/**
 * Read a signed-in student's own export data (D-86, D-87, D-88, Task 140).
 *
 * The database's row-level security restricts the five table reads to the
 * current student. Reports must come from my_flags(), never from flags:
 * that table also contains private moderation fields.
 *
 * The caller adds browser-only progress, game stats and onboarding, and may
 * add the signed-in email from Auth. profiles does not store an email address.
 * No partial export is returned when any read or row shape fails.
 *
 * The sign-in record (Task 309) comes from Supabase Auth's auth.getUser(), which
 * asks Auth for the signed-in student only: user_metadata, the sign-in methods,
 * when the account was made and last signed in, and each identity's
 * identity_data (with Google: name, profile-photo link, Google account id, email
 * and whether it is verified). The sessions, with their browser and IP address,
 * come from my_sessions(), because the browser can't read auth.sessions.
 *
 * study_events has no cap: it is read page by page and each checked page is
 * written straight into StudyEventPages, so a long history never sits in memory
 * as one array of rows. Download the result with exportJsonBlob / exportCsvBlobs.
 */
import { jsonCopy, StudyEventPages, type ExportData, type JsonObject } from './exportdata';

export type ExportTable = 'profiles' | 'attempts' | 'exam_plans' | 'review_state' | 'study_events';

interface ReadResult {
  data: unknown;
  error?: unknown;
}

type WholeTable = Exclude<ExportTable, 'study_events'>;

export interface ExportReader {
  /** Every row of a small, capped table in one result. */
  select(table: WholeTable, columns: string): PromiseLike<ReadResult>;
  /** study_events, one page at a time, in a stable order. */
  selectPages(table: 'study_events', columns: string): AsyncIterable<ReadResult>;
  rpc(name: ExportRpc): PromiseLike<ReadResult>;
  /** The signed-in student's own sign-in record: `{ user }`, as Supabase's auth.getUser() returns it. */
  user(): PromiseLike<ReadResult>;
}

export type ExportRpc = 'my_flags' | 'my_sessions';

export type ExportLoadResult =
  | { ok: true; data: ExportData }
  | { ok: false; message: string };

const ERROR_MESSAGE = "we couldn't load all your saved data. please try again.";
const PAGE_SIZE = 500;

/** ExportData's caps. Refuse oversize sets instead of quietly dropping rows. study_events has none (see above). */
const LIMITS = {
  profiles: 1,
  attempts: 50_000,
  exam_plans: 10,
  review_state: 50_000,
  my_flags: 10_000,
  my_sessions: 10_000,
  identities: 20,
} as const;

/** Exact, least-privilege columns from the existing Supabase migrations. */
const COLUMNS = {
  profiles: 'display_name,created_at,name_change_window_start,name_changes_in_window',
  attempts: 'id,item_version_id,picked,correct,created_at',
  exam_plans: 'id,course,exam_date,created_at',
  review_state: 'item_id,level,last_reviewed,next_review,updated_at',
  study_events: 'id,item_id,item_version_id,kind,ms_on_item,mark,at,created_at',
} as const;

function row(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error('invalid export row');
  }
  return value as Record<string, unknown>;
}

/** Accept only own data properties. Never run getters supplied by a caller. */
function field(value: Record<string, unknown>, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  if (!descriptor || !('value' in descriptor)) throw new Error('missing export field');
  return descriptor.value;
}

function text(value: Record<string, unknown>, name: string): string {
  const v = field(value, name);
  if (typeof v !== 'string') throw new Error('invalid export field');
  return v;
}

function nullableText(value: Record<string, unknown>, name: string): string | null {
  const v = field(value, name);
  if (v !== null && typeof v !== 'string') throw new Error('invalid export field');
  return v;
}

function truth(value: Record<string, unknown>, name: string): boolean {
  const v = field(value, name);
  if (typeof v !== 'boolean') throw new Error('invalid export field');
  return v;
}

function uuid(value: Record<string, unknown>, name: string): string {
  const v = text(value, name);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)) {
    throw new Error('invalid export field');
  }
  return v;
}

/** A field Supabase Auth may leave out. A getter is still refused. */
function maybe(value: Record<string, unknown>, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  if (!descriptor) return undefined;
  if (!('value' in descriptor)) throw new Error('invalid export field');
  return descriptor.value;
}

function optionalTimestamp(value: Record<string, unknown>, name: string): string | null {
  const v = maybe(value, name);
  return v === undefined || v === null ? null : timestamp(value, name);
}

/** user_metadata and identity_data: plain JSON objects, copied. A missing one is an empty object. */
function metadata(value: unknown): JsonObject {
  if (value === undefined || value === null) return {};
  row(value);
  const copy = jsonCopy(value);
  if (copy === undefined) throw new Error('invalid sign-in details');
  return copy as JsonObject;
}

function provider(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(value)) throw new Error('invalid sign-in method');
  return value;
}

/** A list Supabase Auth may leave out, as plain elements (no getters, no extra keys). */
function list(value: unknown, cap: number): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > cap || Object.keys(value).length !== value.length) {
    throw new Error('invalid sign-in list');
  }
  // Array.map reads an element before its callback runs, which would execute a malicious getter.
  // Inspect each own data descriptor before reading any element.
  const entries: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor)) throw new Error('invalid sign-in list');
    entries.push(descriptor.value);
  }
  return entries;
}

/** The sign-in record, from auth.getUser(). Only the fields named in ExportData['account']. */
function account(data: unknown): NonNullable<ExportData['account']> {
  const user = row(field(row(data), 'user'));
  const app = maybe(user, 'app_metadata');
  return {
    createdAt: timestamp(user, 'created_at'),
    lastSignInAt: optionalTimestamp(user, 'last_sign_in_at'),
    providers: app === undefined || app === null ? [] : list(maybe(row(app), 'providers'), 20).map(provider),
    userMetadata: metadata(maybe(user, 'user_metadata')),
    identities: list(maybe(user, 'identities'), LIMITS.identities).map((entry) => {
      const identity = row(entry);
      return {
        provider: provider(field(identity, 'provider')),
        identityData: metadata(maybe(identity, 'identity_data')),
        createdAt: optionalTimestamp(identity, 'created_at'),
        lastSignInAt: optionalTimestamp(identity, 'last_sign_in_at'),
      };
    }),
  };
}

function optionalUuid(value: Record<string, unknown>, name: string): string | null {
  return field(value, name) === null ? null : uuid(value, name);
}

/** Match exportJson's date validation, so it cannot silently discard a row. */
function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function calendarDay(value: Record<string, unknown>, name: string): string {
  const v = text(value, name);
  if (!isCalendarDay(v)) throw new Error('invalid export day');
  return v;
}

function timestamp(value: Record<string, unknown>, name: string): string {
  const v = text(value, name);
  // PostgREST timestamptz values have a timezone. Never normalize an impossible day or time.
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(v);
  if (!match || !isCalendarDay(match[1]!) || Number(match[2]) > 23 ||
      Number(match[3]) > 59 || Number(match[4]) > 59 || !Number.isFinite(Date.parse(v))) {
    throw new Error('invalid export timestamp');
  }
  return v;
}

function courseSlug(value: Record<string, unknown>): string {
  const v = text(value, 'course');
  if (v.length > 80 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v)) throw new Error('invalid course');
  return v;
}

function reportPage(value: Record<string, unknown>): string {
  const v = text(value, 'page');
  if (v.length > 200 || !/^\/[A-Za-z0-9._~/%:@!$&'()*+,;=-]*$/.test(v) || v.startsWith('//')) {
    throw new Error('invalid report page');
  }
  return v;
}

function reportReason(value: Record<string, unknown>): string {
  const v = text(value, 'reason');
  if (!['wrong-fact', 'typo', 'confusing', 'broken', 'other'].includes(v)) throw new Error('invalid report reason');
  return v;
}

function reportComment(value: Record<string, unknown>): string | null {
  const v = nullableText(value, 'comment');
  if (v !== null && ([...v].length < 1 || [...v].length > 1000 || /[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v))) {
    throw new Error('invalid report comment');
  }
  return v;
}

/** study_events' own checks: one of three kinds, 0 to 30 minutes, and a mark exactly when the kind is a mark. */
function studyEvent(value: Record<string, unknown>) {
  const kind = text(value, 'kind');
  if (!['answered', 'marked', 'skipped'].includes(kind)) throw new Error('invalid study event kind');
  const msOnItem = field(value, 'ms_on_item');
  if (typeof msOnItem !== 'number' || !Number.isSafeInteger(msOnItem) || msOnItem < 0 || msOnItem > 1_800_000) {
    throw new Error('invalid study event time on item');
  }
  const mark = nullableText(value, 'mark');
  if (mark !== null && !['know', 'learning'].includes(mark)) throw new Error('invalid study event mark');
  if ((kind === 'marked') !== (mark !== null)) throw new Error('invalid study event mark');
  return {
    itemId: uuid(value, 'item_id'),
    itemVersionId: uuid(value, 'item_version_id'),
    kind,
    msOnItem,
    mark,
    at: timestamp(value, 'at'),
    createdAt: timestamp(value, 'created_at'),
  };
}

function entries<T>(data: unknown, map: (value: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(data)) throw new Error('invalid export result');
  return data.map((value: unknown) => map(row(value)));
}

async function fetchRows(reader: ExportReader, table: WholeTable): Promise<unknown> {
  const reply = await reader.select(table, COLUMNS[table]);
  if (!reply || reply.error != null || !Array.isArray(reply.data)) throw new Error('export read failed');
  if (reply.data.length > LIMITS[table]) throw new Error('export is too large');
  return reply.data;
}

function pickedLetters(value: Record<string, unknown>): string[] {
  const letters = field(value, 'picked');
  if (!Array.isArray(letters) || letters.length < 1 || letters.length > 5 ||
      Object.keys(letters).length !== letters.length) throw new Error('invalid picked choices');
  const result = letters.map((letter, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(letters, String(index));
    if (!descriptor || !('value' in descriptor) || descriptor.value !== letter ||
        typeof letter !== 'string' || !/^[a-e]$/.test(letter)) throw new Error('invalid picked choices');
    return letter;
  });
  if (new Set(result).size !== result.length) throw new Error('duplicate picked choices');
  return result;
}

/** Returns every section supplied by the database, or nothing if a read fails. */
export async function loadExport(reader: ExportReader): Promise<ExportLoadResult> {
  try {
    const profiles = entries(await fetchRows(reader, 'profiles'), (r) => {
      // Preserve current staging's display-name change-history fields.
      const changes = field(r, 'name_changes_in_window');
      if (typeof changes !== 'number' || !Number.isInteger(changes) || changes < 0 || changes > 10) {
        throw new Error('invalid name change count');
      }
      return {
        displayName: nullableText(r, 'display_name'),
        createdAt: timestamp(r, 'created_at'),
        nameChangeWindowStart: field(r, 'name_change_window_start') === null ? null : timestamp(r, 'name_change_window_start'),
        nameChangesInWindow: changes,
      };
    });
    const attempts = entries(await fetchRows(reader, 'attempts'), (r) => ({
      itemVersionId: uuid(r, 'item_version_id'),
      picked: pickedLetters(r),
      correct: truth(r, 'correct'),
      createdAt: timestamp(r, 'created_at'),
    }));
    const examPlans = entries(await fetchRows(reader, 'exam_plans'), (r) => ({
      course: courseSlug(r),
      examDate: calendarDay(r, 'exam_date'),
      createdAt: timestamp(r, 'created_at'),
    }));
    const reviewRows = entries(await fetchRows(reader, 'review_state'), (r) => {
      const level = field(r, 'level');
      if (typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > 3) {
        throw new Error('invalid review level');
      }
      return {
        itemId: uuid(r, 'item_id'),
        level,
        lastReviewed: calendarDay(r, 'last_reviewed'),
        nextReview: calendarDay(r, 'next_review'),
        updatedAt: timestamp(r, 'updated_at'),
      };
    });
    // Each page is checked strictly (one bad row refuses the export) and written out before the next is read.
    const studyEvents = new StudyEventPages();
    for await (const page of reader.selectPages('study_events', COLUMNS.study_events)) {
      if (!page || page.error != null || !Array.isArray(page.data)) throw new Error('export read failed');
      studyEvents.add(entries(page.data, studyEvent));
    }
    const reply = await reader.rpc('my_flags');
    if (!reply || reply.error != null || !Array.isArray(reply.data) || reply.data.length > LIMITS.my_flags) {
      throw new Error('report export read failed');
    }
    const reports = entries(reply.data, (r) => ({
      id: uuid(r, 'id'),
      page: reportPage(r),
      itemId: optionalUuid(r, 'item_id'),
      itemVersionId: optionalUuid(r, 'item_version_id'),
      reason: reportReason(r),
      comment: reportComment(r),
      createdAt: timestamp(r, 'created_at'),
    }));
    const sessionReply = await reader.rpc('my_sessions');
    if (!sessionReply || sessionReply.error != null || !Array.isArray(sessionReply.data) ||
        sessionReply.data.length > LIMITS.my_sessions) {
      throw new Error('session export read failed');
    }
    // The session id is only the read cursor and is not exported.
    const sessions = entries(sessionReply.data, (r) => {
      uuid(r, 'id');
      return {
        createdAt: optionalTimestamp(r, 'created_at'),
        updatedAt: optionalTimestamp(r, 'updated_at'),
        notAfter: optionalTimestamp(r, 'not_after'),
        userAgent: nullableText(r, 'user_agent'),
        ip: nullableText(r, 'ip'),
      };
    });
    const who = await reader.user();
    if (!who || who.error != null) throw new Error('sign-in record read failed');
    return {
      ok: true,
      data: {
        profile: profiles[0] ?? {}, account: account(who.data), attempts, examPlans, reviewRows, reports, sessions, studyEvents,
      },
    };
  } catch {
    // Never show or log a database error. It could contain another person's data or SQL internals.
    return { ok: false, message: ERROR_MESSAGE };
  }
}

interface SupabaseQuery {
  order(column: string, options: { ascending: boolean }): SupabaseQuery;
  gt(column: string, value: string): SupabaseQuery;
  range(from: number, to: number): PromiseLike<ReadResult>;
}

/** Small structural interface: importing this module does not import Supabase or start a session. */
export interface SupabaseExportClient {
  from(table: ExportTable): { select(columns: string): SupabaseQuery };
  rpc(name: ExportRpc): SupabaseQuery;
  auth: { getUser(): PromiseLike<ReadResult> };
}

/** Stable unique row keys for keyset pagination. profiles has at most one row. */
const CURSOR_COLUMN: Record<ExportTable | ExportRpc, string | null> = {
  profiles: null,
  attempts: 'id',
  exam_plans: 'id',
  review_state: 'item_id',
  study_events: 'id',
  my_flags: 'id',
  my_sessions: 'id',
};

/**
 * Read a set page by page in stable key order. Unlike offset pagination, deleting a previously
 * read row while the export runs cannot move a later row past the next page's cursor.
 * A keyset cursor is read only from the database's UUID primary key and is never exported,
 * except my_flags' public report id. New writes while reading are not a database snapshot.
 * The cursor must rise strictly on every row, so reading always ends. A failed read is
 * yielded as an error page and ends the set.
 */
async function* pages(makeQuery: () => SupabaseQuery, which: ExportTable | ExportRpc): AsyncGenerator<ReadResult> {
  const key = CURSOR_COLUMN[which];
  let cursor: string | null = null;
  for (;;) {
    let query = makeQuery();
    query = query.order(key ?? 'created_at', { ascending: true });
    if (key !== null && cursor !== null) query = query.gt(key, cursor);
    const reply = await query.range(0, PAGE_SIZE - 1);
    if (!reply || reply.error != null || !Array.isArray(reply.data)) { yield { data: null, error: 'read failed' }; return; }
    if (key !== null) {
      for (const entry of reply.data) {
        const next = uuid(row(entry), key);
        if (cursor !== null && next <= cursor) { yield { data: null, error: 'invalid cursor ordering' }; return; }
        cursor = next;
      }
    }
    yield { data: reply.data, error: null };
    if (reply.data.length < PAGE_SIZE) return;
    if (key === null) { yield { data: null, error: 'too many profiles' }; return; }
  }
}

/** Read a whole capped set, refusing it if it passes its cap. */
async function allPages(makeQuery: () => SupabaseQuery, which: WholeTable | ExportRpc): Promise<ReadResult> {
  const results: unknown[] = [];
  for await (const page of pages(makeQuery, which)) {
    if (page.error != null || !Array.isArray(page.data)) return { data: null, error: page.error };
    if (results.length + page.data.length > LIMITS[which]) return { data: null, error: 'too many rows' };
    results.push(...page.data);
  }
  return { data: results, error: null };
}

/**
 * Uses only the tables and RPC explicitly allowed by Task 61 (and study_events, Task 140; my_sessions and
 * auth.getUser(), Task 309).
 */
export function fromSupabase(client: SupabaseExportClient): ExportReader {
  return {
    select: (table, columns) => allPages(() => client.from(table).select(columns), table),
    selectPages: (table, columns) => pages(() => client.from(table).select(columns), table),
    rpc: (name) => allPages(() => client.rpc(name), name),
    user: () => client.auth.getUser(),
  };
}
