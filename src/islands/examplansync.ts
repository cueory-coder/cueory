/**
 * The exam date in a signed-in student's account (Task 145, D-87).
 *
 * Signed out, or with accounts off, nothing here runs: the exam date stays in this browser's progress record exactly
 * as before (src/scripts/progress.ts). Signed in:
 * - on load, the student's own `exam_plans` rows are read and the account's date wins over the device's;
 * - setting, changing or clearing the date in setup writes the row for that course.
 *
 * The database adapter is injected, so every rule here is unit tested without the network or the SDK
 * (tests/unit/examplansync.test.ts). Row-level security and `exam_plans_guard()` in
 * supabase/migrations/20261101110000_review_state_and_exam_plans.sql remain the real checks.
 *
 * Why update-then-insert instead of an upsert: the migration grants a student `insert (course, exam_date)` but only
 * `update (exam_date)`. PostgREST builds an upsert as `on conflict … do update set <every sent column>`, so an upsert
 * would also set `course` and be refused for lacking update rights on that column. An update of `exam_date` by course,
 * then an insert when no row matched, uses exactly the granted columns.
 */
import { examPlanRow } from './examplanimport';
import { isCourse, isExamDate, type CourseId, type Onboarding } from '../scripts/progress';

export interface DbError {
  code?: string;
  message?: string;
}

/** The four calls this file makes, each on the signed-in student's own rows only (RLS). */
export interface ExamPlanSyncDb {
  list(): PromiseLike<{ data: readonly unknown[] | null; error: DbError | null }>;
  /** Changes the exam date of the plan for one course and returns the rows it changed. */
  update(course: CourseId, examDate: string): PromiseLike<{ data: readonly unknown[] | null; error: DbError | null }>;
  insert(row: { course: CourseId; exam_date: string }): PromiseLike<{ error: DbError | null }>;
  remove(course: CourseId): PromiseLike<{ error: DbError | null }>;
}

export const SYNC_MESSAGES = {
  loadFailed: 'your account’s exam date couldn’t be loaded, so this shows what’s saved on this device.',
  saved: 'your exam date is saved to your account too.',
  removed: 'your exam date is cleared from your account too.',
  noCourse: 'pick a course to save your exam date to your account. for now it’s saved on this device only.',
  outOfWindow: 'your account keeps exam dates from two days ago to two years ahead, so this one is saved on this device only.',
  tooMany: 'your account already has ten exam plans, so this one is saved on this device only.',
  signedOut: 'your sign-in has ended, so your exam date is saved on this device only. sign in again to save it to your account.',
  connectFailed: 'your exam date is saved on this device, but we couldn’t check your sign-in, so it hasn’t been saved to your account. try again, or carry on and it stays on this device.',
  failed: 'your exam date is saved on this device, but it couldn’t be saved to your account. try again later.',
  removeFailed: 'your exam date is cleared on this device, but it couldn’t be cleared from your account. try again later.',
} as const;

