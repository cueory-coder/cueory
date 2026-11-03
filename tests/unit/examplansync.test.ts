import { describe, expect, it, vi } from 'vitest';
import {
  connectExamPlans,
  loadExamPlan,
  saveExamPlan,
  serverPlans,
  loadTickets,
  supabaseExamPlans,
  SYNC_MESSAGES,
  loadExamPlans,
  resolveAccountAnswers,
  saveSetupToAccount,
  withServerPlan,
  type DbError,
  type ExamPlanClient,
  type ExamPlanSyncDb,
} from '../../src/islands/examplansync';
import type { Onboarding } from '../../src/scripts/progress';

const TODAY = '2026-11-02';
const answers = (course: Onboarding['course'], examDate: string | null): Onboarding => ({ course, examDate, done: true });

/**
 * One student's exam_plans, with the migration's rules that matter here: insert sets only (course, exam_date),
 * update changes only exam_date, one plan per course (23505), at most ten (54000), the date window (23514).
 */
class FakePlans implements ExamPlanSyncDb {
  rows: { course: string; exam_date: string }[] = [];
  calls: string[] = [];
  failOn?: (call: string) => DbError | undefined;
  /** Runs before an insert, to stand in for another tab adding the same course. */
  beforeInsert?: () => void;

  private guard(examDate: string): DbError | undefined {
    const days = (Date.parse(examDate) - Date.parse(TODAY)) / 86_400_000;
    return days < -2 || days > 730 ? { code: '23514' } : undefined;
  }

  async list() {
    this.calls.push('list');
    const error = this.failOn?.('list');
    return error ? { data: null, error } : { data: this.rows.map((r) => ({ ...r })), error: null };
  }

  async update(course: string, examDate: string) {
    this.calls.push(`update ${course} ${examDate}`);
    const error = this.failOn?.('update') ?? this.guard(examDate);
    if (error) return { data: null, error };
    const hit = this.rows.filter((r) => r.course === course);
    for (const row of hit) row.exam_date = examDate;
    return { data: hit.map((r) => ({ course: r.course })), error: null };
  }

  async insert(row: { course: string; exam_date: string }) {
    this.calls.push(`insert ${row.course} ${row.exam_date}`);
    expect(Object.keys(row).sort()).toEqual(['course', 'exam_date']);
    this.beforeInsert?.();
    const error = this.failOn?.('insert') ?? this.guard(row.exam_date);
    if (error) return { error };
    if (this.rows.some((r) => r.course === row.course)) return { error: { code: '23505' } };
    if (this.rows.length >= 10) return { error: { code: '54000' } };
    this.rows.push({ ...row });
    return { error: null };
  }

  async remove(course: string) {
    this.calls.push(`remove ${course}`);
    const error = this.failOn?.('remove');
    if (error) return { error };
    this.rows = this.rows.filter((r) => r.course !== course);
    return { error: null };
  }
}

describe('serverPlans', () => {
  it('keeps only known courses with real dates, one per course', () => {
    expect(serverPlans([
      { course: 'med-surg-1', exam_date: '2027-01-10' },
      { course: 'med-surg-1', exam_date: '2027-02-10' },
      { course: 'pharmacology', exam_date: '2027-01-10' },
      { course: 'fundamentals', exam_date: '2027-02-30' },
      { course: 'both', exam_date: 20270110 },
      null,
      'fundamentals',
    ])).toEqual([{ course: 'med-surg-1', examDate: '2027-01-10' }]);
    expect(serverPlans(null)).toEqual([]);
    expect(serverPlans({} as never)).toEqual([]);
  });
});

