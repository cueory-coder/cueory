import { useRef, useState } from 'react';
import {
  COURSES,
  deckProgress,
  emptyProgress,
  examDateWords,
  exportProgress,
  forgetProgress,
  isEmptyProgress,
  localDay,
  readProgress,
} from '../scripts/progress';
import { browserStorage } from '../scripts/storage';

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
  const [progress, setProgress] = useState(() => readProgress(storage));
  const [confirming, setConfirming] = useState(false);
  const [said, setSaid] = useState('');
  const forgetRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const saidRef = useRef<HTMLParagraphElement>(null);

  const { course, examDate, done } = progress.onboarding;
  const deckLines = decks.flatMap((deck) => {
    const known = new Set(deck.cardIds);
    const saved = deckProgress(progress, deck.id);
    const count = (ids: string[]) => ids.filter((id) => known.has(id)).length;
    const [know, learning, starred] = [count(saved.know), count(saved.learning), count(saved.starred)];
    if (!know && !learning && !starred) return [];
    return [{ id: deck.id, title: deck.title, text: `${know} know it · ${learning} still learning · ${plural(starred, 'star', 'stars')}` }];
  });

  const download = () => {
    const blob = new Blob([exportProgress(progress, localDay(new Date()))], { type: 'application/json' });
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

  const empty = isEmptyProgress(progress);

  return (
    <div>
      <section aria-labelledby="answers-heading">
        <h2 id="answers-heading" className="text-xl">your setup answers</h2>
        {course || examDate ? (
          <ul className="mt-3 space-y-1">
            <li>course: {course ? COURSES.find((c) => c.id === course)!.label : 'not picked'}</li>
            <li>exam: {examDate ? examDateWords(examDate) : 'no date'}</li>
          </ul>
        ) : (
          <p className="mt-3 text-ink-soft">{done ? 'you skipped these.' : 'you haven’t answered them yet.'}</p>
        )}
        <p className="mt-3">
          <a href="/start">{course || examDate ? 'change your answers' : 'answer two quick questions'}</a>
        </p>
      </section>

      <section aria-labelledby="decks-heading" className="mt-section">
        <h2 id="decks-heading" className="text-xl">card decks</h2>
        {deckLines.length ? (
          <ul className="mt-3 space-y-2">
            {deckLines.map((line) => (
              <li key={line.id}>
                <span className="block">{line.title}</span>
                <span className="block text-sm text-ink-soft">{line.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-ink-soft">nothing saved yet. piles and stars from card decks show up here.</p>
        )}
      </section>

      <section aria-labelledby="yours-heading" className="mt-section">
        <h2 id="yours-heading" className="text-xl">it’s yours</h2>
        <p className="mt-3 text-ink-soft">
          all of this is saved in this browser only. cueory never receives it.
        </p>
        <div className="mt-stack flex flex-wrap gap-3">
          <button type="button" onClick={download} disabled={empty} className={`${primaryButton} disabled:opacity-50`}>
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
              forget your setup answers, piles and stars on this device? this can’t be undone. your light or dark pick stays.
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
