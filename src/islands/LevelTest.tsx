import { useEffect, useRef, useState } from 'react';
import type { AdaptiveAttempt } from './adaptive';
import { chooseSampleAnswer, sampleLevelTestView } from './leveltestview';

/** Rendering only. The session lives in React memory, never storage or a remote service. */
export default function LevelTest() {
  const [attempts, setAttempts] = useState<AdaptiveAttempt[]>([]);
  const session = sampleLevelTestView(attempts);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousQuestion = useRef<string | null>(null);
  const key = session.current?.id ?? 'results';

  useEffect(() => {
    if (previousQuestion.current !== null && previousQuestion.current !== key) heading.current?.focus();
    previousQuestion.current = key;
  }, [key]);

  const choose = (choiceId: string) => {
    const question = session.current;
    if (question) setAttempts(previous => chooseSampleAnswer(previous, question.id, choiceId));
  };

  return (
    <section aria-labelledby="sample-level-test-heading" data-testid="level-test-preview"
      className="rounded-xl border border-line bg-surface p-5 sm:p-7">
      <p className="text-sm text-ink-soft">sample only · nothing saved</p>
      <p className="mt-2 text-ink-soft">{session.introduction}</p>
      <p role="status" aria-live="polite" data-testid="level-test-announcement" className="sr-only">
        {attempts.length === 0 ? '' : session.complete
          ? 'the sample is finished. results are below.'
          : 'sample choice recorded. next sample question.'}
      </p>
      {session.current ? (
        <div data-testid="level-test-question" className="mt-6">
          <h2 ref={heading} tabIndex={-1} id="sample-level-test-heading" className="text-xl font-semibold">
            sample question {session.questionNumber}
          </h2>
          <p className="mt-2 text-lg">{session.current.prompt}</p>
          <p className="mt-3 text-sm text-ink-soft">choose a sample option to continue.</p>
          <div role="group" aria-label="sample answer choices" className="mt-5 flex flex-col gap-3">
            {session.current.choices.map(choice => (
              <button key={choice.id} type="button" onClick={() => choose(choice.id)}
                className="min-h-(--tap-min) min-w-(--tap-min) rounded-xl border border-control bg-page px-5 py-3 text-left text-ink hover:bg-soft">
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div data-testid="level-test-results" className="mt-6">
          <h2 ref={heading} tabIndex={-1} id="sample-level-test-heading" className="text-xl font-semibold">
            sample results
          </h2>
          <p data-testid="level-test-result-words" className="mt-3">{session.resultWords}</p>
          <ul className="mt-5 space-y-3">
            {session.results.map(result => (
              <li key={result.concept} className="rounded-lg border border-line bg-page p-4">
                <h3 className="font-semibold">{result.concept}</h3>
                <p className="mt-2 text-ink-soft">{result.status}</p>
                <p className="mt-1 text-sm text-ink-soft">{result.description}</p>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-ink-soft">
            these sample results are not a real assessment and do not predict exam results.
          </p>
          <button type="button" onClick={() => setAttempts([])}
            className="mt-5 min-h-(--tap-min) min-w-(--tap-min) rounded-pill bg-button px-5 py-3 text-on-button hover:bg-button-hover">
            try the sample again
          </button>
        </div>
      )}
    </section>
  );
}
