import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import QuestionsPlayer from './QuestionsPlayer';
import {
  isSampleQuestionsPath, sampleQuestionsFailed, sampleQuestionsFromData, sampleQuestionsLoading,
  type SampleQuestionsView,
} from './questions';

const button = 'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';

/**
 * Loads only the public, labeled sample file after hydration. All parsing, states and scoring are
 * handled by pure helpers in questions.ts; real questions are never checked here.
 */
export default function QuestionsSample({ src }: { src: string }) {
  const [view, setView] = useState<SampleQuestionsView>(() => sampleQuestionsLoading(src));
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const resultRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let cancelled = false;
    setView(previous => attempt === 0 || previous.src !== src ? sampleQuestionsLoading(src) : previous);
    if (!isSampleQuestionsPath(src)) {
      setView(sampleQuestionsFailed(src));
      setRetrying(false);
      return;
    }

    void fetch(src, { credentials: 'same-origin' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('sample unavailable')))
      .then((data: unknown) => {
        if (cancelled) return;
        setView(sampleQuestionsFromData(src, data));
        setRetrying(false);
      })
      .catch(() => {
        if (cancelled) return;
        setView(sampleQuestionsFailed(src));
        setRetrying(false);
      });
    return () => { cancelled = true; };
  }, [src, attempt]);

  const shown = view.src === src ? view : sampleQuestionsLoading(src);
  useLayoutEffect(() => {
    // After retry, focus the new result instead of leaving keyboard focus on the removed button.
    if (attempt > 0 && !retrying && (shown.status === 'ready' || shown.status === 'empty')) {
      resultRef.current?.focus();
    }
  }, [attempt, retrying, shown]);

  if (shown.status === 'loading') {
    return <p role="status" data-testid="sample-questions-loading" className="text-sm text-ink-soft">{shown.message}</p>;
  }
  if (shown.status === 'failed') {
    return (
      <div>
        {retrying
          ? <p role="status" data-testid="sample-questions-retry-loading">{sampleQuestionsLoading(src).message}</p>
          : <p role="alert" data-testid="sample-questions-failed">{shown.message}</p>}
        <button type="button" className={`${button} mt-4`} aria-disabled={retrying} onClick={() => {
          if (retrying) return;
          setRetrying(true);
          setAttempt(value => value + 1);
        }}>try again</button>
      </div>
    );
  }
  if (shown.status === 'empty') {
    return <p ref={resultRef} tabIndex={-1} role="status" data-testid="sample-questions-empty">{shown.message}</p>;
  }
  return (
    <div data-testid="sample-questions-ready">
      <p ref={resultRef} tabIndex={-1} role="status" className="sr-only">sample questions ready.</p>
      <QuestionsPlayer questions={shown.questions} check={shown.check} />
    </div>
  );
}
