import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  hasNextRound,
  isPicked,
  isRoundOver,
  matchedCount,
  nextRound,
  pick,
  roundCount,
  startMatching,
  type MatchCard,
  type MatchState,
  type Side,
} from './matching';

interface Props {
  cards: MatchCard[];
}

const primaryButton = 'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover press';

/** A tick, so a matched item never depends on color alone. */
function TickIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M4 12.5 L9.5 18 L20 6" />
    </svg>
  );
}

/**
 * Matching (D-44): pick a term, then the meaning that goes with it (or the other way round). Every item is a real
 * button, so it works by tapping, clicking or keyboard; there is no dragging and no timer. Picked and matched items
 * say so in words as well as looks, and focus stays on the button just used. Rendered only in the browser
 * (client:only); without JavaScript the page shows its <noscript> note instead.
 */
export default function MatchingBoard({ cards }: Props) {
  const [state, setState] = useState<MatchState>(() => startMatching(cards));
  const [focusRequest, setFocusRequest] = useState(0);
  const statusRef = useRef<HTMLDivElement>(null);
  const progressFill = useRef<HTMLDivElement>(null);
  const itemButtons = useRef(new Map<string, HTMLButtonElement>());

  // A new round moves keyboard focus to the top of the board; picking items leaves focus where it is.
  useEffect(() => {
    if (focusRequest > 0) statusRef.current?.focus();
  }, [focusRequest]);

  const total = state.terms.length;
  const matched = matchedCount(state);

  // Task 77's progress utility uses --progress on the fill element, not an inline width declaration.
  useLayoutEffect(() => {
    progressFill.current?.style.setProperty('--progress', String(total ? matched / total : 0));
  }, [matched, total]);

  // Animate only the two newly matched tiles; do not move/remove them or disturb keyboard focus.
  useEffect(() => {
    const last = state.last;
    if (!last?.correct) return;
    const rootStyles = getComputedStyle(document.documentElement);
    const durationValue = rootStyles.getPropertyValue('--duration-base').trim();
    const amount = Number.parseFloat(durationValue);
    const duration = durationValue.endsWith('ms') ? amount : durationValue.endsWith('s') ? amount * 1000 : 0;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const easing = rootStyles.getPropertyValue('--ease-soft').trim() || 'ease';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frames: Keyframe[] = reduced
      ? [{ opacity: 0.75 }, { opacity: 1 }]
      : [{ opacity: 0.75, transform: 'scale(0.97)' }, { opacity: 1, transform: 'scale(1)' }];
    for (const side of ['term', 'meaning'] as const) {
      itemButtons.current.get(`${side}-${side === 'term' ? last.term : last.meaning}`)?.animate(frames, {
        duration,
        easing,
      });
    }
  }, [state.last]);

  const newRound = (next: (s: MatchState) => MatchState) => {
    setState(next);
    setFocusRequest((n) => n + 1);
  };

  const over = isRoundOver(state);
  const last = state.last;
  const message = last
    ? last.correct
      ? `Matched: ${cards[last.term]!.front}`
      : 'Not a match. Try again.'
    : state.picked
      ? `Picked: ${state.picked.side === 'term' ? cards[state.picked.index]!.front : cards[state.picked.index]!.back}`
      : '';

  const item = (side: Side, index: number) => {
    const isMatched = (side === 'term' ? state.matchedTerms : state.matchedMeanings).includes(index);
    const picked = isPicked(state, side, index);
    const text = side === 'term' ? cards[index]!.front : cards[index]!.back;
    const key = `${side}-${index}`;
    return (
      <li key={key}>
        <button
          ref={(element) => {
            if (element) itemButtons.current.set(key, element);
            else itemButtons.current.delete(key);
          }}
          type="button"
          onClick={() => setState((s) => pick(s, side, index))}
          // aria-disabled rather than disabled: a matched button keeps keyboard focus, so the focus ring never
          // vanishes after a match. pick() ignores matched items.
          aria-disabled={isMatched || undefined}
          aria-pressed={isMatched ? undefined : picked}
          className={`min-h-11 w-full rounded-md border bg-page px-4 py-3 text-left text-ink shadow-card aria-disabled:cursor-default ${
            isMatched ? 'border-control bg-surface' : 'lift press'
          } ${picked ? 'border-ink bg-surface outline outline-2 outline-ink' : 'border-control'}`}
        >
          {text}
          {isMatched && (
            <span className="mt-1 flex items-center gap-1 text-sm">
              <TickIcon />
              Matched
            </span>
          )}
          {picked && <span className="mt-1 block text-sm text-ink-soft">selected</span>}
        </button>
      </li>
    );
  };

  return (
    <div>
      <div ref={statusRef} tabIndex={-1}>
        <p className="text-sm text-ink-soft">
          {roundCount(state) > 1 ? `Round ${state.roundNumber} of ${roundCount(state)} · ` : ''}
          Matched {matched} of {total} · Misses: {state.misses}
        </p>
        <div
          role="progressbar"
          aria-label="matching progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={matched}
          aria-valuetext={`${matched} of ${total} matched`}
          className="progress-track mt-2"
        >
          <div ref={progressFill} className="progress-fill" aria-hidden="true" />
        </div>
        <p aria-live="polite" className="mt-2 min-h-6 text-lg">
          {over ? `All ${total} matched.` : message}
        </p>
      </div>

      <div className="mt-stack grid gap-stack sm:grid-cols-2">
        <section aria-labelledby="terms-heading">
          <h2 id="terms-heading" className="text-sm text-ink-soft">
            Terms
          </h2>
          <ul className="mt-2 space-y-3">{state.terms.map((i) => item('term', i))}</ul>
        </section>
        <section aria-labelledby="meanings-heading">
          <h2 id="meanings-heading" className="text-sm text-ink-soft">
            Meanings
          </h2>
          <ul className="mt-2 space-y-3">{state.meanings.map((i) => item('meaning', i))}</ul>
        </section>
      </div>

      {over && (
        <div className="mt-stack">
          {hasNextRound(state) ? (
            <button type="button" onClick={() => newRound((s) => nextRound(s))} className={primaryButton}>
              Next round
            </button>
          ) : (
            <button type="button" onClick={() => newRound(() => startMatching(cards))} className={primaryButton}>
              Play again
            </button>
          )}
        </div>
      )}

      <p className="mt-section text-sm text-ink-soft">
        Pick a term, then the meaning that goes with it, in either order. There is no timer.
      </p>
    </div>
  );
}