describe('withServerPlan — the account wins', () => {
  const plans = [{ course: 'med-surg-1', examDate: '2027-03-01' }, { course: 'fundamentals', examDate: '2027-04-01' }] as const;

  it("replaces the device's date with the account's for the same course", () => {
    expect(withServerPlan(answers('med-surg-1', '2027-05-12'), plans)).toEqual(answers('med-surg-1', '2027-03-01'));
    expect(withServerPlan(answers('med-surg-1', null), plans)).toEqual(answers('med-surg-1', '2027-03-01'));
  });

  it('changes nothing when they already match or the account has no plan for that course', () => {
    expect(withServerPlan(answers('med-surg-1', '2027-03-01'), plans)).toBeNull();
    expect(withServerPlan(answers('both', '2027-05-12'), plans)).toBeNull();
  });

  it("uses the account's only plan on a device with no course, and never guesses between several", () => {
    expect(withServerPlan({ course: null, examDate: null, done: false }, [plans[0]])).toEqual(answers('med-surg-1', '2027-03-01'));
    expect(withServerPlan(answers(null, '2027-05-12'), [plans[1]])).toEqual(answers('fundamentals', '2027-04-01'));
    expect(withServerPlan(answers(null, '2027-05-12'), plans)).toBeNull();
    expect(withServerPlan(answers(null, null), [])).toBeNull();
  });
});

describe('loadExamPlan', () => {
  it("returns the device answers with the account's date", async () => {
    const db = new FakePlans();
    db.rows = [{ course: 'fundamentals', exam_date: '2027-01-20' }];
    expect(await loadExamPlan(db, answers('fundamentals', '2027-06-01'))).toEqual({
      ok: true, onboarding: answers('fundamentals', '2027-01-20'),
    });
    expect(await loadExamPlan(db, answers('fundamentals', '2027-01-20'))).toEqual({ ok: true, onboarding: null });
  });

  it('fails in one plain sentence on an error, a throw or an odd response', async () => {
    const failed = { ok: false, message: SYNC_MESSAGES.loadFailed };
    const db = new FakePlans();
    db.failOn = () => ({ code: '500', message: 'provider-private-detail' });
    expect(await loadExamPlan(db, answers('both', null))).toEqual(failed);
    const throwing = Object.assign(new FakePlans(), { list: () => Promise.reject(new Error('offline')) });
    expect(await loadExamPlan(throwing, answers('both', null))).toEqual(failed);
    const odd = Object.assign(new FakePlans(), { list: async () => ({ data: null, error: null }) });
    expect(await loadExamPlan(odd, answers('both', null))).toEqual(failed);
    expect(SYNC_MESSAGES.loadFailed).not.toMatch(/provider-private-detail/);
  });
});

