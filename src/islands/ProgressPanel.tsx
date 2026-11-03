import { useEffect, useRef, useState } from 'react';
import {
  COURSES,
  emptyProgress,
  examDateWords,
  exportProgress,
  forgetProgress,
  isEmptyProgress,
  localDay,
  migrateLegacyStars,
} from '../scripts/progress';
import { browserStorage } from '../scripts/storage';
import { readResume } from '../scripts/resume';
import ProgressRing from './ProgressRing';
import { examCountdown, progressView } from './progressview';

interface Deck {
  id: string;
  title: string;
  /** Card ids in the deck; saved ids no longer in it aren't counted. */
  cardIds: string[];
}

interface Props {
  decks: Deck[];
}

const primaryButton = 'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';
const secondaryButton = 'min-h-11 rounded-pill border border-control px-5 py-2.5 text-ink';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What this browser keeps for the student (D-69), with "download my progress" and "forget my progress on this device".
 * Nothing here is sent anywhere. Rendered only in the browser (client:only).
 */
export default function ProgressPanel({ decks }: Props) {
  const [storage] = useState(browserStorage);
  // Stars saved before D-69 move into the record first, so this page shows (and forgets) all of it.
  const [progress, setProgress] = useState(() => migrateLegacyStars(storage));
  const [confirming, setConfirming] = useState(false);
  const [said, setSaid] = useState('');
  const forgetRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const saidRef = useRef<HTMLParagraphElement>(null);

  // Studying in another tab changes what's saved. Read it again when another tab saves, and when this page comes back
  // into view, so the page, the download and "forget" always match what's actually kept.
  useEffect(() => {
    const refresh = () => setProgress(migrateLegacyStars(storage));
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [storage]);

  const { course, examDate, done } = progress.onboarding;
  const view = progressView(progress, decks);
  const countdown = examCountdown(examDate, localDay(new Date()));

  const download = () => {
    // Read what's saved right now, not what this page showed when it opened.
    const current = migrateLegacyStars(storage);
    setProgress(current);
    const blob = new Blob([exportProgress(current, localDay(new Date()))], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cueory-progress-${localDay(new Date())}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaid('your progress file is downloading.');
  };

  const forget = () => {
    const ok = forgetProgress(storage, decks.map((deck) => deck.id));
    setConfirming(false);
    if (ok) setProgress(emptyProgress());
    setSaid(ok ? 'done. your progress is no longer saved on this device.' : 'this browser didn’t let cueory clear it. try clearing this site’s data in your browser settings.');
    // The forget button is disabled once nothing is left, so focus goes to the message instead.
    requestAnimationFrame(() => (ok ? saidRef : forgetRef).current?.focus());
  };

  if (!storage) {
    return (
      <p className="text-lg">
        this browser isn’t letting cueory save anything (a private window or strict settings), so nothing is kept here.
      </p>
    );
  }

  // Download has nothing to export without saved progress, but forget also clears a saved study place (Codex on #221).
  const noProgress = isEmptyProgress(progress);
  const empty = noProgress && readResume(storage) === null;

  return (
    <div>
      <section aria-labelledby="answers-heading" className="rounded-xl border border-line bg-surface p-5">
        <h2 id="answers-heading" className="text-xl">your setup answers</h2>
        {course || examDate ? (
          <ul className="mt-3 space-y-1">
            <li>course: {course ? COURSES.find((c) => c.id === course)!.label : 'not picked'}</li>
            <li>exam: {examDate ? examDateWords(examDate) : 'no date'}</li>
          </ul>
        ) : (
          <p className="mt-3 text-ink-soft">{done ? 'you skipped these.' : 'you haven’t answered them yet.'}</p>
        )}
        {countdown && <p className="mt-3 text-ink-soft">{countdown}</p>}
        <p className="mt-3">
          <a href="/start">{course || examDate ? 'change your answers' : 'answer two quick questions'}</a>
        </p>
      </section>

      <section aria-labelledby="decks-heading" className="mt-section">
        <h2 id="decks-heading" className="text-xl">card decks</h2>
        {!view.hasSavedDecks && (
          <p className="mt-3 text-ink-soft">nothing saved yet. piles and stars from card decks show up here.</p>
        )}
        {view.overall.total > 0 && (
          <div className="mt-4 rounded-xl border border-line bg-surface p-5">
            <h3 className="text-lg">across current decks</h3>
            <div className="mt-3 flex items-center gap-4">
              <ProgressRing
                label="overall card progress"
                know={view.overall.know}
                learning={view.overall.learning}
                notStarted={view.overall.notStarted}
              />
              <p className="text-sm text-ink-soft">
                {view.overall.know} know it · {view.overall.learning} still learning · {view.overall.notStarted} not started
              </p>
            </div>
          </div>
        )}
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {view.decks.map((line) => (
            <li key={line.id} className="rounded-xl border border-line p-5">
              <h3 className="text-lg">{line.title}</h3>
              <div className="mt-3 flex items-center gap-4">
                {line.notStarted !== null && (
                  <ProgressRing
                    label={line.title}
                    know={line.know}
                    learning={line.learning}
                    notStarted={line.notStarted}
                  />
                )}
                <div>
                  <span className="block text-sm text-ink-soft">
                    {line.know} know it · {line.learning} still learning · {plural(line.starred, 'star', 'stars')}
                  </span>
                  <span className="mt-1 block text-sm text-ink-soft">
                    {line.notStarted === null ? 'not started: unknown for this retired deck' : <>{line.notStarted} not started</>}
                  </span>
                </div>
              </div>
              {!line.retired && (
                <a href="/learn" className="mt-3 inline-flex min-h-11 items-center underline">study now</a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="yours-heading" className="mt-section">
        <h2 id="yours-heading" className="text-xl">it’s yours</h2>
        <p className="mt-3 text-ink-soft">
          all of this is saved in this browser only. cueory never receives it.
        </p>
        <div className="mt-stack flex flex-wrap gap-3">
          <button type="button" onClick={download} disabled={noProgress} className={`${primaryButton} disabled:opacity-50`}>
            download my progress
          </button>
          {!confirming && (
            <button
              ref={forgetRef}
              type="button"
              disabled={empty}
              onClick={() => {
                setConfirming(true);
                setSaid('');
                requestAnimationFrame(() => confirmRef.current?.focus());
              }}
              className={`${secondaryButton} disabled:opacity-50`}
            >
              forget my progress on this device
            </button>
          )}
        </div>
        {confirming && (
          <div role="group" aria-labelledby="forget-question" className="mt-stack rounded-md border border-line bg-surface p-4">
            <p id="forget-question">
              forget your setup answers, piles, stars and where you stopped studying on this device? this can’t be undone. your light or dark pick stays.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button ref={confirmRef} type="button" onClick={forget} className={primaryButton}>
                yes, forget it
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  requestAnimationFrame(() => forgetRef.current?.focus());
                }}
                className={secondaryButton}
              >
                keep it
              </button>
            </div>
          </div>
        )}
        <p ref={saidRef} tabIndex={-1} className="mt-stack" aria-live="polite">{said}</p>
      </section>
    </div>
  );
}
