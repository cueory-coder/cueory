import { useEffect, useRef, useState } from 'react';
import { browserStorage } from '../scripts/storage';
import {
  back,
  counts,
  current,
  flip,
  isRoundOver,
  knowIt,
  loadStars,
  nextRound,
  order,
  reorderRest,
  saveStars,
  start,
  starredIndexes,
  stillLearning,
  toggleStar,
  type CardsState,
} from './cards';

interface Card {
  id: string;
  front: string;
  back: string;
}

interface Props {
  /** The deck's file name in content/cards, without .json. Stars are saved under it. */
  deckId: string;
  cards: Card[];
}

const primaryButton = 'rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';
const secondaryButton = 'rounded-pill border border-control px-5 py-2.5 text-ink disabled:opacity-50';

/** Outline when off, filled when on, so the state never depends on color. */
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
    >
      <path d="M12 2.95 L14.35 9.72 L21.51 9.86 L15.8 14.19 L17.88 21.05 L12 16.95 L6.12 21.05 L8.2 14.19 L2.49 9.86 L9.65 9.72 Z" />
    </svg>
  );
}

/**
 * Flashcards: show the answer, then sort the card into "Know it" or "Still learning". When a round is done, the next
 * round is just the "Still learning" pile. Shuffle, stars and "Only starred cards" sit above the card.
 * Every control is a real button or checkbox, so it works by tapping, clicking or keyboard. There is no flip animation.
 * Rendered only in the browser (client:only); without JavaScript the page shows its <noscript> list instead.
 */
export default function CardDeck({ deckId, cards }: Props) {
  const allCards = cards.map((_, i) => i);
  const [storage] = useState(browserStorage);
  const [starred, setStarred] = useState(() => loadStars(storage, deckId, cards.map((c) => c.id)));
  const [shuffle, setShuffle] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [state, setState] = useState<CardsState>(() => start(allCards));
  // Study actions move keyboard focus to the card; changing an option doesn't.
  const [focusRequest, setFocusRequest] = useState(0);
  const faceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusRequest > 0) faceRef.current?.focus();
  }, [focusRequest]);

  const act = (next: (s: CardsState) => CardsState) => {
    setState(next);
    setFocusRequest((n) => n + 1);
  };

  const cardsToStudy = (onlyStarred: boolean) =>
    order(onlyStarred && starred.size > 0 ? starredIndexes(cards, starred) : allCards, shuffle);

  const startOver = () => act(() => start(cardsToStudy(starredOnly)));

  const changeShuffle = (on: boolean) => {
    setShuffle(on);
    setState((s) => reorderRest(s, on));
  };

  const changeStarredOnly = (on: boolean) => {
    setStarredOnly(on);
    setState(start(cardsToStudy(on)));
  };

  const changeStar = (id: string) => {
    const next = toggleStar(starred, id);
    setStarred(next);
    saveStars(storage, deckId, next);
    if (next.size === 0) setStarredOnly(false);
  };

  const options = (
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={shuffle}
          onChange={(e) => changeShuffle(e.currentTarget.checked)}
          className="size-4 accent-button"
        />
        Shuffle
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={starredOnly && starred.size > 0}
          disabled={starred.size === 0}
          onChange={(e) => changeStarredOnly(e.currentTarget.checked)}
          className="size-4 accent-button disabled:opacity-50"
        />
        Only starred cards ({starred.size})
      </label>
    </div>
  );

  const tally = counts(state);

  if (isRoundOver(state)) {
    const allKnown = tally.learning === 0;
    return (
      <div>
        {options}
        <div ref={faceRef} tabIndex={-1} className="mt-stack">
          <p className="text-lg">{allKnown ? "That's every card for now." : `Round ${state.roundNumber} done.`}</p>
          <p className="mt-2 text-sm text-ink-soft">
            Know it: {tally.know} · Still learning: {tally.learning}
          </p>
        </div>
        <div className="mt-stack flex flex-wrap gap-3">
          {!allKnown && (
            <button type="button" onClick={() => act((s) => nextRound(s, shuffle))} className={primaryButton}>
              Study the {tally.learning} still learning
            </button>
          )}
          <button type="button" onClick={startOver} className={allKnown ? primaryButton : secondaryButton}>
            Start over
          </button>
        </div>
      </div>
    );
  }

  const card = cards[current(state)!]!;
  const isStarred = starred.has(card.id);
  const round = state.roundNumber > 1 ? `Round ${state.roundNumber} · ` : '';
  const position = `${round}Card ${state.pos + 1} of ${state.round.length}`;

  return (
    <div>
      {options}
      <div
        ref={faceRef}
        tabIndex={-1}
        aria-live="polite"
        className="mt-stack rounded-md border border-line bg-surface px-6 py-10"
      >
        <p className="text-sm text-ink-soft">{state.flipped ? 'Answer' : 'Question'}</p>
        <p data-testid="card-text" className="mt-2 text-xl">
          {state.flipped ? card.back : card.front}
        </p>
      </div>

      <div className="mt-stack flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          {position} · Know it: {tally.know} · Still learning: {tally.learning}
        </p>
        <button
          type="button"
          aria-pressed={isStarred}
          onClick={() => changeStar(card.id)}
          className="flex items-center gap-2 rounded-pill border border-control px-4 py-2 text-sm text-ink"
        >
          <StarIcon filled={isStarred} />
          Star
        </button>
      </div>

      <div className="mt-stack flex flex-wrap gap-3">
        {state.flipped ? (
          <>
            <button type="button" onClick={() => act(knowIt)} className={primaryButton}>
              Know it
            </button>
            <button type="button" onClick={() => act(stillLearning)} className={secondaryButton}>
              Still learning
            </button>
            <button type="button" onClick={() => act(flip)} className="rounded-pill px-3 py-2.5 text-ink-soft underline">
              Show question
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => act(flip)} className={primaryButton}>
              Show answer
            </button>
            <button type="button" onClick={() => act(back)} disabled={state.pos === 0} className={secondaryButton}>
              Back
            </button>
          </>
        )}
      </div>

      <p className="mt-section text-sm text-ink-soft">Your stars are saved in this browser only.</p>
    </div>
  );
}
