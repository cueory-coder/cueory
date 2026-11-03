import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  COURSES, emptyProgress, examDateWords, isExamDate, localDay, readProgress, saveProgress, withOnboarding,
  type Onboarding as Answers,
} from '../scripts/progress';
import { browserStorage } from '../scripts/storage';
import {
  connectExamPlans, isConnectFailure, type ConnectFailure, loadExamPlans, resolveAccountAnswers, saveSetupToAccount, SYNC_MESSAGES, withServerPlan,
  type ExamPlanSyncDb, type ScreenAnswers, type ServerPlan, type Touched,
} from './examplansync';

const primaryButton = 'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';
const quietButton = 'min-h-11 rounded-pill px-3 py-2.5 text-ink-soft underline';
const TOTAL_QUESTIONS = 2;

/**
 * D-69's two optional answers, shown one question per screen (Task 108).
 * Navigation is local UI state. Only finishing writes cueory-progress, and
 * "skip for now" re-reads the current storage record to prevent restoring
 * answers forgotten in another tab.
 *
 * Signed in (Task 145), the account's exam date is read on load and wins over the device's, and a new, changed or
 * cleared date is also written to the account. Signed out or with accounts off, nothing leaves the device.
 *
 * The account's plans, once loaded, are the baseline for saving (Codex on #232). An untouched date always shows the
 * account's date for the course on screen, never another course's. Finishing before the load lands saves on the
 * device at once and shows the result; the account save waits for the plans and reconciles then: untouched answers
 * take the account's values (on the device and in the summary), and a date the student cleared or skipped removes
 * that course's plan. Waiting instead (with a time limit) would still need this reconcile for a load that outlasts it.
 */
