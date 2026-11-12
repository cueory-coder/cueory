import { useLayoutEffect, useRef, useState } from 'react';
import {
  adaptiveSampleConcepts, adaptiveSampleSummary, checkAdaptiveSample, chooseAdaptiveSample,
  currentAdaptiveSample, nextAdaptiveSample, startAdaptiveQuiz,
} from './adaptivequiz';

const button = 'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';

/** Pure local demo: UI only; selection, scoring, and progress live in adaptivequiz.ts. */
export default function AdaptiveQuiz() {
  const [session, setSession] = useState(startAdaptiveQuiz);
  const [restartCount, setRestartCount] = useState(0);
  const promptRef = useRef<HTMLLegendElement>(null);
  const finishedRef = useRef<HTMLParagraphElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const current = currentAdaptiveSample(session);
  const progress = adaptiveSampleConcepts(session);

  useLayoutEffect(() => {
    // Keep focus visible when checking, moving to the next item, finishing, or restarting.
    // The first page load intentionally does not steal focus from navigation.
    if (session.step === 'answered') resultRef.current?.focus();
    else if (session.step === 'finished') finishedRef.current?.focus();
    else if (session.attempts.length > 0 || restartCount > 0) promptRef.current?.focus();
  }, [session.step, session.current?.id, session.attempts.length, restartCount]);

  return (
    <div data-testid="adaptive-preview" className="mt-6 text-ink">
      <p className="text-sm text-ink-soft">five labeled sample questions. nothing is saved or sent.</p>
      {current && (
        <div className="mt-6 rounded-lg border border-line bg-page p-5 sm:p-8">
          <p className="text-sm text-ink-soft" data-testid="adaptive-count">
            sample question {session.attempts.length + (session.step === 'asking' ? 1 : 0)} of {session.questions.length}
          </p>
          <p className="mt-2 text-sm text-ink-soft" data-testid="adaptive-why">
            why this question: {session.current?.why}
          </p>
          <fieldset className="mt-4" disabled={session.step === 'answered'}>
            <legend ref={promptRef} tabIndex={-1} className="text-lg font-medium"
              data-testid="adaptive-question" data-question-id={current.id}>{current.prompt}</legend>
            <div className="mt-4 flex flex-col gap-3">
              {current.choices.map(choice => (
                <label key={choice.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-control px-4 py-3">
                  <input type="radio" name="adaptive-sample-choice" value={choice.id}
                    checked={session.picked === choice.id}
                    onChange={() => setSession(previous => chooseAdaptiveSample(previous, choice.id))} />
                  <span>{choice.text}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {session.step === 'asking' ? (
            <button type="button" className={button + ' mt-6'} disabled={!session.picked}
              onClick={() => setSession(checkAdaptiveSample)}>check sample answer</button>
          ) : (
            <div className="mt-5">
              <p ref={resultRef} tabIndex={-1} role="status" data-testid="adaptive-result" className="font-medium">
                {session.lastRight ? '✓ right.' : '✕ not quite.'}
              </p>
              <button type="button" className={button + ' mt-4'}
                onClick={() => setSession(nextAdaptiveSample)}>next sample question</button>
            </div>
          )}
        </div>
      )}
      {session.step === 'finished' && (
        <div className="mt-6 rounded-lg border border-line bg-page p-5 sm:p-8" data-testid="adaptive-finished">
          <p ref={finishedRef} tabIndex={-1} role="status" className="text-lg font-medium">
            preview finished. {adaptiveSampleSummary(session)}
          </p>
          <p className="mt-2 text-sm text-ink-soft">no sample questions left. this is practice, not an exam prediction.</p>
          <button type="button" className={button + ' mt-4'}
            onClick={() => {
              setSession(startAdaptiveQuiz());
              setRestartCount(count => count + 1);
            }}>start again</button>
        </div>
      )}
      {progress.length > 0 && (
        <section className="mt-8" aria-label="sample concept progress">
          <h2 className="text-lg">sample concept progress</h2>
          <ul className="mt-3 space-y-2">
            {progress.map(item => (
              <li key={item.id} className="rounded-md border border-line p-3">
                <span className="font-medium">{item.concept}</span>
                <span className="ml-2">{item.status}</span>
                <p className="text-sm text-ink-soft">{item.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
