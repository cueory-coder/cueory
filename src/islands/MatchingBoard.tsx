import { useEffect, useRef, useState } from 'react';
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

const primaryButton = 'rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';

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
 * say so in words as well as looks. Rendered only in the browser (client:only); without JavaScript the page shows
 * its <noscript> note instead.
 */
export default function MatchingBoard({ cards }: Props) {
  const [state, setState] = useState<MatchState>(() => startMatching(cards));
  const [focusRequest, setFocusRequest] = useState(0);
  const statusRef = useRef<HTMLDivElement>(null);

  // A new round moves keyboard focus to the top of the board; picking items leaves focus where it is.
  useEffect(() => {
    if (focusRequest > 0) statusRef.current?.focus();
  }, [focusRequest]);

  const newRound = (next: (s: MatchState) => MatchState) => {
    setState(next);
    setFocusRequest((n) => n + 1);
  };

  const total = state.terms.length;
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
    const matched = (side === 'term' ? state.matchedTerms : state.matchedMeanings).includes(index);
    const picked = isPicked(state, side, index);
    const text = side === 'term' ? cards[index]!.front : cards[index]!.back;
    return (
      <li key={`${side}-${index}`}>
        <button
          type="button"
          onClick={() => setState((s) => pick(s, cards, side, index))}
          disabled={matched}
          aria-pressed={matched ? undefined : picked}
          className={`w-full rounded-md border px-4 py-3 text-left text-ink disabled:cursor-default disabled:text-ink-soft ${
            picked ? 'border-ink bg-surface' : 'border-control'
          }`}
        >
          {text}
          {matched && (
            <span className="mt-1 flex items-center gap-1 text-sm">
              <TickIcon />
              Matched
            </span>
          )}
          {picked && <span className="mt-1 block text-sm text-ink-soft">Picked</span>}
        </button>
      </li>
    );
  };

  return (
    <div>
      <div ref={statusRef} tabIndex={-1}>
        <p className="text-sm text-ink-soft">
          {roundCount(state) > 1 ? `Round ${state.roundNumber} of ${roundCount(state)} · ` : ''}
          Matched {matchedCount(state)} of {total} · Misses: {state.misses}
        </p>
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
