/**
 * The one-time "bring in your progress from this device?" offer after sign-in (Task 143).
 *
 * Decision rules and the accept/decline steps only: no DOM, no Supabase package, no clock (today is passed in).
 * GuestImportOffer.tsx supplies browser storage, a lock, and small database adapters built here.
 *
 * One marker per account and browser, the one guestimportrun.ts already uses (`cueory-guest-imported:<id>`):
 * absent means "not asked yet"; `1` means imported (written by runGuestImport, or here after an import with no card
 * rows); `declined` means the student chose "not now". Any value stops both the offer and runGuestImport, so an
 * account is never offered or imported twice in this browser. Delete-my-account already clears every marker.
 */
import { importRows, type GuestImportRow, type IdMap } from './guestimport';
import { GUEST_IMPORT_MARKER_PREFIX, runGuestImport, type GuestImportDb } from './guestimportrun';
import { examPlanRow, importExamPlan, type ExamPlanDb, type ExamPlanRow } from './examplanimport';
import { readProgress, type Progress } from '../scripts/progress';
import type { KeyValueStorage } from '../scripts/storage';
import type { SessionState } from './supabaseclient';

export const IMPORTED_MARKER = '1';
export const DECLINED_MARKER = 'declined';

export const markerKey = (userId: string) => `${GUEST_IMPORT_MARKER_PREFIX}${userId}`;

/** What would come in, counted the way the importers will send it. */
export interface OfferContents {
  cards: number;
  examPlan: boolean;
}

export type OfferDecision =
  | { show: true; contents: OfferContents }
  | { show: false; reason: 'signed-out' | 'no-storage' | 'unreadable' | 'handled' | 'nothing' };

function contentsOf(progress: Progress, idMap: IdMap, today: string): OfferContents {
  let cards = 0;
  try {
    cards = importRows(progress, idMap, today).rows.length;
  } catch {
    cards = 0;
  }
  return { cards, examPlan: examPlanRow(progress.onboarding, today).ok };
}

/**
 * Show the offer only to a signed-in student whose marker is absent and who has something that can actually be
 * brought in: card rows that match published items, or an exam date the database would accept.
 * Unreadable storage hides the offer, because importing without the marker could repeat an import.
 */
export function offerDecision(
  session: SessionState,
  storage: KeyValueStorage | undefined,
  idMap: IdMap,
  today: string,
): OfferDecision {
  if (!session.signedIn || !session.userId) return { show: false, reason: 'signed-out' };
  if (!storage) return { show: false, reason: 'no-storage' };
  try {
    if (storage.getItem(markerKey(session.userId)) !== null) return { show: false, reason: 'handled' };
  } catch {
    return { show: false, reason: 'unreadable' };
  }
  const contents = contentsOf(readProgress(storage), idMap, today);
  if (!contents.cards && !contents.examPlan) return { show: false, reason: 'nothing' };
  return { show: true, contents };
}

/** "Not now": remembered for this account in this browser. Never overwrites an import. False if it can't be saved. */
export function declineOffer(storage: KeyValueStorage | undefined, userId: string): boolean {
  if (!storage || !userId) return false;
  try {
    if (storage.getItem(markerKey(userId)) === null) storage.setItem(markerKey(userId), DECLINED_MARKER);
    return true;
  } catch {
    return false;
  }
}

/** True when a `storage` event from another tab concerns this account's marker (or cleared all storage). */
export function isMarkerEvent(eventKey: string | null, userId: string): boolean {
  return eventKey === null || eventKey === markerKey(userId);
}

/** Runs `task` while holding a named lock (the browser's Web Locks API), so two tabs never import at once. */
export type LockRunner = <T>(name: string, task: () => Promise<T>) => Promise<T>;

export interface AcceptOptions {
  storage: KeyValueStorage | undefined;
  /** The signed-in account's ID from the session, never from a form. */
  userId: string;
  idMap: IdMap;
  today: string;
  cardsDb: GuestImportDb;
  plansDb: ExamPlanDb;
  lock?: LockRunner;
}

