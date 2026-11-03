import { describe, expect, it, vi } from 'vitest';
import { examPlanRow, importExamPlan, type ExamPlanDb } from '../../src/islands/examplanimport';
import { emptyProgress, type Onboarding } from '../../src/scripts/progress';

const TODAY = '2026-11-01';
const filled = (course: Onboarding['course'] = 'med-surg-1', examDate: string | null = '2026-11-30'): Onboarding => ({
  course,
  examDate,
  done: true,
});
const outcome = (code: string | null = null) => ({ error: code ? { code } : null });
const dbWith = (result = outcome()): ExamPlanDb & { update: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> } => ({
  update: vi.fn().mockResolvedValue({ data: [{ course: 'med-surg-1' }], error: null }),
  insert: vi.fn().mockResolvedValue(result),
});

describe('examPlanRow — migration constraints', () => {
  it('saves only the exact insertable columns, leaving user_id and defaults to the database', () => {
    const result = examPlanRow(emptyProgress().onboarding, TODAY);
    expect(result).toEqual({ ok: false, message: expect.any(String) });
    const ready = examPlanRow(filled(), TODAY);
    expect(ready).toEqual({ ok: true, row: { course: 'med-surg-1', exam_date: '2026-11-30' } });
    if (ready.ok) expect(Object.keys(ready.row).sort()).toEqual(['course', 'exam_date']);
  });

  it.each(['fundamentals', 'med-surg-1', 'both'] as const)('accepts the guest course slug %s', (course) => {
    expect(examPlanRow(filled(course), TODAY)).toMatchObject({ ok: true, row: { course } });
  });

  it.each(['Unknown Course', 'MED-SURG-1', 'med_surg_1', 'a'.repeat(81), '', 'med-surg-1!', null])(
    'rejects a course that is not an approved guest slug: %s', (course) => {
      expect(examPlanRow(filled(course as Onboarding['course']), TODAY)).toMatchObject({ ok: false });
    },
  );

  it('requires a date, without throwing', () => {
    expect(examPlanRow(filled('fundamentals', null), TODAY)).toMatchObject({ ok: false });
    expect(examPlanRow(filled('fundamentals', ''), TODAY)).toMatchObject({ ok: false });
  });

  it.each(['2026-02-30', '2027-02-29', '2026-1-1', 'next friday', '2026-13-01'])('rejects impossible dates: %s', (date) => {
    expect(examPlanRow(filled('fundamentals', date), TODAY)).toMatchObject({ ok: false });
  });

  it('accepts a real leap day', () => {
    expect(examPlanRow(filled('fundamentals', '2028-02-29'), '2028-02-28')).toMatchObject({ ok: true });
  });

  it.each([['2026-10-30', true], ['2026-10-29', false], ['2026-11-01', true], ['2028-10-31', true], ['2028-11-01', false]])(
    'checks date window boundaries at %s (allowed: %s)', (examDate, allowed) => {
      expect(examPlanRow(filled('fundamentals', examDate), TODAY).ok).toBe(allowed);
    },
  );

  it('counts calendar days through leap days and daylight-saving changes', () => {
    expect(examPlanRow(filled('fundamentals', '2028-03-01'), '2028-02-29').ok).toBe(true);
    expect(examPlanRow(filled('fundamentals', '2027-03-14'), '2027-03-13').ok).toBe(true);
  });

  it('refuses an invalid today rather than guessing the date window', () => {
    expect(examPlanRow(filled(), '2026-02-31')).toMatchObject({ ok: false });
  });

  it('works whether onboarding is marked done or not (SQL has no done column)', () => {
    expect(examPlanRow({ ...filled(), done: false }, TODAY).ok).toBe(true);
  });

  it('uses calm lowercase explanations for all refusals', () => {
    const inputs = [filled(null), filled('fundamentals', null), filled('fundamentals', '2026-10-28')];
    for (const input of inputs) {
      const result = examPlanRow(input, TODAY);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toBe(result.message.toLowerCase());
        expect(result.message).not.toContain('!');
      }
    }
  });
});

