import { useEffect, useRef, useState } from 'react';
import {
  COURSES,
  PROGRESS_STORAGE_KEY,
  emptyProgress,
  examDateWords,
  exportProgress,
  forgetProgress,
  isEmptyProgress,
  localDay,
  legacyStarsKey,
  readProgress,
  saveProgress,
  withOnboarding,
} from '../scripts/progress';
import { browserStorage, type KeyValueStorage } from '../scripts/storage';
import { RESUME_STORAGE_KEY } from '../scripts/resume';
import { connectExamPlans, isConnectFailure, loadExamPlan, loadTickets } from './examplansync';
import ProgressRing from './ProgressRing';
import { examCountdown, progressView, readDeviceProgress } from './progressview';

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
 * Read only the exact device keys that a confirmed Forget will delete.
 * This must not call readDeviceProgress: that can migrate and remove legacy star keys.
 * A failed or incomplete scan cannot authorize an irreversible deletion.
 */
function savedProgressFingerprint(storage: KeyValueStorage | undefined): string | null {
  if (!storage) return null;
  try {
    const count = storage.length;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 ||
      typeof storage.key !== 'function') return null;
    const primary = storage.getItem(PROGRESS_STORAGE_KEY);
    const prefix = legacyStarsKey('');
    const legacy: [string, string][] = [];
    for (let index = 0; index < count; index++) {
      const key = storage.key(index);
      if (key === null) return null;
      if (!key.startsWith(prefix)) continue;
      const value = storage.getItem(key);
      if (value === null) return null;
      legacy.push([key, value]);
    }
    if (storage.length !== count) return null;
    legacy.sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify([primary, legacy]);
  } catch {
    return null;
  }
}


/**
 * What this browser keeps for the student (D-69), with "download my progress" and "forget my progress on this device".
 * Nothing here is sent anywhere. Rendered only in the browser (client:only).
 * Signed in (Task 145), the account's exam date is read on load and wins over the device's; it is only read here.
 */
