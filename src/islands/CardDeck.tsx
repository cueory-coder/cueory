import { useEffect, useRef, useState } from 'react';
import { back, current, flip, gotIt, isDone, seeAgain, start } from './cards';

interface Card {
  id: string;
  front: string;
  back: string;
}

interface Props {
  cards: Card[];
}

/**
 * Shows a deck one card at a time: show the answer, then "Got it" or "See again".
 * Every control is a real button, so it works by tapping, clicking or keyboard. There is no flip animation.
 * Rendered only in the browser (client:only); without JavaScript the page shows its <noscript> list instead.
 */
export default function CardDeck({ cards }: Props) {
  const [state, setState] = useState(() => start(cards.length));
  const faceRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    faceRef.current?.focus();
  }, [state.pos, state.flipped]);

  if (isDone(state)) {
    return (
      <div>
        <p ref={faceRef} tabIndex={-1} className="text-lg">
          That's every card for now.
        </p>
        <button
          type="button"
          onClick={() => setState(start(cards.length))}
          className="mt-stack rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover"
        >
          Start over
        </button>
      </div>
    );
  }

  const card = cards[current(state)!]!;
  const remaining = state.queue.length - state.pos;

  return (
    <div>
      <div
        ref={faceRef}
        tabIndex={-1}
        aria-live="polite"
        className="rounded-md border border-line bg-surface px-6 py-10"
      >
        <p className="text-sm text-ink-soft">{state.flipped ? 'Answer' : 'Question'}</p>
        <p className="mt-2 text-xl">{state.flipped ? card.back : card.front}</p>
      </div>

      <p className="mt-stack text-sm text-ink-soft">
        Card {state.pos + 1} · {remaining} left
      </p>

      <div className="mt-stack flex flex-wrap gap-3">
        {state.flipped ? (
          <>
            <button
              type="button"
              onClick={() => setState(gotIt)}
              className="rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover"
            >
              Got it
            </button>
            <button
              type="button"
              onClick={() => setState(seeAgain)}
              className="rounded-pill border border-control px-5 py-2.5 text-ink"
            >
              See again
            </button>
            <button type="button" onClick={() => setState(flip)} className="rounded-pill px-3 py-2.5 text-ink-soft underline">
              Show question
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setState(flip)}
              className="rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover"
            >
              Show answer
            </button>
            <button
              type="button"
              onClick={() => setState(back)}
              disabled={state.pos === 0}
              className="rounded-pill border border-control px-5 py-2.5 text-ink disabled:opacity-50"
            >
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