export default function Onboarding() {
  const [storage] = useState(browserStorage);
  const [saved] = useState(() => readProgress(storage).onboarding);
  const [course, setCourse] = useState<string>(saved.course ?? '');
  const [examDate, setExamDate] = useState(saved.examDate ?? '');
  const [step, setStep] = useState<0 | 1>(0);
  const [dateProblem, setDateProblem] = useState('');
  const [result, setResult] = useState<'saved' | 'skipped' | 'not-kept' | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const courseLegendRef = useRef<HTMLLegendElement>(null);
  const dateHeadingRef = useRef<HTMLHeadingElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const [syncNote, setSyncNote] = useState('');
  /**
   * The one record of the account save after finishing (Codex on #232): 'pending' until it is sent or nothing needs
   * sending, 'retry' after a failure worth trying again. The result's links wait while it is pending, so leaving the
   * page can't drop a change the account hasn't had yet.
   */
  const [accountSave, setAccountSave] = useState<'pending' | 'done' | 'retry'>('done');
  const retrySave = useRef<() => void>(() => {});
  /** Resolves once the account is known: its adapter and plans (null plans: they couldn't be read). Null: no account. */
  const account = useRef<Promise<{ db: ExamPlanSyncDb; plans: ServerPlan[] | null } | ConnectFailure | null>>(Promise.resolve(null));
  /** The account's plans once loaded, for keeping an untouched date in step with the course. */
  const plans = useRef<ServerPlan[] | null>(null);
  const finished = useRef(false);
  // Set as soon as the student picks, types, clears or skips, so a late account load never replaces that answer.
  const touched = useRef<Touched>({ course: false, examDate: false });
  // The answers on screen, readable from the load and save callbacks without waiting for a render.
  const answers = useRef<ScreenAnswers>({ course: saved.course ?? '', examDate: saved.examDate ?? '', dateFromAccount: false });
  const show = (next: ScreenAnswers) => {
    answers.current = next;
    setCourse(next.course);
    setExamDate(next.examDate);
  };
  const changeCourse = (value: string) => {
    touched.current.course = true;
    const next = { ...answers.current, course: value };
    // An untouched date follows the course: the account's date for the new course, once the plans are known.
    show(plans.current ? resolveAccountAnswers(next, touched.current, plans.current) : next);
  };
  const changeExamDate = (value: string) => {
    touched.current.examDate = true;
    show({ ...answers.current, examDate: value, dateFromAccount: false });
  };

  const connectAccount = () =>
    (async () => {
      const db = await connectExamPlans();
      if (!db) return null;
      if (isConnectFailure(db)) return db;
      const loaded = await loadExamPlans(db);
      if (!loaded.ok) {
        if (!finished.current) setSyncNote(loaded.message);
        return { db, plans: null };
      }
      plans.current = loaded.plans;
      if (!finished.current) {
        // The device record takes the account's date for its own course, as /progress does.
        const server = withServerPlan(readProgress(storage).onboarding, loaded.plans);
        if (server) saveProgress(storage, withOnboarding(readProgress(storage), server));
        // The screen takes it for the course on screen now, and only for questions the student hasn't acted on.
        show(resolveAccountAnswers(answers.current, touched.current, loaded.plans));
      }
      return { db, plans: loaded.plans };
    })();

  useEffect(() => {
    account.current = connectAccount();
  }, [storage]);

  /**
   * After the device save: waits for the account's plans, then reconciles with them and saves to the account.
   * `acted` is what the student had acted on when they finished. Ends with accountSave 'done' or 'retry', never
   * left 'pending'.
   */
  const saveToAccount = async (deviceBefore: Answers, done: ScreenAnswers, acted: Touched, outcome: 'saved' | 'skipped') => {
    const known = await account.current;
    if (!known) return setAccountSave('done');
    if (isConnectFailure(known)) {
      // The session couldn't be checked, so don't say it was saved: keep the device save and offer another try.
      if (outcome === 'skipped') return setAccountSave('done');
      setSyncNote(SYNC_MESSAGES.connectFailed);
      retrySave.current = () => {
        setSyncNote('');
        setAccountSave('pending');
        account.current = connectAccount();
        void saveToAccount(deviceBefore, done, acted, outcome).catch(() => setAccountSave('done'));
        resultRef.current?.focus();
      };
      return setAccountSave('retry');
    }
    let final: ScreenAnswers = done;
    if (known.plans) {
      // The load may have landed after the student finished: untouched answers take the account's values now.
      const resolved = resolveAccountAnswers(done, acted, known.plans);
      if (resolved.course !== done.course || resolved.examDate !== done.examDate) {
        saveProgress(storage, withOnboarding(readProgress(storage), resolved));
        if (outcome === 'saved') show(resolved);
        final = resolved;
      }
    }
    // "skip for now" keeps what was saved: the account fills in the device, but nothing is sent back.
    if (outcome === 'skipped') return setAccountSave('done');
    const send = async () => {
      setAccountSave('pending');
      const result = await saveSetupToAccount(known.db, {
        plans: known.plans,
        deviceBefore,
        after: withOnboarding(emptyProgress(), final).onboarding,
        clearedDate: acted.examDate && !final.examDate,
        today: localDay(new Date()),
      });
      if (result.status !== 'unchanged') setSyncNote(result.message);
      // Only a failed connection is worth another try; the other refusals would give the same answer again.
      const retry = result.status === 'failed' &&
        (result.message === SYNC_MESSAGES.failed || result.message === SYNC_MESSAGES.removeFailed);
      retrySave.current = () => {
        setSyncNote('');
        void send();
        resultRef.current?.focus();
      };
      setAccountSave(retry ? 'retry' : 'done');
    };
    await send();
  };

  const focusQuestion = (next: 0 | 1) => {
    setStep(next);
    requestAnimationFrame(() => {
      (next === 0 ? courseLegendRef.current : dateHeadingRef.current)?.focus();
    });
  };

  const finish = (done: ScreenAnswers, outcome: 'saved' | 'skipped', acted: Touched = touched.current) => {
    const before = readProgress(storage).onboarding;
    const next = withOnboarding(readProgress(storage), done);
    const kept = saveProgress(storage, next);
    finished.current = true;
    setSyncNote('');
    setAccountSave(kept ? 'pending' : 'done');
    setResult(kept ? outcome : 'not-kept');
    requestAnimationFrame(() => resultRef.current?.focus());
    if (kept) void saveToAccount(before, done, { ...acted }, outcome).catch(() => setAccountSave('done'));
  };

  const saveAnswers = () => {
    if (examDate && !isExamDate(examDate)) {
      setDateProblem('that date doesn’t look right. use the date picker, or leave it blank.');
      dateRef.current?.focus();
      return;
    }
    setDateProblem('');
    finish(answers.current, 'saved');
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step === 0) focusQuestion(1);
    else saveAnswers();
  };

  const skipQuestion = () => {
    if (step === 0) {
      // Only this answer is cleared. The exam-date answer stays in state.
      changeCourse('');
      focusQuestion(1);
    } else {
      changeExamDate('');
      setDateProblem('');
      finish(answers.current, 'saved');
    }
  };

  const skipForNow = () => {
    // Read when clicked, not when the form mounted. A second tab may have
    // forgotten all progress while this screen stayed open.
    // Nothing on this screen counts as answered, so the account only fills in, never clears.
    const fresh = readProgress(storage).onboarding;
    finish({ course: fresh.course ?? '', examDate: fresh.examDate ?? '' }, 'skipped', { course: false, examDate: false });
  };

  if (result) {
    const summary =
      result === 'not-kept'
        ? 'this browser isn’t letting cueory save anything, so your answers weren’t kept. you can still study.'
        : result === 'skipped'
          ? 'skipped. you can answer any time from your progress page.'
          : [
              course ? `course: ${COURSES.find((c) => c.id === course)?.label ?? course}.` : 'no course picked.',
              examDate ? `exam: ${examDateWords(examDate)}.` : 'no exam date.',
            ].join(' ');
    return (
      <div ref={resultRef} tabIndex={-1} aria-live="polite">
        <p className="text-lg">{result === 'saved' ? 'saved on this device.' : 'all set.'}</p>
        <p className="mt-2 text-ink-soft">{summary}</p>
        {accountSave === 'pending' && <p className="mt-2 text-ink-soft" data-testid="exam-sync-pending">saving to your account…</p>}
        {syncNote && <p className="mt-2 text-ink-soft" data-testid="exam-sync">{syncNote}</p>}
        {accountSave === 'retry' && (
          <button type="button" className={`${quietButton} mt-2`} onClick={() => retrySave.current()}>try saving again</button>
        )}
        {accountSave !== 'pending' && (
          <ul className="mt-stack space-y-2">
            <li><a href="/learn/study-skills">start studying</a></li>
            <li><a href="/progress">see what’s saved on this device</a></li>
          </ul>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-stack">
      {syncNote && <p className="text-sm text-ink-soft" role="status" data-testid="exam-sync">{syncNote}</p>}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-ink-soft" aria-live="polite" data-testid="setup-step">
          question {step + 1} of {TOTAL_QUESTIONS}
        </p>
        <div aria-hidden="true" className="flex items-center gap-2">
          {[0, 1].map((index) => (
            <span
              key={index}
              className={`block size-3 rounded-pill ${step === index ? 'bg-ink' : 'bg-soft'}`}
            />
          ))}
        </div>
      </div>

      {step === 0 ? (
        <fieldset
          className="space-y-4"
          onKeyDown={(event) => {
            // Enter advances from a selected radio. Arrow keys continue to
            // change the selection using the browser's normal radio behavior.
            if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type === 'radio') {
              event.preventDefault();
              focusQuestion(1);
            }
          }}
        >
          <legend ref={courseLegendRef} tabIndex={-1} className="text-xl font-medium">
            which course are you studying for?
          </legend>
          <p className="text-sm text-ink-soft">optional.</p>
          <div className="grid gap-3">
            {[...COURSES, { id: '', label: 'not sure yet' }].map((option) => (
              <label
                key={option.id || 'none'}
                className={`flex min-h-14 cursor-pointer items-center gap-4 rounded-xl border p-4 ${
                  course === option.id ? 'border-button bg-surface' : 'border-control bg-page'
                }`}
              >
                <input
                  type="radio"
                  name="course"
                  value={option.id}
                  checked={course === option.id}
                  onChange={() => changeCourse(option.id)}
                  className="size-5 accent-button"
                />
                <span className="font-medium">{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <section className="space-y-4">
          <h2 ref={dateHeadingRef} tabIndex={-1} id="exam-question" className="text-xl font-medium">
            when is your exam?
          </h2>
          <p id="exam-date-help" className="text-sm text-ink-soft">
            optional. later, reviews will be paced to this date.
          </p>
          <input
            ref={dateRef}
            id="exam-date"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={examDate}
            onChange={(event) => { changeExamDate(event.currentTarget.value); setDateProblem(''); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                saveAnswers();
              }
            }}
            aria-labelledby="exam-question"
            aria-describedby={dateProblem ? 'exam-date-help exam-date-problem' : 'exam-date-help'}
            aria-invalid={dateProblem ? true : undefined}
            className="block min-h-14 w-full rounded-xl border border-control bg-page px-4 text-ink"
          />
          {dateProblem && <p id="exam-date-problem" className="text-sm" role="alert">{dateProblem}</p>}
          {examDate && (
            <button
              type="button"
              onClick={() => {
                changeExamDate('');
                setDateProblem('');
                // This button disappears after clearing; restore focus to the date field.
                dateRef.current?.focus();
              }}
              className={quietButton}
            >
              clear the date
            </button>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {step === 0 ? (
          <a href="/" className={quietButton}>back</a>
        ) : (
          <button type="button" onClick={() => focusQuestion(0)} className={quietButton}>back</button>
        )}
        <button type="button" onClick={skipQuestion} className={quietButton}>skip</button>
        <button type="submit" className={primaryButton}>
          {step === 0 ? 'continue' : 'save my answers'}
        </button>
      </div>
      <button type="button" onClick={skipForNow} className={`${quietButton} block`}>
        skip for now
      </button>
    </form>
  );
}
