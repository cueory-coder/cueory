import { useEffect, useMemo, useRef, useState } from 'react';
import { dayLabel } from './daily';
import {
  HELLO_CATEGORIES,
  HELLO_CATEGORY_LABELS,
  HELLO_DEPTHS,
  HELLO_DEPTH_LABELS,
  type HelloDepth,
  isReflective,
  promptOfTheDay,
  nextStarter,
  startersFor,
  type HelloCategory,
  type HelloStarter,
} from './hellocards';

const faceClass =
  'col-start-1 row-start-1 flex min-h-56 min-w-0 flex-col items-center justify-center rounded-xl border border-line bg-surface px-6 py-10 text-center shadow-card sm:px-10';

/**
 * Flip-the-card conversation starters. The card is one real button: tap, click, Enter or Space turns it over
 * (aria-pressed says which side shows). Choices stay in memory only; nothing is scored, saved or sent.
 */
export default function HelloCards({ starters }: { starters: readonly HelloStarter[] }) {
  const [category, setCategory] = useState<HelloCategory>('patients');
  const [depth, setDepth] = useState<HelloDepth>('small');
  const [current, setCurrent] = useState<HelloStarter | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null);
  const today = useMemo(() => new Date(), []);
  const daily = useMemo(() => promptOfTheDay(starters, today, depth), [starters, today, depth]);

  // The first card is drawn after hydration so the server and browser never disagree about a random pick.
  useEffect(() => {
    const first = nextStarter(starters, 'patients', 'small', [], null);
    setCurrent(first.starter);
    setSeen(first.seen);
    setReady(true);
  }, [starters]);

  const draw = (nextCategory: HelloCategory, nextDepth: HelloDepth, history: string[], last: string | null) => {
    const result = nextStarter(starters, nextCategory, nextDepth, history, last);
    setCurrent(result.starter);
    setSeen(result.seen);
    setFlipped(false);
    return result.starter;
  };

  const choose = (next: HelloCategory) => {
    if (next === category) return;
    setCategory(next);
    draw(next, depth, [], null);
    setNotice(`${HELLO_CATEGORY_LABELS[next]} chosen. a new card is face down.`);
  };

  const chooseDepth = (next: HelloDepth) => {
    if (next === depth) return;
    setDepth(next);
    draw(category, next, [], null);
    setNotice(`${HELLO_DEPTH_LABELS[next]} chosen. a new card is face down.`);
  };

  const flip = () => {
    if (!current) return;
    const next = !flipped;
    setFlipped(next);
    setNotice(next ? `card turned over. ${isReflective(category) ? 'ask yourself' : 'try asking'}: ${current.text}` : 'card turned face down.');
  };

  const another = () => {
    draw(category, depth, seen, current?.id ?? null);
    setNotice('a new card is face down.');
    cardRef.current?.focus();
  };

  const count = startersFor(starters, category, depth).length;

  return (
    <div className="text-ink">
      {daily && (
        <section aria-labelledby="hello-daily-heading" className="mb-8 rounded-xl border-2 border-control bg-surface p-6 text-center shadow-card sm:p-8" data-testid="hello-daily">
          <h2 id="hello-daily-heading" className="text-sm font-bold">prompt of the day · {dayLabel(today)} · {HELLO_DEPTH_LABELS[depth]}</h2>
          <p className="mt-1 text-sm text-ink-soft">{isReflective(daily.category) ? 'a question for yourself' : `for ${HELLO_CATEGORY_LABELS[daily.category]}`}</p>
          <p className="mt-3 wrap-anywhere text-2xl" data-testid="hello-daily-text">{daily.text}</p>
        </section>
      )}
      <div role="group" aria-label="how deep" className="mb-4 flex flex-wrap gap-3" data-testid="hello-depth">
        {HELLO_DEPTHS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={depth === id}
            disabled={!ready}
            onClick={() => chooseDepth(id)}
            className="press min-h-(--tap-min) min-w-(--tap-min) rounded-pill border border-control px-5 py-2.5 text-ink aria-pressed:border-2 aria-pressed:bg-surface aria-pressed:font-bold disabled:opacity-60"
          >
            {depth === id && <span aria-hidden="true">✓ </span>}
            {HELLO_DEPTH_LABELS[id]}
          </button>
        ))}
      </div>
      <div role="group" aria-label="who is it for" className="flex flex-wrap gap-3">
        {HELLO_CATEGORIES.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={category === id}
            disabled={!ready}
            onClick={() => choose(id)}
            className="press min-h-(--tap-min) min-w-(--tap-min) rounded-pill border border-control px-5 py-2.5 text-ink aria-pressed:border-2 aria-pressed:bg-surface aria-pressed:font-bold disabled:opacity-60"
          >
            {category === id && <span aria-hidden="true">✓ </span>}
            {HELLO_CATEGORY_LABELS[id]}
          </button>
        ))}
      </div>

      <div className={`flip mt-stack${flipped ? ' is-flipped' : ''}`}>
        <button
          ref={cardRef}
          type="button"
          aria-pressed={flipped}
          aria-label="conversation card"
          aria-describedby="hello-card-hint"
          disabled={!ready || !current}
          onClick={flip}
          data-testid="hello-card"
          className="press block w-full cursor-pointer touch-manipulation rounded-xl text-left disabled:cursor-default"
        >
          <span className="flip-inner grid min-w-0 grid-cols-1">
            <span className={`flip-face ${faceClass}`} aria-hidden={flipped || undefined}>
              <span className="text-sm text-ink-soft">{HELLO_CATEGORY_LABELS[category]}</span>
              <span className="mt-3 text-xl font-bold">tap to turn over</span>
            </span>
            <span className={`flip-back relative ${faceClass}`} aria-hidden={!flipped || undefined} data-testid="hello-card-back">
              <span className="text-sm text-ink-soft">{isReflective(category) ? 'ask yourself' : 'try asking'}</span>
              <span className="mt-3 wrap-anywhere text-xl" data-testid="hello-card-text">{current?.text ?? ''}</span>
            </span>
          </span>
        </button>
      </div>
      <p id="hello-card-hint" className="mt-2 text-sm text-ink-soft">
        {flipped ? 'press the card again to turn it face down.' : 'press the card to turn it over.'}
      </p>

      <div className="mt-stack flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!ready || !current}
          onClick={another}
          className="press min-h-(--tap-min) rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover disabled:opacity-60"
        >
          next card
        </button>
        <p className="text-sm text-ink-soft">{count} cards in this pile, shuffled</p>
      </div>
      <p className="sr-only" role="status" aria-label="hello cards update" aria-atomic="true">{notice}</p>
      <noscript>
        <p>hello cards needs JavaScript to turn the cards over.</p>
      </noscript>
    </div>
  );
}
