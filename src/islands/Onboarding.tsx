import { useRef, useState, type FormEvent } from 'react';
import { COURSES, examDateWords, isExamDate, readProgress, saveProgress, withOnboarding } from '../scripts/progress';
import { browserStorage } from '../scripts/storage';

const primaryButton = 'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';
const quietButton = 'min-h-11 rounded-pill px-3 py-2.5 text-ink-soft underline';
const TOTAL_QUESTIONS = 2;

/**
 * D-69's two optional answers, shown one question per screen (Task 108).
 * Navigation is local UI state. Only finishing writes cueory-progress, and
 * "skip for now" re-reads the current storage record to prevent restoring
 * answers forgotten in another tab.
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

  const focusQuestion = (next: 0 | 1) => {
    setStep(next);
    requestAnimationFrame(() => {
      (next === 0 ? courseLegendRef.current : dateHeadingRef.current)?.focus();
    });
  };

  const finish = (answers: { course: string; examDate: string }, outcome: 'saved' | 'skipped') => {
    const kept = saveProgress(storage, withOnboarding(readProgress(storage), answers));
    setResult(kept ? outcome : 'not-kept');
    requestAnimationFrame(() => resultRef.current?.focus());
  };

  const saveAnswers = () => {
    if (examDate && !isExamDate(examDate)) {
      setDateProblem('that date doesn’t look right. use the date picker, or leave it blank.');
      dateRef.current?.focus();
      return;
    }
    setDateProblem('');
    finish({ course, examDate }, 'saved');
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step === 0) focusQuestion(1);
    else saveAnswers();
  };

  const skipQuestion = () => {
    if (step === 0) {
      // Only this answer is cleared. The exam-date answer stays in state.
      setCourse('');
      focusQuestion(1);
    } else {
      setExamDate('');
      setDateProblem('');
      finish({ course, examDate: '' }, 'saved');
    }
  };

  const skipForNow = () => {
    // Read when clicked, not when the form mounted. A second tab may have
    // forgotten all progress while this screen stayed open.
    const fresh = readProgress(storage).onboarding;
    finish({ course: fresh.course ?? '', examDate: fresh.examDate ?? '' }, 'skipped');
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
        <ul className="mt-stack space-y-2">
          <li><a href="/learn/study-skills">start studying</a></li>
          <li><a href="/progress">see what’s saved on this device</a></li>
        </ul>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-stack">
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
                  onChange={() => setCourse(option.id)}
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
            onChange={(event) => { setExamDate(event.currentTarget.value); setDateProblem(''); }}
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
                setExamDate('');
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