const failure = (error: DbError | null | undefined, fallback: string): string => {
  if (error?.code === '54000') return SYNC_MESSAGES.tooMany;
  if (error?.code === '23514') return SYNC_MESSAGES.outOfWindow;
  if (error?.code === '42501') return SYNC_MESSAGES.signedOut;
  return fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export interface ServerPlan {
  course: CourseId;
  examDate: string;
}

/** The account's plans this site understands. Unknown courses and malformed dates are ignored, never guessed. */
export function serverPlans(rows: readonly unknown[] | null | undefined): ServerPlan[] {
  if (!Array.isArray(rows)) return [];
  const plans: ServerPlan[] = [];
  for (const row of rows) {
    if (!isRecord(row) || !isCourse(row.course) || !isExamDate(row.exam_date)) continue;
    if (plans.some((plan) => plan.course === row.course)) continue;
    plans.push({ course: row.course, examDate: row.exam_date });
  }
  return plans;
}

/**
 * The device's setup answers with the account's exam date applied, or `null` when nothing changes.
 * - The device has a course: the account's plan for that course wins.
 * - The device has no course and the account has exactly one plan: that plan's course and date are used.
 * Anything else is left as it is.
 */
export function withServerPlan(onboarding: Onboarding, plans: readonly ServerPlan[]): Onboarding | null {
  if (onboarding.course) {
    const plan = plans.find((p) => p.course === onboarding.course);
    if (!plan || plan.examDate === onboarding.examDate) return null;
    return { ...onboarding, examDate: plan.examDate };
  }
  if (plans.length !== 1) return null;
  const [plan] = plans as [ServerPlan];
  return { course: plan.course, examDate: plan.examDate, done: true };
}

export type LoadResult = { ok: true; onboarding: Onboarding | null } | { ok: false; message: string };
export type PlansResult = { ok: true; plans: ServerPlan[] } | { ok: false; message: string };

/** Reads the account's plans, one per course. Never throws. */
export async function loadExamPlans(db: ExamPlanSyncDb): Promise<PlansResult> {
  try {
    const result = await db.list();
    if (!result || result.error || !Array.isArray(result.data)) return { ok: false, message: SYNC_MESSAGES.loadFailed };
    return { ok: true, plans: serverPlans(result.data) };
  } catch {
    return { ok: false, message: SYNC_MESSAGES.loadFailed };
  }
}

/** Reads the account's plans and returns the device answers to save (`null`: no change). Never throws. */
export async function loadExamPlan(db: ExamPlanSyncDb, onboarding: Onboarding): Promise<LoadResult> {
  const loaded = await loadExamPlans(db);
  return loaded.ok ? { ok: true, onboarding: withServerPlan(onboarding, loaded.plans) } : loaded;
}

/** Which setup questions the student has acted on during this visit: picked, typed, cleared or skipped. */
export interface Touched {
  course: boolean;
  examDate: boolean;
}

/** The answers on the setup screen. `dateFromAccount`: the date shown was filled in from the account, not typed. */
export interface ScreenAnswers {
  course: string;
  examDate: string;
  dateFromAccount?: boolean;
}

/**
 * The setup answers to show once the account's plans are known, worked out for the course on screen at that moment.
 * - The course: the student's pick (or skip) stands. Untouched and blank, it takes the account's only plan's course.
 * - The date: the student's answer (or clear) stands. Untouched, it takes the account's date for the course resolved
 *   above. When the account has no plan for that course, a date the account filled in for another course is cleared
 *   (Codex on #232), and a date from this device is left alone. It never takes another course's date.
 * Called when the plans arrive and whenever the course changes afterwards, so the date always belongs to the course.
 */
export function resolveAccountAnswers(
  current: ScreenAnswers,
  touched: Touched,
  plans: readonly ServerPlan[],
): Required<ScreenAnswers> {
  const course = touched.course || current.course ? current.course : plans.length === 1 ? plans[0]!.course : '';
  if (touched.examDate) return { course, examDate: current.examDate, dateFromAccount: false };
  const plan = course ? plans.find((p) => p.course === course) : undefined;
  if (plan) return { course, examDate: plan.examDate, dateFromAccount: true };
  return current.dateFromAccount
    ? { course, examDate: '', dateFromAccount: false }
    : { course, examDate: current.examDate, dateFromAccount: false };
}

/**
 * Keeps track of the newest account load. `start()` returns a check that stays true until `cancel()` (or a newer
 * `start()`), so a load that finishes after "forget my progress" or after the page closes changes nothing.
 */
export function loadTickets(): { start(): () => boolean; cancel(): void } {
  let latest = 0;
  return {
    start() {
      latest += 1;
      const mine = latest;
      return () => mine === latest;
    },
    cancel() {
      latest += 1;
    },
  };
}

export type SaveResult =
  | { status: 'unchanged' }
  | { status: 'saved' | 'removed'; message: string }
  | { status: 'failed'; message: string };

/** Removes the account's plan for one course. Never throws. */
async function removePlan(db: ExamPlanSyncDb, course: CourseId): Promise<SaveResult> {
  try {
    const result = await db.remove(course);
    if (!result || result.error) return { status: 'failed', message: failure(result?.error, SYNC_MESSAGES.removeFailed) };
    return { status: 'removed', message: SYNC_MESSAGES.removed };
  } catch {
    return { status: 'failed', message: SYNC_MESSAGES.removeFailed };
  }
}

export interface SetupSave {
  /** The account's plans as loaded, or null when they couldn't be read. */
  plans: readonly ServerPlan[] | null;
  /** The device's setup answers just before this save. */
  deviceBefore: Onboarding;
  /** The setup answers as saved on the device now. */
  after: Onboarding;
  /** The student cleared or skipped the date question on this visit. */
  clearedDate: boolean;
  today: string;
}

/**
 * Saves the finished setup to the account, measured against the account's own plans (the baseline), never against
 * what this device happened to hold.
 * - A date: written to the plan for the chosen course, unless the account already has exactly that date.
 * - A date the student cleared or skipped: the plan for that course (the chosen one, or the device's when no course
 *   is chosen) is removed, whatever the device held before. A blank the student never touched removes nothing.
 * When the plans couldn't be read, the device's previous answers stand in for them, and a clear is still sent.
 */
export async function saveSetupToAccount(db: ExamPlanSyncDb, save: SetupSave): Promise<SaveResult> {
  const { plans, deviceBefore, after, clearedDate, today } = save;
  if (!after.examDate) {
    if (!clearedDate) return { status: 'unchanged' };
    const course = after.course ?? deviceBefore.course;
    if (!course) return { status: 'unchanged' };
    if (plans && !plans.some((plan) => plan.course === course)) return { status: 'unchanged' };
    return removePlan(db, course);
  }
  const accountDate = plans && after.course ? plans.find((plan) => plan.course === after.course)?.examDate ?? null : null;
  const before: Onboarding = plans ? { course: after.course, examDate: accountDate, done: true } : deviceBefore;
  return saveExamPlan(db, before, after, today);
}

/**
 * Writes the change from `before` to `after` (the setup answers as saved on the device) to the account.
 * - A new or changed date with a course: the plan for that course gets the date.
 * - A cleared date: the plan for the course that had it is removed.
 * - No change to the date or course: nothing is sent.
 * Never throws; a failure is one plain sentence and the device keeps its answers.
 */
export async function saveExamPlan(
  db: ExamPlanSyncDb,
  before: Onboarding,
  after: Onboarding,
  today: string,
): Promise<SaveResult> {
  if (before.examDate === after.examDate && before.course === after.course) return { status: 'unchanged' };

  if (!after.examDate) {
    if (!before.examDate || !before.course) return { status: 'unchanged' };
    return removePlan(db, before.course);
  }

  if (!after.course) return { status: 'failed', message: SYNC_MESSAGES.noCourse };
  const candidate = examPlanRow(after, today);
  if (!candidate.ok) return { status: 'failed', message: SYNC_MESSAGES.outOfWindow };
  const { course, exam_date: examDate } = candidate.row;

  const changed = async (): Promise<'yes' | 'no' | DbError> => {
    const result = await db.update(course, examDate);
    if (!result || result.error) return result?.error ?? {};
    if (!Array.isArray(result.data)) return {};
    return result.data.length > 0 ? 'yes' : 'no';
  };

  try {
    const first = await changed();
    if (first === 'yes') return { status: 'saved', message: SYNC_MESSAGES.saved };
    if (first !== 'no') return { status: 'failed', message: failure(first, SYNC_MESSAGES.failed) };

    const inserted = await db.insert({ course, exam_date: examDate });
    if (!inserted) return { status: 'failed', message: SYNC_MESSAGES.failed };
    if (!inserted.error) return { status: 'saved', message: SYNC_MESSAGES.saved };
    if (inserted.error.code !== '23505') return { status: 'failed', message: failure(inserted.error, SYNC_MESSAGES.failed) };

    // Another tab added this course's plan between the two calls: change that one instead.
    const retry = await changed();
    if (retry === 'yes') return { status: 'saved', message: SYNC_MESSAGES.saved };
    return { status: 'failed', message: failure(retry === 'no' ? null : retry, SYNC_MESSAGES.failed) };
  } catch {
    return { status: 'failed', message: SYNC_MESSAGES.failed };
  }
}

type Thenable<T> = PromiseLike<T>;
type Rows = { data: unknown[] | null; error: DbError | null };

/** The few supabase-js calls used here, so the adapter can be tested with a stand-in. */
export interface ExamPlanClient {
  from(table: 'exam_plans'): {
    select(columns: string): { limit(count: number): Thenable<Rows> };
    update(patch: { exam_date: string }): { eq(column: 'course', value: string): { select(columns: string): Thenable<Rows> } };
    insert(row: { course: string; exam_date: string }): Thenable<{ error: DbError | null }>;
    delete(): { eq(column: 'course', value: string): Thenable<{ error: DbError | null }> };
  };
}

/** The adapter over the page's Supabase client. Row-level security limits every call to the student's own rows. */
export function supabaseExamPlans(client: ExamPlanClient): ExamPlanSyncDb {
  const table = () => client.from('exam_plans');
  return {
    // The database caps a student at ten plans.
    list: () => table().select('course,exam_date').limit(10),
    update: (course, examDate) => table().update({ exam_date: examDate }).eq('course', course).select('course'),
    insert: (row) => table().insert({ course: row.course, exam_date: row.exam_date }),
    remove: (course) => table().delete().eq('course', course),
  };
}

interface ClientModule {
  getSupabase(): Promise<unknown>;
  sessionCheckFrom(client: never): Promise<{ signedIn: boolean } | ConnectFailure>;
}

/** The session or client couldn't be checked: unlike `null` (accounts off, or confirmed signed out). */
export interface ConnectFailure { error: true }
export const isConnectFailure = (value: unknown): value is ConnectFailure =>
  typeof value === 'object' && value !== null && (value as ConnectFailure).error === true;

/**
 * The account adapter when accounts are on and someone is signed in on this browser; otherwise `null`, and the exam
 * date stays on the device. `{ error: true }` when the check itself failed. The Supabase module is loaded only when this is called.
 */
export async function connectExamPlans(
  load: () => Promise<ClientModule> = () => import('./supabaseclient') as unknown as Promise<ClientModule>,
): Promise<ExamPlanSyncDb | ConnectFailure | null> {
  try {
    const { getSupabase, sessionCheckFrom } = await load();
    const client = await getSupabase();
    if (!client) return null;
    const session = await sessionCheckFrom(client as never);
    if (isConnectFailure(session)) return session;
    return session.signedIn ? supabaseExamPlans(client as ExamPlanClient) : null;
  } catch {
    // Not the same as signed out: the session couldn't be checked, so a signed-in student may still have an account.
    return { error: true };
  }
}
