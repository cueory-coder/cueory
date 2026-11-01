import { useEffect, useRef, useState } from 'react';
import { cardKeyAction } from './cardkeys';
import { migrateLegacyStars, PROGRESS_STORAGE_KEY, saveSort, type Pile } from '../scripts/progress';
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

const primaryButton = 'press rounded-pill bg-button px-5 py-3 text-on-button hover:bg-button-hover inline-flex items-center gap-2';
const secondaryButton = 'press rounded-pill border border-control px-5 py-3 text-ink disabled:opacity-50 inline-flex items-center gap-2';

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

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

/**
 * Flashcards: show the answer, then sort the card into "Know it" or "Still learning". When a round is done, the next
 * round is just the "Still learning" pile. Shuffle, stars and "Only starred cards" sit above the card.
 * Every control is a real button or checkbox, so it works by tapping, clicking or keyboard.
 * Rendered only in the browser (client:only); without JavaScript the page shows its <noscript> list instead.
 */
export default function CardDeck({ deckId, cards }: Props) {
  const allCards = cards.map((_, i) => i);
  const [storage] = useState(() => {
    const found = browserStorage();
    migrateLegacyStars(found); // stars saved before D-69 move into the record (D-69)
    return found;
  });
  const [starred, setStarred] = useState(() => loadStars(storage, deckId, cards.map((c) => c.id)));
  const [shuffle, setShuffle] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);
  const [state, setState] = useState<CardsState>(() => start(allCards));
  // Study actions move keyboard focus to the card; changing an option doesn't.
  const [focusRequest, setFocusRequest] = useState(0);
  const [keysVisible, setKeysVisible] = useState(true);
  const faceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusRequest > 0) faceRef.current?.focus();
  }, [focusRequest]);

  // Inject the 3D flip CSS so the .flip/.flip-inner/.flip-face/.flip-back classes work before
  // Task 77's global.css is in staging. Once merged, this becomes harmless duplication.
  useEffect(() => {
    const id = 'cueory-card-flip';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = [
      '.flip{perspective:800px}',
      '.flip-inner{position:relative;transform-style:preserve-3d;transition:transform var(--duration-slow,400ms) var(--ease-soft,cubic-bezier(0.4,0,0.2,1))}',
      '.flip-face,.flip-back{backface-visibility:hidden;-webkit-backface-visibility:hidden;position:absolute;inset:0;border-radius:inherit;overflow:auto;display:flex;flex-direction:column;justify-content:center}',
      '.flip-back{transform:rotateY(180deg)}',
      '.flip-inner.is-flipped{transform:rotateY(180deg)}',
      '@media(prefers-reduced-motion:reduce){.flip-inner{transition:none}}',
      '@media(prefers-reduced-motion:reduce){.flip-inner:not(.is-flipped) .flip-back{opacity:0}}',
      '@media(prefers-reduced-motion:reduce){.flip-inner.is-flipped .flip-face{opacity:0}}',
    ].join('\n');
    document.head.appendChild(el);
  }, []);

  // Each "Know it" or "Still learning" is saved on this device (D-69). "Back" puts the card's previous pile back, so
  // this list holds the sorts made in the current round, newest last.
  const sorts = useRef<{ cardId: string; previous: Pile | null }[]>([]);

  // "Forget my progress" in another tab removes the record. An open deck must not write its old stars or undo history
  // back, so on that deletion it drops both (Codex on #74).
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      const wiped = event.key === null || (event.key === PROGRESS_STORAGE_KEY && event.newValue === null);
      if (!wiped) return;
      sorts.current = [];
      setStarred(new Set());
      setStarredOnly(false);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const act = (next: (s: CardsState) => CardsState) => {
    setState(next);
    setFocusRequest((n) => n + 1);
  };

  const sort = (pile: Pile) => {
    const index = current(state);
    if (index === undefined) return;
    const cardId = cards[index]!.id;
    sorts.current.push({ cardId, previous: saveSort(storage, deckId, cardId, pile) });
    act(pile === 'know' ? knowIt : stillLearning);
  };

  const goBack = () => {
    const undone = state.pos > 0 ? sorts.current.pop() : undefined;
    if (undone) saveSort(storage, deckId, undone.cardId, undone.previous);
    act(back);
  };

  const newRound = (next: (s: CardsState) => CardsState) => {
    sorts.current = [];
    act(next);
  };

  const cardsToStudy = (onlyStarred: boolean) =>
    order(onlyStarred && starred.size > 0 ? starredIndexes(cards, starred) : allCards, shuffle);

  const startOver = () => newRound(() => start(cardsToStudy(starredOnly)));

  const changeShuffle = (on: boolean) => {
    setShuffle(on);
    setState((s) => reorderRest(s, on));
  };

  const changeStarredOnly = (on: boolean) => {
    setStarredOnly(on);
    sorts.current = [];
    setState(start(cardsToStudy(on)));
  };

  const changeStar = (id: string) => {
    const next = toggleStar(starred, id);
    setStarred(next);
    saveStars(storage, deckId, next);
    if (next.size === 0) setStarredOnly(false);
  };

  // Keyboard shortcuts — Space flips, ← back, → advance (flip if question), 1/2 sort, S star.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const action = cardKeyAction(e);
      if (!action) return;
      if (isRoundOver(state)) return;
      switch (action) {
        case 'flip':
          e.preventDefault();
          act(flip);
          break;
        case 'back':
          if (state.pos > 0) { e.preventDefault(); goBack(); }
          break;
        case 'advance':
          e.preventDefault();
          if (!state.flipped) act(flip);
          break;
        case 'know':
          if (state.flipped) { e.preventDefault(); sort('know'); }
          break;
        case 'learning':
          if (state.flipped) { e.preventDefault(); sort('learning'); }
          break;
        case 'star': {
          e.preventDefault();
          const idx = current(state);
          if (idx !== undefined) changeStar(cards[idx]!.id);
          break;
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [state, starred, cards]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = (
    <div
      className="segmented mt-3 inline-flex items-center rounded-full border border-control bg-surface p-0.5 text-sm"
      role="group"
      aria-label="Study options"
    >
      <label className="segmented-option inline-flex min-h-9 cursor-pointer select-none items-center gap-1.5 rounded-full px-4 text-ink-soft">
        <input
          type="checkbox"
          checked={shuffle}
          onChange={(e) => changeShuffle(e.currentTarget.checked)}
          className="sr-only"
        />
        Shuffle
      </label>
      <label
        className={`segmented-option inline-flex min-h-9 select-none items-center gap-1.5 rounded-full px-4 text-ink-soft${starred.size > 0 ? ' cursor-pointer' : ' opacity-50'}`}
      >
        <input
          type="checkbox"
          checked={starredOnly && starred.size > 0}
          disabled={starred.size === 0}
          onChange={(e) => changeStarredOnly(e.currentTarget.checked)}
          className="sr-only"
        />
        <StarIcon filled={false} />
        Starred ({starred.size})
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
            <button type="button" onClick={() => newRound((s) => nextRound(s, shuffle))} className={primaryButton}>
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
  const progressValue = (state.pos + 1) / state.round.length;

  return (
    <div>
      {options}

      {/* 3D flip card — both faces always in DOM for the CSS perspective transform */}
      <div
        ref={faceRef}
        tabIndex={-1}
        aria-live="polite"
        className="flip mt-stack rounded-xl"
        style={{ boxShadow: 'var(--shadow-card)', cursor: 'pointer', minHeight: '14rem' }}
        onClick={() => act(flip)}
        aria-label={state.flipped ? 'Answer — click to flip back' : 'Question — click to see answer'}
      >
        <div className={`flip-inner${state.flipped ? ' is-flipped' : ''}`}>
          <div className="flip-face px-8 py-10 rounded-xl border border-line bg-surface" aria-hidden={state.flipped || undefined}>
            <p className="text-sm text-ink-soft">Question</p>
            <p data-testid="card-text" className="mt-3 text-xl">{card.front}</p>
          </div>
          <div className="flip-back px-8 py-10 rounded-xl border border-line bg-surface" aria-hidden={!state.flipped || undefined}>
            <p className="text-sm text-ink-soft">Answer</p>
            <p className="mt-3 text-xl">{card.back}</p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="progress-track mt-4 h-2 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={state.pos + 1}
        aria-valuemin={1}
        aria-valuemax={state.round.length}
        aria-label={position}
      >
        <div
          className="progress-fill h-full rounded-full bg-ink"
          style={{ transform: `scaleX(${progressValue})`, transformOrigin: 'left center' } as React.CSSProperties}
        />
      </div>

      <div className="mt-stack flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">{position} · Know: {tally.know} · Learning: {tally.learning}</p>
        <button
          type="button"
          aria-pressed={isStarred}
          onClick={() => changeStar(card.id)}
          className="flex items-center gap-2 rounded-pill border border-control px-4 py-2 text-sm text-ink"
        >
          <StarIcon filled={isStarred} />
          {isStarred ? 'Starred' : 'Star'}
        </button>
      </div>

      <div className="mt-stack flex flex-wrap gap-3">
        {state.flipped ? (
          <>
            <button type="button" onClick={() => sort('know')} className={primaryButton}>
              <CheckIcon />
              Know it
            </button>
            <button type="button" onClick={() => sort('learning')} className={secondaryButton}>
              <RepeatIcon />
              Still learning
            </button>
            <button
              type="button"
              onClick={() => act(flip)}
              className="rounded-pill px-3 py-2.5 text-ink-soft underline"
            >
              Show question
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => act(flip)} className={primaryButton}>
              Show answer
            </button>
            <button type="button" onClick={goBack} disabled={state.pos === 0} className={secondaryButton}>
              Back
            </button>
          </>
        )}
      </div>

      {keysVisible && (
        <p className="mt-stack flex items-center gap-3 text-sm text-ink-soft">
          <span>Space flip · ← back · → advance · 1 know · 2 learning · S star</span>
          <button
            type="button"
            aria-label="Dismiss keyboard hint"
            onClick={() => setKeysVisible(false)}
            className="shrink-0 rounded px-1 text-ink-soft hover:text-ink"
          >
            ✕
          </button>
        </p>
      )}

      <p className="mt-section text-sm text-ink-soft">
        Your piles and stars are saved in this browser only. <a href="/progress">See or clear them</a>.
      </p>
    </div>
  );
}
