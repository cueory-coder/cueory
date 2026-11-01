import { useRef, useState, type FormEvent } from 'react';
import { COURSES, examDateWords, isExamDate, readProgress, saveProgress, withOnboarding } from '../scripts/progress';
import { browserStorage } from '../scripts/storage';

const primaryButton = 'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';
const quietButton = 'min-h-11 rounded-pill px-3 py-2.5 text-ink-soft underline';

/**
 * Two optional setup questions (D-69): which course, and the exam date. Every question can be left blank, and "skip"
 * saves nothing but "done". Answers stay in this browser (src/scripts/progress.ts). Lowercase voice (D-47).
 * Rendered only in the browser (client:only); the page explains this without JavaScript.
 */
export default function Onboarding() {
  const [storage] = useState(browserStorage);
  const [saved] = useState(() => readProgress(storage).onboarding);
  const [course, setCourse] = useState<string>(saved.course ?? '');
  const [examDate, setExamDate] = useState(saved.examDate ?? '');
  const [dateProblem, setDateProblem] = useState('');
  const [result, setResult] = useState<'saved' | 'skipped' | 'not-kept' | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  const finish = (answers: { course: string; examDate: string }, outcome: 'saved' | 'skipped') => {
    const kept = saveProgress(storage, withOnboarding(readProgress(storage), answers));
    setResult(kept ? outcome : 'not-kept');
    requestAnimationFrame(() => resultRef.current?.focus());
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (examDate && !isExamDate(examDate)) {
      setDateProblem('that date doesn’t look right. use the date picker, or leave it blank.');
      dateRef.current?.focus();
      return;
    }
    setDateProblem('');
    finish({ course, examDate }, 'saved');
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
    <form onSubmit={submit} noValidate className="space-y-section">
      <fieldset>
        <legend className="text-lg">which course are you studying for?</legend>
        <p className="mt-1 text-sm text-ink-soft">optional.</p>
        <div className="mt-4 flex flex-col gap-2">
          {[...COURSES, { id: '', label: 'not sure yet' }].map((option) => (
            <label key={option.id || 'none'} className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                name="course"
                value={option.id}
                checked={course === option.id}
                onChange={() => setCourse(option.id)}
                className="size-4 accent-button"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="exam-date" className="text-lg">when is your exam?</label>
        <p id="exam-date-help" className="mt-1 text-sm text-ink-soft">
          optional. later, reviews will be paced to this date.
        </p>
        <input
          ref={dateRef}
          id="exam-date"
          type="date"
          min="2000-01-01"
          max="2100-12-31"
          value={examDate}
          onChange={(event) => setExamDate(event.currentTarget.value)}
          aria-describedby={dateProblem ? 'exam-date-help exam-date-problem' : 'exam-date-help'}
          aria-invalid={dateProblem ? true : undefined}
          className="mt-3 block min-h-11 rounded-md border border-control bg-page px-3 text-ink"
        />
        {dateProblem && <p id="exam-date-problem" className="mt-2 text-sm">{dateProblem}</p>}
        {examDate && (
          <button
            type="button"
            onClick={() => {
              setExamDate('');
              // This button disappears once the date is empty, so focus goes back to the date field.
              dateRef.current?.focus();
            }}
            className={`${quietButton} mt-2`}
          >
            clear the date
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={primaryButton}>save my answers</button>
        <button
          type="button"
          onClick={() => {
            // Re-read storage at click time so a cross-tab forget is not undone by stale mount-time answers.
            const fresh = readProgress(storage).onboarding;
            finish({ course: fresh.course ?? '', examDate: fresh.examDate ?? '' }, 'skipped');
          }}
          className={quietButton}
        >
          skip for now
        </button>
      </div>
    </form>
  );
}