describe('importExamPlan — database ownership, uniqueness, and ten-plan guard', () => {
  it('keeps the existing import adapter compatible during the update/insert migration', async () => {
    const db: ExamPlanDb = { upsert: vi.fn().mockResolvedValue(outcome()) };
    expect(await importExamPlan(db, filled(), TODAY)).toMatchObject({ ok: true });
    expect(db.upsert).toHaveBeenCalledExactlyOnceWith(
      'exam_plans',
      { course: 'med-surg-1', exam_date: '2026-11-30' },
      'user_id,course',
    );
  });

  it('does not touch the database for missing or invalid input', async () => {
    const db = dbWith();
    expect(await importExamPlan(db, filled(null), TODAY)).toMatchObject({ ok: false });
    expect(await importExamPlan(db, filled('fundamentals', '2026-10-29'), TODAY)).toMatchObject({ ok: false });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('updates only exam_date when a course already has a saved plan', async () => {
    const db = dbWith();
    expect(await importExamPlan(db, filled(), TODAY)).toEqual({
      ok: true,
      row: { course: 'med-surg-1', exam_date: '2026-11-30' },
      message: 'your exam date was saved',
    });
    expect(db.update).toHaveBeenCalledExactlyOnceWith(
      'exam_plans',
      'med-surg-1',
      '2026-11-30',
    );
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('inserts only the two student-owned columns when no course row exists', async () => {
    const db = dbWith();
    db.update.mockResolvedValue({ data: [], error: null });
    await importExamPlan(db, filled(), TODAY);
    const row = db.insert.mock.calls[0]![1] as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(['course', 'exam_date']);
    expect(row).not.toHaveProperty('user_id');
    expect(row).not.toHaveProperty('id');
    expect(row).not.toHaveProperty('created_at');
  });

  it('allows ten plans, refuses an eleventh, and lets an existing course update at the cap', async () => {
    // This mirrors the database guard's outward contract. The SQL trigger is authoritative,
    // including when two different browser sessions insert concurrently.
    const saved = new Map<string, string>();
    const db: ExamPlanDb = {
      update: vi.fn().mockImplementation(async (_table: string, course: string, examDate: string) => {
        if (!saved.has(course)) return { data: [], error: null };
        saved.set(course, examDate);
        return { data: [{ course }], error: null };
      }),
      insert: vi.fn().mockImplementation(async (_table: string, row: { course: string; exam_date: string }) => {
        if (!saved.has(row.course) && saved.size >= 10) return outcome('54000');
        saved.set(row.course, row.exam_date);
        return outcome();
      }),
    };
    for (let i = 0; i < 10; i++) {
      const course = i === 0 ? 'med-surg-1' : 'course-' + i;
      // The guest onboarding UI has three valid courses, so the DB's broader ten-course
      // rule is exercised through the injected adapter's simulated pre-existing plans.
      if (i > 0) saved.set(course, '2026-11-15');
      else expect((await importExamPlan(db, filled(), TODAY)).ok).toBe(true);
    }
    expect(saved.size).toBe(10);
    // An existing course can change its date without creating a new row.
    expect((await importExamPlan(db, filled('med-surg-1', '2026-12-01'), TODAY)).ok).toBe(true);
    expect(saved.size).toBe(10);
    expect(saved.get('med-surg-1')).toBe('2026-12-01');
    // An 11th course is blocked by SQL. The failure is presented in plain words.
    expect(await importExamPlan(db, filled('both'), TODAY)).toEqual({
      ok: false,
      message: 'you can save no more than ten exam plans',
    });
  });

  it('maps the 11th course error from the database to clear words, without claiming success', async () => {
    const db = dbWith();
    db.update.mockResolvedValue({ data: [], error: { code: '54000' } });
    expect(await importExamPlan(db, filled(), TODAY)).toEqual({
      ok: false,
      message: 'you can save no more than ten exam plans',
    });
  });

  it.each([
    ['23514', 'that exam date is outside the allowed window'],
    ['23505', 'an exam plan for this course already exists'],
    ['42501', 'sign in before saving your exam date'],
    ['XX001', 'your exam date could not be saved. please try again'],
  ])('does not swallow database refusals (%s)', async (code, message) => {
    const db = dbWith();
    db.update.mockResolvedValue({ data: [], error: { code } });
    expect(await importExamPlan(db, filled(), TODAY)).toEqual({ ok: false, message });
  });

  it('returns a safe failure for thrown network errors (never leaks internal messages)', async () => {
    const db: ExamPlanDb = {
      update: vi.fn().mockRejectedValue(new Error('internal secret')),
      insert: vi.fn(),
    };
    const result = await importExamPlan(db, filled(), TODAY);
    expect(result).toEqual({ ok: false, message: 'your exam date could not be saved. please try again' });
  });

  it('fails closed on a missing database reply', async () => {
    const db: ExamPlanDb = { update: vi.fn().mockResolvedValue(undefined), insert: vi.fn() };
    expect(await importExamPlan(db, filled(), TODAY)).toMatchObject({ ok: false });
  });

  it('retries the update when another tab wins the insert race', async () => {
    const db = dbWith();
    db.update
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ course: 'med-surg-1' }], error: null });
    db.insert.mockResolvedValue({ error: { code: '23505' } });

    expect(await importExamPlan(db, filled(), TODAY)).toMatchObject({ ok: true });
    expect(db.update).toHaveBeenCalledTimes(2);
    expect(db.insert).toHaveBeenCalledOnce();
  });
});