describe('resolveAccountAnswers — the date belongs to the course on screen (Codex on #232)', () => {
  const plans = [{ course: 'med-surg-1', examDate: '2026-12-10' }, { course: 'fundamentals', examDate: '2027-01-20' }] as const;
  const untouched = { course: false, examDate: false };

  it("fills an untouched date with the account's date for the course on screen", () => {
    expect(resolveAccountAnswers({ course: 'med-surg-1', examDate: '' }, untouched, plans))
      .toMatchObject({ course: 'med-surg-1', examDate: '2026-12-10' });
  });

  it('uses the course picked now, not the one saved on the device, and never borrows another course\'s date', () => {
    const picked = { course: true, examDate: false };
    expect(resolveAccountAnswers({ course: 'fundamentals', examDate: '' }, picked, plans))
      .toMatchObject({ course: 'fundamentals', examDate: '2027-01-20' });
    expect(resolveAccountAnswers({ course: 'fundamentals', examDate: '' }, picked, [plans[0]]))
      .toMatchObject({ course: 'fundamentals', examDate: '' });
    expect(resolveAccountAnswers({ course: 'both', examDate: '2027-03-01' }, picked, plans))
      .toMatchObject({ course: 'both', examDate: '2027-03-01' });
  });

  it('keeps a skipped course blank, and then has no course to take a date from', () => {
    expect(resolveAccountAnswers({ course: '', examDate: '' }, { course: true, examDate: false }, [plans[0]]))
      .toMatchObject({ course: '', examDate: '' });
  });

  it("takes the account's only plan when the course is untouched and blank", () => {
    expect(resolveAccountAnswers({ course: '', examDate: '' }, untouched, [plans[0]]))
      .toMatchObject({ course: 'med-surg-1', examDate: '2026-12-10' });
    expect(resolveAccountAnswers({ course: '', examDate: '' }, untouched, plans)).toMatchObject({ course: '', examDate: '' });
  });

  it('clears a date the account filled in when the course switches to one with no plan (Codex on #232)', () => {
    const picked = { course: true, examDate: false };
    const loaded = resolveAccountAnswers({ course: 'med-surg-1', examDate: '' }, untouched, [plans[0]]);
    expect(loaded).toEqual({ course: 'med-surg-1', examDate: '2026-12-10', dateFromAccount: true });
    expect(resolveAccountAnswers({ ...loaded, course: 'fundamentals' }, picked, [plans[0]]))
      .toEqual({ course: 'fundamentals', examDate: '', dateFromAccount: false });
    // A date from this device (not the account) stays, as it would without an account.
    expect(resolveAccountAnswers({ course: 'fundamentals', examDate: '2027-03-01', dateFromAccount: false }, picked, [plans[0]]))
      .toEqual({ course: 'fundamentals', examDate: '2027-03-01', dateFromAccount: false });
    // Switching back finds the account's date again.
    expect(resolveAccountAnswers({ course: 'med-surg-1', examDate: '' }, picked, [plans[0]]))
      .toEqual({ course: 'med-surg-1', examDate: '2026-12-10', dateFromAccount: true });
  });

  it('never replaces a date the student typed, cleared or skipped', () => {
    expect(resolveAccountAnswers({ course: 'med-surg-1', examDate: '' }, { course: false, examDate: true }, plans))
      .toMatchObject({ course: 'med-surg-1', examDate: '' });
    expect(resolveAccountAnswers({ course: 'med-surg-1', examDate: '2027-02-02' }, { course: false, examDate: true }, plans))
      .toMatchObject({ course: 'med-surg-1', examDate: '2027-02-02' });
  });
});

