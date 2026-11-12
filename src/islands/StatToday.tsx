import { useCallback, useEffect, useMemo, useState } from 'react';
import StatGame from './StatGame';
import { setFlagItem } from './flagitem';
import { remoteStatGrader } from './stat';
import { openDailyStat, type DailyStatClient, type DailyStatView } from './statdaily';
import { getSupabase, sessionStateFrom } from './supabaseclient';

const link = 'underline underline-offset-4';
const button = 'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';

/**
 * stat with today's real questions (content pipeline, docs/CONTENT-PIPELINE.md). Used only when
 * `statUsesRealQuestions` in src/config/games.ts is on. Nothing about the questions is in the built page: the day's
 * fifteen are fetched for a signed-in student (statdaily.ts), and every answer is checked by check_answer on the
 * server. Wire with client:only="react".
 */
export default function StatToday() {
  const [view, setView] = useState<DailyStatView | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setView(undefined);
    void openDailyStat(
      () => getSupabase() as unknown as Promise<DailyStatClient | null>,
      sessionStateFrom,
      new Date(),
    ).then(next => { if (!cancelled) setView(next); }, () => { if (!cancelled) setView({ view: 'failed' }); });
    return () => { cancelled = true; };
  }, [attempt]);

  const ready = view?.view === 'ready' ? view : undefined;
  // One grader per load, so the game keeps its round while the student plays.
  const grader = useMemo(() => {
    if (!ready) return undefined;
    try { return remoteStatGrader(ready.set.questions, ready.remote); }
    catch { return undefined; }
  }, [ready]);
  const versionOf = useMemo(() => new Map(ready?.set.versions.map(version => [version.item_id, version.id])), [ready]);
  const onCurrent = useCallback((itemId: string | undefined) => {
    const itemVersionId = itemId && versionOf.get(itemId);
    setFlagItem(itemId && itemVersionId ? { itemId, itemVersionId } : undefined);
  }, [versionOf]);
  useEffect(() => () => setFlagItem(undefined), []);

  if (!view) return <p className="text-sm text-ink-soft" role="status">loading today's set…</p>;
  if (view.view === 'off') return <p data-testid="stat-closed">today's set opens soon.</p>;
  if (view.view === 'signed-out') {
    const next = encodeURIComponent(view.next);
    return (
      <p data-testid="stat-signed-out">
        <a className={link} href={`/signup?next=${next}`}>create a free account</a> to play today's set, or{' '}
        <a className={link} href={`/signin?next=${next}`}>sign in</a>.
      </p>
    );
  }
  if (view.view === 'not-ready') return <p data-testid="stat-not-ready">today's set isn't ready yet. please check back soon.</p>;
  if (view.view === 'blocked') return <p data-testid="stat-blocked">{view.message}</p>;
  if (view.view === 'failed' || !ready || !grader) {
    return (
      <div>
        <p role="alert">today's set could not be loaded. please try again.</p>
        <button type="button" className={`${button} mt-4`} onClick={() => setAttempt(count => count + 1)}>try again</button>
      </div>
    );
  }
  return <StatGame questions={ready.set.questions} grader={grader} onCurrent={onCurrent} />;
}
