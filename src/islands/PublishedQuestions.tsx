import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import QuestionsPlayer from './QuestionsPlayer';
import { setFlagItem } from './flagitem';
import { beginPublishedQuestionsRetry, describePublishedQuestions, openPublishedQuestions, type PublishedClient, type QuestionsView } from './publishedquestions';
import { getSupabase, sessionStateFrom } from './supabaseclient';

const link = 'inline-flex min-h-11 items-center rounded-sm underline underline-offset-4';
const button = 'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';

/**
 * Real, published questions for one concept (Task 172, D-33, D-86). The concept comes from `?concept=` in the address,
 * so one static page serves every concept and nothing about the question bank is in the built HTML. Answers are
 * checked only by check_answer on the server. Wire with client:only="react".
 */
export default function PublishedQuestions() {
  const [view, setView] = useState<QuestionsView | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const settledRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let cancelled = false;
    void openPublishedQuestions(
      window.location,
      () => getSupabase() as unknown as Promise<PublishedClient | null>,
      sessionStateFrom,
    ).then(next => {
      if (!cancelled) {
        setView(next);
        setRetrying(false);
      }
    }, () => {
      if (!cancelled) {
        setView({ view: 'failed' });
        setRetrying(false);
      }
    });
    return () => { cancelled = true; };
  }, [attempt]);

  const display = describePublishedQuestions(retrying ? beginPublishedQuestionsRetry(view) : view);
  const ready = view?.view === 'ready' ? view : undefined;
  // One remote object per load, so the player keeps its session while the student answers.
  const remote = useMemo(() => ready && { signedIn: true, transport: ready.transport, versions: ready.versions }, [ready]);
  const versionOf = useMemo(() => new Map(ready?.versions.map(version => [version.item_id, version.id])), [ready]);
  const onCurrent = useCallback((itemId: string | undefined) => {
    const itemVersionId = itemId && versionOf.get(itemId);
    setFlagItem(itemId && itemVersionId ? { itemId, itemVersionId } : undefined);
  }, [versionOf]);
  useEffect(() => () => setFlagItem(undefined), []);

  // The retry button stays focused while loading. Once it disappears after a successful retry,
  // focus the new result so keyboard and screen-reader users do not land on <body>.
  useLayoutEffect(() => {
    if (attempt > 0 && !retrying && view && view.view !== 'failed') {
      settledRef.current?.focus();
    }
  }, [attempt, retrying, view]);

  if (display.status === 'loading' && !retrying) {
    return <p role="status" data-testid="questions-loading" className="text-sm text-ink-soft">{display.message}</p>;
  }
  if (display.status === 'off') return <p ref={settledRef} tabIndex={-1} role="status" data-testid="questions-closed">{display.message}</p>;
  if (display.status === 'signed-out') {
    const next = encodeURIComponent(display.next);
    return (
      <p ref={settledRef} tabIndex={-1} role="status" data-testid="questions-signed-out">
        <a className={link} href={`/signin?next=${next}`}>sign in</a> to answer real questions, or{' '}
        <a className={link} href={`/signup?next=${next}`}>create a free account</a>.
      </p>
    );
  }
  if (display.status === 'empty') {
    return (
      <p ref={settledRef} tabIndex={-1} role="status" data-testid="questions-not-found">
        {display.message} <a className={link} href="/learn">back to the course library</a>
      </p>
    );
  }
  if (view?.view === 'failed' || !ready || !remote) {
    const retryLoading = retrying && view?.view === 'failed';
    return (
      <div>
        {retryLoading
          ? <p role="status" data-testid="questions-retry-loading">{display.status === 'loading' ? display.message : 'loading questions…'}</p>
          : <p role="alert">{display.status === 'failed' ? display.message : "couldn't load questions. please try again."}</p>}
        <button type="button" aria-disabled={retryLoading} className={`${button} mt-4`} onClick={() => {
          if (retryLoading) return;
          setRetrying(true);
          setAttempt(count => count + 1);
        }}>try again</button>
      </div>
    );
  }
  return (
    <div>
      <p ref={settledRef} tabIndex={-1} className="mb-6 text-sm font-medium text-ink-soft" data-testid="questions-concept">{ready.concept.title}</p>
      <QuestionsPlayer questions={ready.questions} remote={remote} onCurrent={onCurrent} />
    </div>
  );
}
