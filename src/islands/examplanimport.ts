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
  upsert(
    table: 'exam_plans',
    row: ExamPlanRow,
    onConflict: 'user_id,course',
  ): Promise<{ error: { code?: string; message?: string } | null }>;
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
    // On conflict, only exam_date changes. PostgreSQL applies the count guard atomically,
    // including against concurrent inserts; a browser-side count would be subject to races.
    const result = await db.upsert('exam_plans', candidate.row, 'user_id,course');
    if (!result || !('error' in result)) {
      return { ok: false, message: 'your exam date could not be saved. please try again' };
    }
    if (result.error) {
      if (result.error.code === '54000') {
        return { ok: false, message: 'you can save no more than ten exam plans' };
      }
      if (result.error.code === '23514') {
        return { ok: false, message: 'that exam date is outside the allowed window' };
      }
      if (result.error.code === '23505') {
        return { ok: false, message: 'an exam plan for this course already exists' };
      }
      if (result.error.code === '42501') {
        return { ok: false, message: 'sign in before saving your exam date' };
      }
      return { ok: false, message: 'your exam date could not be saved. please try again' };
    }
    return { ok: true, row: candidate.row, message: 'your exam date was saved' };
  } catch {
    return { ok: false, message: 'your exam date could not be saved. please try again' };
  }
}