export type AcceptOutcome =
  | { kind: 'done'; contents: OfferContents }
  | { kind: 'handled' }
  | { kind: 'error'; message: string };

const RETRY = "that didn't work. please try again.";

async function acceptLocked({ storage, userId, idMap, today, cardsDb, plansDb }: AcceptOptions): Promise<AcceptOutcome> {
  if (!storage || !userId) return { kind: 'error', message: RETRY };
  const key = markerKey(userId);
  try {
    // Checked again inside the lock: another tab may have finished while this one waited.
    if (storage.getItem(key) !== null) return { kind: 'handled' };
  } catch {
    return { kind: 'error', message: RETRY };
  }

  const progress = readProgress(storage);
  const wanted = contentsOf(progress, idMap, today);
  if (!wanted.cards && !wanted.examPlan) return { kind: 'handled' };

  // The exam plan goes first: saving it again on a retry only rewrites the same date.
  if (wanted.examPlan) {
    const plan = await importExamPlan(plansDb, progress.onboarding, today);
    if (!plan.ok) return { kind: 'error', message: `${plan.message}.` };
  }

  if (wanted.cards) {
    const cards = await runGuestImport({ storage, db: cardsDb, userId, idMap });
    if (cards.imported === 0) return { kind: 'error', message: RETRY };
    // runGuestImport wrote the marker after the confirmed insert (or reported that the browser could not).
    return { kind: 'done', contents: { cards: cards.imported, examPlan: wanted.examPlan } };
  }

  try {
    storage.setItem(key, IMPORTED_MARKER);
  } catch {
    // The plan is saved; saving it again later is harmless.
  }
  return { kind: 'done', contents: { cards: 0, examPlan: true } };
}

/** "Bring it in": saves the exam plan and cards, then marks this account as imported. */
export async function acceptOffer(options: AcceptOptions): Promise<AcceptOutcome> {
  const run = () => acceptLocked(options).catch((): AcceptOutcome => ({ kind: 'error', message: RETRY }));
  if (!options.lock) return run();
  try {
    return await options.lock(`cueory-guest-import:${options.userId}`, run);
  } catch {
    return { kind: 'error', message: RETRY };
  }
}

/** The labels: what is on this device, and what came in. */
export function contentsWords({ cards, examPlan }: OfferContents): string {
  const parts = [
    ...(examPlan ? ['your exam date'] : []),
    ...(cards ? [`${cards} ${cards === 1 ? 'card' : 'cards'}`] : []),
  ];
  return parts.join(' and ');
}

/** The minimum of a supabase-js client these adapters use, so tests need no package or network. */
export interface ImportClient {
  from(table: 'review_state' | 'exam_plans'): {
    insert(rows: GuestImportRow[] | ExamPlanRow): PromiseLike<{ error: { code?: string; message?: string } | null }>;
    update(patch: { exam_date: string }): {
      eq(column: 'course', value: string): PromiseLike<{ error: { code?: string; message?: string } | null }>;
    };
  };
}

/** review_state rows: a plain insert of the four columns students may set. */
export function cardsDbFrom(client: ImportClient): GuestImportDb {
  return {
    async insert(table, rows) {
      const { error } = await client.from(table).insert(rows);
      return { error: error ?? null };
    },
  };
}

/**
 * exam_plans "upsert" as insert, then update on a duplicate. PostgREST's upsert puts every sent column in
 * `do update set`, including `course`, but students may update only `exam_date` (column grant in the D-87
 * migration), so a real upsert would be refused. Row-level security limits the update to the student's own row.
 */
export function plansDbFrom(client: ImportClient): ExamPlanDb {
  return {
    async upsert(table, row) {
      const inserted = await client.from(table).insert(row);
      if (inserted.error?.code !== '23505') return { error: inserted.error ?? null };
      const updated = await client.from(table).update({ exam_date: row.exam_date }).eq('course', row.course);
      return { error: updated.error ?? null };
    },
  };
}