describe('saveSetupToAccount — the account plans are the baseline (Codex on #232)', () => {
  const save = (db: ExamPlanSyncDb, values: { plans: { course: 'med-surg-1' | 'fundamentals'; examDate: string }[] | null;
    deviceBefore: Onboarding; after: Onboarding; clearedDate?: boolean }) =>
    saveSetupToAccount(db, { clearedDate: false, today: TODAY, ...values });

  it('a cleared or skipped date removes the plan even when the device never had that date', async () => {
    const db = new FakePlans();
    db.rows = [{ course: 'med-surg-1', exam_date: '2026-12-10' }];
    const result = await save(db, {
      plans: [{ course: 'med-surg-1', examDate: '2026-12-10' }],
      deviceBefore: answers('med-surg-1', null), after: answers('med-surg-1', null), clearedDate: true,
    });
    expect(result).toEqual({ status: 'removed', message: SYNC_MESSAGES.removed });
    expect(db.calls).toEqual(['remove med-surg-1']);
  });

  it('a blank the student never touched removes nothing', async () => {
    const db = new FakePlans();
    expect(await save(db, {
      plans: [{ course: 'med-surg-1', examDate: '2026-12-10' }], deviceBefore: answers('med-surg-1', '2026-12-10'), after: answers('med-surg-1', null),
    })).toEqual({ status: 'unchanged' });
    expect(db.calls).toEqual([]);
  });

  it('a clear for a course the account has no plan for sends nothing, and a clear with no course uses the device course', async () => {
    const db = new FakePlans();
    expect(await save(db, {
      plans: [{ course: 'med-surg-1', examDate: '2026-12-10' }], deviceBefore: answers(null, null), after: answers('fundamentals', null), clearedDate: true,
    })).toEqual({ status: 'unchanged' });
    expect(await save(db, {
      plans: [{ course: 'med-surg-1', examDate: '2026-12-10' }], deviceBefore: answers('med-surg-1', null), after: answers(null, null), clearedDate: true,
    })).toEqual({ status: 'removed', message: SYNC_MESSAGES.removed });
    expect(db.calls).toEqual(['remove med-surg-1']);
  });

  it("a date equal to the account's plan sends nothing; a date for another course writes only that course", async () => {
    const db = new FakePlans();
    db.rows = [{ course: 'med-surg-1', exam_date: '2026-12-10' }, { course: 'fundamentals', exam_date: '2027-01-20' }];
    const plans = [{ course: 'med-surg-1' as const, examDate: '2026-12-10' }, { course: 'fundamentals' as const, examDate: '2027-01-20' }];
    expect(await save(db, { plans, deviceBefore: answers('med-surg-1', null), after: answers('fundamentals', '2027-01-20') }))
      .toEqual({ status: 'unchanged' });
    expect(await save(db, { plans, deviceBefore: answers('fundamentals', '2027-01-20'), after: answers('fundamentals', '2027-02-02') }))
      .toEqual({ status: 'saved', message: SYNC_MESSAGES.saved });
    expect(db.calls).toEqual(['update fundamentals 2027-02-02']);
    expect(db.rows).toContainEqual({ course: 'med-surg-1', exam_date: '2026-12-10' });
  });

  it('when the plans could not be read, compares with the device and still sends a clear', async () => {
    const db = new FakePlans();
    expect(await save(db, { plans: null, deviceBefore: answers('both', '2026-12-10'), after: answers('both', '2026-12-10') }))
      .toEqual({ status: 'unchanged' });
    expect(await save(db, { plans: null, deviceBefore: answers('both', null), after: answers('both', null), clearedDate: true }))
      .toEqual({ status: 'removed', message: SYNC_MESSAGES.removed });
    expect(db.calls).toEqual(['remove both']);
  });

  it('a failed removal is one plain sentence', async () => {
    const db = new FakePlans();
    db.failOn = (call) => (call === 'remove' ? { code: '500', message: 'private' } : undefined);
    expect(await save(db, { plans: null, deviceBefore: answers('both', null), after: answers('both', null), clearedDate: true }))
      .toEqual({ status: 'failed', message: SYNC_MESSAGES.removeFailed });
  });
});

describe('loadExamPlans', () => {
  it('returns the plans by course, or the load sentence', async () => {
    const db = new FakePlans();
    db.rows = [{ course: 'med-surg-1', exam_date: '2026-12-10' }];
    expect(await loadExamPlans(db)).toEqual({ ok: true, plans: [{ course: 'med-surg-1', examDate: '2026-12-10' }] });
    db.failOn = () => ({ code: '500' });
    expect(await loadExamPlans(db)).toEqual({ ok: false, message: SYNC_MESSAGES.loadFailed });
  });
});

