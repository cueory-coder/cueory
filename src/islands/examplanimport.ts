/**
 * The guest's optional exam date, ready to save in the student's own exam_plans row (D-87).
 *
 * The migration owns the final checks: public.slug, the current_date - 2 to + 730 window,
 * a unique (user_id, course), and at most ten courses per student. These helpers validate
 * before sending and explain a database refusal, but do not replace the database guard.
 * No user id, generated id, or timestamp is sent by this client-side importer.
 */
import { isCourse, isExamDate, type Onboarding } from '../scripts/progress';
import { daysUntil } from './examdate';

/** Only the two columns a signed-in student may set on an exam_plans insert. */
export interface ExamPlanRow {
  course: NonNullable<Onboarding['course']>;
  exam_date: string;
}

type Refusal = { ok: false; message: string };
type Ready = { ok: true; row: ExamPlanRow };

export type ExamPlanResult = Ready | Refusal;

/**
 * Convert saved onboarding answers to one database row, without reading the clock.
 * The two-day grace period and 730-day horizon are from exam_plans_guard() in the migration.
 */
export function examPlanRow(onboarding: Onboarding, today: string): ExamPlanResult {
  if (!isCourse(onboarding.course)) {
    return { ok: false, message: 'choose a course before saving an exam date' };
  }
  if (!isExamDate(onboarding.examDate)) {
    return { ok: false, message: 'add a real exam date before saving a plan' };
  }

  let remaining: number;
  try {
    remaining = daysUntil(onboarding.examDate, today);
  } catch {
    return { ok: false, message: 'the current date could not be checked' };
  }

  if (remaining < -2 || remaining > 730) {
    return { ok: false, message: 'choose an exam date from two days ago through the next 730 days' };
  }

  return { ok: true, row: { course: onboarding.course, exam_date: onboarding.examDate } };
}

/** A small adapter supplied by the account page, so these rules need no network or SDK. */
export interface ExamPlanDb {
  update(
    table: 'exam_plans',
    course: ExamPlanRow['course'],
    examDate: ExamPlanRow['exam_date'],
  ): Promise<{ data: readonly unknown[] | null; error: { code?: string; message?: string } | null }>;
  insert(table: 'exam_plans', row: ExamPlanRow): Promise<{ error: { code?: string; message?: string } | null }>;
}

export type ImportExamPlanResult =
  | { ok: true; row: ExamPlanRow; message: string }
  | Refusal;

/** Save one plan, updating the same course if it already exists, without adding an eleventh. */
export async function importExamPlan(
  db: ExamPlanDb,
  onboarding: Onboarding,
  today: string,
): Promise<ImportExamPlanResult> {
  const candidate = examPlanRow(onboarding, today);
  if (!candidate.ok) return candidate;

  try {
    const updated = await db.update('exam_plans', candidate.row.course, candidate.row.exam_date);
    if (!updated || updated.error) {
      return { ok: false, message: databaseFailure(updated?.error) };
    }
    if (updated.data?.length) return { ok: true, row: candidate.row, message: 'your exam date was saved' };

    const inserted = await db.insert('exam_plans', candidate.row);
    if (!inserted) return { ok: false, message: databaseFailure(null) };
    if (!inserted.error) return { ok: true, row: candidate.row, message: 'your exam date was saved' };
    if (inserted.error.code !== '23505') return { ok: false, message: databaseFailure(inserted.error) };

    // Another tab inserted this course between the update and insert. Update it now.
    const retried = await db.update('exam_plans', candidate.row.course, candidate.row.exam_date);
    if (retried?.data?.length && !retried.error) {
      return { ok: true, row: candidate.row, message: 'your exam date was saved' };
    }
    return { ok: false, message: databaseFailure(retried?.error) };
  } catch {
    return { ok: false, message: 'your exam date could not be saved. please try again' };
  }
}

function databaseFailure(error: { code?: string; message?: string } | null | undefined): string {
  if (error?.code === '54000') return 'you can save no more than ten exam plans';
  if (error?.code === '23514') return 'that exam date is outside the allowed window';
  if (error?.code === '23505') return 'an exam plan for this course already exists';
  if (error?.code === '42501') return 'sign in before saving your exam date';
  return 'your exam date could not be saved. please try again';
}