export default function ProgressPanel({ decks }: Props) {
  const [storage] = useState(browserStorage);
  // Stars saved before D-69 move into the record first, so this page shows (and forgets) all of it.
  const [snapshot, setSnapshot] = useState(() => readDeviceProgress(storage));
  const [confirming, setConfirming] = useState(false);
  const [said, setSaid] = useState('');
  const forgetRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const resumeAtConfirmation = useRef<string | null>(null);
  const progressAtConfirmation = useRef<string | null>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const saidRef = useRef<HTMLParagraphElement>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [syncNote, setSyncNote] = useState('');
  // "forget my progress" cancels a load still on its way, so the account's answers aren't written back afterwards.
  const [loads] = useState(loadTickets);
  const canSyncProgress = snapshot.state !== 'unreadable' && !snapshot.recovered;

  useEffect(() => {
    if (!canSyncProgress) return;
    const current = loads.start();
    let live = true;
    void (async () => {
      const db = await connectExamPlans();
      if (!db || isConnectFailure(db) || !live) return;
      setSignedIn(true);
      if (!current()) return;
      const loaded = await loadExamPlan(db, () => readProgress(storage).onboarding);
      if (!live || !current()) return;
      if (!loaded.ok) setSyncNote(loaded.message);
      else if (loaded.onboarding) {
        // An in-flight account request must never replace partially damaged saved data.
        const latest = readDeviceProgress(storage);
        if (latest.state !== 'unreadable' && !latest.recovered &&
          saveProgress(storage, withOnboarding(latest.progress, loaded.onboarding))) {
          setSnapshot(readDeviceProgress(storage));
        }
      }
    })();
    return () => {
      live = false;
      loads.cancel();
    };
  }, [storage, loads, canSyncProgress]);

  // Studying in another tab changes what's saved. Read it again when another tab saves, and when this page comes back
  // into view, so the page, the download and "forget" always match what's actually kept.
  useEffect(() => {
    const refresh = () => setSnapshot(readDeviceProgress(storage));
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

  const { progress, state } = snapshot;
  const { course, examDate, done } = progress.onboarding;
  const view = progressView(progress, decks);
  const countdown = examCountdown(examDate, localDay(new Date()));

  const download = () => {
    // Read what's saved right now, not what this page showed when it opened.
    const current = readDeviceProgress(storage);
    setSnapshot(current);
    if (current.state !== 'ready') return;
    const blob = new Blob([exportProgress(current.progress, localDay(new Date()))], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cueory-${current.recovered ? 'recovered-' : ''}progress-${localDay(new Date())}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaid(current.recovered
      ? 'your readable progress is downloading. the original saved data stays on this device.'
      : 'your progress file is downloading.');
  };

  const forget = () => {
    // The final action also clears cueory-resume, which is not part of the Progress snapshot.
    // Check its raw bytes BEFORE readDeviceProgress, since readResume may discard invalid data.
    let resumeUnchanged = false;
    try {
      resumeUnchanged = Boolean(storage) && storage?.getItem(RESUME_STORAGE_KEY) === resumeAtConfirmation.current;
    } catch { /* Browser storage can become blocked between the two clicks. */ }
    if (!resumeUnchanged) {
      loads.cancel();
      setConfirming(false);
      setSaid('your saved study place changed or could not be checked. review it before choosing to forget it.');
      requestAnimationFrame(() => forgetRef.current?.focus());
      return;
    }
    // Compare original JSON and every old-star key before reading a progress snapshot.
    // Parsed progress can be identical even when a damaged record gained unknown data.
    // A readDeviceProgress call here could otherwise migrate and delete a newly added star key.
    const progressFingerprint = savedProgressFingerprint(storage);
    if (progressFingerprint === null || progressFingerprint !== progressAtConfirmation.current) {
      loads.cancel();
      setConfirming(false);
      setSaid('your saved progress changed or could not be checked. reload the page to review it before choosing to forget it.');
      requestAnimationFrame(() => forgetRef.current?.focus());
      return;
    }
    // The confirmation applies to the data the student actually reviewed. Another feature or
    // tab can update localStorage after it opens, including corrupt or recoverable records.
    // Same-document changes do not dispatch a "storage" event to this page.
    const latest = readDeviceProgress(storage);
    if (latest.state !== 'ready' || latest.recovered !== snapshot.recovered ||
      JSON.stringify(latest.progress) !== JSON.stringify(snapshot.progress)) {
      loads.cancel();
      setSnapshot(latest);
      setConfirming(false);
      setSaid(latest.state === 'unreadable'
        ? ''
        : 'your saved progress changed. review it before choosing to forget it.');
      requestAnimationFrame(() => {
        if (latest.state === 'unreadable') retryRef.current?.focus();
        else if (latest.state === 'empty') saidRef.current?.focus();
        else forgetRef.current?.focus();
      });
      return;
    }
    loads.cancel();
    const ok = forgetProgress(storage, decks.map((deck) => deck.id));
    setConfirming(false);
    if (ok) setSnapshot({ progress: emptyProgress(), state: 'empty' });
    setSaid(ok ? 'done. your progress is no longer saved on this device.' : 'this browser didn’t let cueory clear it. try clearing this site’s data in your browser settings.');
    // The forget button is disabled once nothing is left, so focus goes to the message instead.
    requestAnimationFrame(() => (ok ? saidRef : forgetRef).current?.focus());
  };

  // Download has nothing to export without saved progress, but forget also clears a saved study place (Codex on #221).
  const noProgress = isEmptyProgress(progress);
  const empty = state === 'empty';

  return (
    <div>
      <p role="status" aria-live="polite" aria-atomic="true" data-testid="progress-state" className="sr-only">
        {state === 'unreadable'
          ? 'we couldn’t read your saved progress on this device.'
          : state === 'empty'
            ? 'no saved progress yet. choose where to start.'
            : snapshot.recovered
              ? 'some saved progress was recovered. the original stays on this device.'
              : 'your saved progress is ready.'}
      </p>
      {state === 'unreadable' && (
        <section aria-labelledby="progress-unreadable-heading" className="rounded-xl border border-line bg-surface p-5">
          <h2 id="progress-unreadable-heading" className="text-xl">we couldn’t read your progress</h2>
          <p className="mt-3 text-ink-soft">
            your progress stays on this device. we couldn’t read what this browser saved. please try again.
          </p>
          <p className="mt-3 text-ink-soft">
            if trying again doesn’t work, check that your browser allows website data. you can clear saved data
            for cueory.app in your browser settings, but that erases progress and other settings on this device.
          </p>
          <button ref={retryRef} type="button" onClick={() => setSnapshot(readDeviceProgress(storage))} className={`${primaryButton} mt-4`}>
            try again
          </button>
        </section>
      )}
      {snapshot.recovered && (
        <section aria-labelledby="progress-recovered-heading" className="mb-6 rounded-xl border border-line bg-surface p-5">
          <h2 id="progress-recovered-heading" className="text-xl">some saved progress was recovered</h2>
          <p className="mt-3 text-ink-soft">
            some saved fields could not be read. the readable parts are shown below. your original saved record
            and any older stars are unchanged on this device. download the readable parts before choosing to forget your progress.
          </p>
        </section>
      )}
      {state === 'empty' && (
        <section aria-labelledby="progress-empty-heading" className="mb-6 rounded-xl border border-line bg-surface p-5">
          <h2 id="progress-empty-heading" className="text-xl">your progress starts here</h2>
          <p className="mt-3 text-ink-soft">
            you haven’t saved any progress yet. start with a study-skills lesson or a daily game.
          </p>
          <nav aria-label="where to start" className="mt-4 flex flex-wrap gap-3">
            <a href="/learn/study-skills" className={`${secondaryButton} inline-flex items-center underline`}>study skills</a>
            <a href="/play" className={`${secondaryButton} inline-flex items-center underline`}>daily games</a>
          </nav>
        </section>
      )}
      {state !== 'unreadable' && (
        <>
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
        {syncNote && <p className="mt-3 text-ink-soft" role="status" data-testid="exam-sync">{syncNote}</p>}
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
            <div className="mt-3 flex flex-wrap items-center gap-4">
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
            <li key={line.id} className="min-w-0 rounded-xl border border-line p-5">
              <h3 className="text-lg">{line.title}</h3>
              <div className="mt-3 flex flex-wrap items-center gap-4">
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
          {signedIn
            ? 'all of this is saved in this browser. an exam date you set is also saved to your account.'
            : 'all of this is saved in this browser only. cueory never receives it.'}
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
                try {
                  if (!storage) throw new Error('storage unavailable');
                  const resume = storage.getItem(RESUME_STORAGE_KEY);
                  const progressFingerprint = savedProgressFingerprint(storage);
                  if (progressFingerprint === null) throw new Error('saved progress unavailable');
                  resumeAtConfirmation.current = resume;
                  progressAtConfirmation.current = progressFingerprint;
                } catch {
                  setSaid('this browser could not check your saved progress and study place. try again.');
                  return;
                }
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
        </>
      )}
    </div>
  );
}