describe('loadTickets', () => {
  it('a load started before "forget" is cancelled for good (Codex on #232)', () => {
    const loads = loadTickets();
    const pending = loads.start();
    expect(pending()).toBe(true);
    loads.cancel();
    expect(pending()).toBe(false);
    expect(pending()).toBe(false);
  });

  it('only the newest load counts', () => {
    const loads = loadTickets();
    const first = loads.start();
    const second = loads.start();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it('keeps separate pages apart', () => {
    const a = loadTickets();
    const b = loadTickets();
    const pending = a.start();
    b.cancel();
    expect(pending()).toBe(true);
  });
});

describe('saveExamPlan', () => {
  it('adds a plan for a new course with only the two insertable columns', async () => {
    const db = new FakePlans();
    const result = await saveExamPlan(db, answers(null, null), answers('med-surg-1', '2026-12-10'), TODAY);
    expect(result).toEqual({ status: 'saved', message: SYNC_MESSAGES.saved });
    expect(db.calls).toEqual(['update med-surg-1 2026-12-10', 'insert med-surg-1 2026-12-10']);
    expect(db.rows).toEqual([{ course: 'med-surg-1', exam_date: '2026-12-10' }]);
  });

  it('changes an existing plan by updating only the date, so it works at the ten-plan cap', async () => {
    const db = new FakePlans();
    db.rows = Array.from({ length: 9 }, (_, i) => ({ course: `old-${i}`, exam_date: '2027-01-01' }));
    db.rows.push({ course: 'med-surg-1', exam_date: '2026-12-10' });
    const result = await saveExamPlan(db, answers('med-surg-1', '2026-12-10'), answers('med-surg-1', '2027-01-15'), TODAY);
    expect(result.status).toBe('saved');
    expect(db.calls).toEqual(['update med-surg-1 2027-01-15']);
    expect(db.rows.find((r) => r.course === 'med-surg-1')?.exam_date).toBe('2027-01-15');
    expect(db.rows).toHaveLength(10);
  });

  it('removes the plan when the date is cleared', async () => {
    const db = new FakePlans();
    db.rows = [{ course: 'both', exam_date: '2026-12-10' }];
    expect(await saveExamPlan(db, answers('both', '2026-12-10'), answers('both', null), TODAY))
      .toEqual({ status: 'removed', message: SYNC_MESSAGES.removed });
    expect(db.rows).toEqual([]);
  });

  it('sends nothing when nothing changed, or when no date was ever set', async () => {
    const db = new FakePlans();
    expect(await saveExamPlan(db, answers('both', '2026-12-10'), answers('both', '2026-12-10'), TODAY)).toEqual({ status: 'unchanged' });
    expect(await saveExamPlan(db, answers(null, null), answers('both', null), TODAY)).toEqual({ status: 'unchanged' });
    expect(await saveExamPlan(db, answers(null, '2026-12-10'), answers(null, null), TODAY)).toEqual({ status: 'unchanged' });
    expect(db.calls).toEqual([]);
  });

  it('keeps a date with no course on the device and says why', async () => {
    const db = new FakePlans();
    expect(await saveExamPlan(db, answers(null, null), answers(null, '2026-12-10'), TODAY))
      .toEqual({ status: 'failed', message: SYNC_MESSAGES.noCourse });
    expect(db.calls).toEqual([]);
  });

  it('checks the date window before sending', async () => {
    const db = new FakePlans();
    for (const date of ['2026-10-30', '2028-11-02']) {
      expect(await saveExamPlan(db, answers('both', null), answers('both', date), TODAY))
        .toEqual({ status: 'failed', message: SYNC_MESSAGES.outOfWindow });
    }
    expect(db.calls).toEqual([]);
    expect((await saveExamPlan(db, answers('both', null), answers('both', '2026-10-31'), TODAY)).status).toBe('saved');
  });

  it('updates the plan another tab added between the update and the insert', async () => {
    const db = new FakePlans();
    db.beforeInsert = () => { db.rows.push({ course: 'fundamentals', exam_date: '2027-02-02' }); };
    const result = await saveExamPlan(db, answers(null, null), answers('fundamentals', '2026-12-01'), TODAY);
    expect(result.status).toBe('saved');
    expect(db.calls).toEqual(['update fundamentals 2026-12-01', 'insert fundamentals 2026-12-01', 'update fundamentals 2026-12-01']);
    expect(db.rows).toEqual([{ course: 'fundamentals', exam_date: '2026-12-01' }]);
  });

  it.each([
    ['54000', 'insert', SYNC_MESSAGES.tooMany],
    ['23514', 'insert', SYNC_MESSAGES.outOfWindow],
    ['42501', 'update', SYNC_MESSAGES.signedOut],
    ['500', 'update', SYNC_MESSAGES.failed],
    ['500', 'insert', SYNC_MESSAGES.failed],
  ])('explains a %s refusal on %s in one plain sentence', async (code, call, message) => {
    const db = new FakePlans();
    db.failOn = (c) => (c === call ? { code, message: 'provider-private-detail' } : undefined);
    const result = await saveExamPlan(db, answers(null, null), answers('both', '2026-12-10'), TODAY);
    expect(result).toEqual({ status: 'failed', message });
    expect(message).not.toMatch(/provider-private-detail/);
    expect(message.split('. ').length).toBeLessThanOrEqual(2);
  });

  it('reports a failed clear, a throw, and an unexpected response without throwing', async () => {
    const db = new FakePlans();
    db.failOn = () => ({ code: '500' });
    expect(await saveExamPlan(db, answers('both', '2026-12-10'), answers('both', null), TODAY))
      .toEqual({ status: 'failed', message: SYNC_MESSAGES.removeFailed });
    const throwing: ExamPlanSyncDb = {
      list: () => Promise.reject(new Error('x')), update: () => Promise.reject(new Error('x')),
      insert: () => Promise.reject(new Error('x')), remove: () => Promise.reject(new Error('x')),
    };
    expect(await saveExamPlan(throwing, answers('both', null), answers('both', '2026-12-10'), TODAY))
      .toEqual({ status: 'failed', message: SYNC_MESSAGES.failed });
    expect(await saveExamPlan(throwing, answers('both', '2026-12-10'), answers('both', null), TODAY))
      .toEqual({ status: 'failed', message: SYNC_MESSAGES.removeFailed });
    const odd = Object.assign(new FakePlans(), { update: async () => ({ data: null, error: null }) });
    expect((await saveExamPlan(odd, answers('both', null), answers('both', '2026-12-10'), TODAY)).status).toBe('failed');
  });
});

describe('supabaseExamPlans', () => {
  it('makes exactly the granted calls on exam_plans', async () => {
    const log: unknown[] = [];
    const done = <T>(value: T) => Promise.resolve(value);
    const client: ExamPlanClient = {
      from: (table) => {
        log.push(['from', table]);
        return {
          select: (columns) => ({ limit: (n) => { log.push(['select', columns, n]); return done({ data: [], error: null }); } }),
          update: (patch) => ({ eq: (column, value) => ({ select: (columns) => {
            log.push(['update', patch, column, value, columns]);
            return done({ data: [{ course: value }], error: null });
          } }) }),
          insert: (row) => { log.push(['insert', row]); return done({ error: null }); },
          delete: () => ({ eq: (column, value) => { log.push(['delete', column, value]); return done({ error: null }); } }),
        };
      },
    };
    const db = supabaseExamPlans(client);
    await db.list();
    await db.update('both', '2026-12-10');
    await db.insert({ course: 'both', exam_date: '2026-12-10', user_id: 'someone-else' } as never);
    await db.remove('both');
    expect(log).toEqual([
      ['from', 'exam_plans'], ['select', 'course,exam_date', 10],
      ['from', 'exam_plans'], ['update', { exam_date: '2026-12-10' }, 'course', 'both', 'course'],
      ['from', 'exam_plans'], ['insert', { course: 'both', exam_date: '2026-12-10' }],
      ['from', 'exam_plans'], ['delete', 'course', 'both'],
    ]);
  });
});

describe('connectExamPlans', () => {
  const module = (client: unknown, signedIn: boolean) => async () => ({
    getSupabase: async () => client,
    sessionStateFrom: vi.fn(async () => ({ signedIn })),
  });

  it('is null with accounts off, signed out, or when loading fails', async () => {
    expect(await connectExamPlans(module(null, true))).toBeNull();
    expect(await connectExamPlans(module({ from: vi.fn() }, false))).toBeNull();
    expect(await connectExamPlans(() => Promise.reject(new Error('offline')))).toBeNull();
    expect(await connectExamPlans(async () => ({
      getSupabase: () => Promise.reject(new Error('x')), sessionStateFrom: async () => ({ signedIn: true }),
    }))).toBeNull();
  });

  it('gives the adapter when someone is signed in', async () => {
    const from = vi.fn();
    const db = await connectExamPlans(module({ from }, true));
    expect(db).not.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});
