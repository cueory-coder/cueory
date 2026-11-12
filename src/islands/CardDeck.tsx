import { useEffect, useRef, useState } from 'react';
import { cardKeyAction } from './cardkeys';
import { CARD_ROUND_KEY as ROUND_KEY, restoreCardRound } from './cardresume';
import { migrateLegacyStars, pileOf, PROGRESS_STORAGE_KEY, readProgress, saveSort, type Pile } from '../scripts/progress';
import { browserStorage, type KeyValueStorage } from '../scripts/storage';
import {
  attachResumeLifecycle, clearResume, readResume, saveResume, type ResumeAnswer, type ResumeDraft,
} from '../scripts/resume';
import ResumePrompt from './ResumePrompt';
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

const RESUME_PAGE = '/learn/study-skills/cards';

// resume.ts allows at most 50 strings of 500 characters in one answer; the IDs are packed space-separated into chunks.
const CHUNK_TEXT = 500;
const MAX_CHUNKS = 50;

function packIds(ids: readonly string[]): string[] | null {
  const chunks: string[] = [];
  let chunk = '';
  for (const id of ids) {
    if (!id || id.length > CHUNK_TEXT) return null;
    if (chunk && chunk.length + 1 + id.length > CHUNK_TEXT) {
      chunks.push(chunk);
      chunk = id;
    } else chunk = chunk ? `${chunk} ${id}` : id;
  }
  if (chunk) chunks.push(chunk);
  return chunks.length <= MAX_CHUNKS ? chunks : null;
}

/** Only the student's marks and the public sample card IDs; never the front or back of a card. */
function draftOf(state: CardsState, cards: readonly Card[], deckId: string, shuffle: boolean, starredOnly: boolean, page: string): ResumeDraft | null {
  if (!state.round.length) return null;
  const finished = isRoundOver(state);
  const itemIndex = finished ? state.round.length - 1 : state.pos;
  const roundIds = state.round.map((index) => cards[index]?.id ?? '');
  const itemId = roundIds[itemIndex];
  const packed = packIds(roundIds);
  if (!itemId || !packed) return null;
  const answers: Record<string, ResumeAnswer> = Object.fromEntries(
    roundIds.slice(0, state.pos).map((id, i) => [id, state.marks[i]!]));
  answers[ROUND_KEY] = packed;
  return {
    tool: 'cards', page, module: deckId,
    step: `r${state.roundNumber}-s${shuffle ? 1 : 0}-t${starredOnly ? 1 : 0}`,
    itemIndex, itemId, totalItems: state.round.length, answers, timer: null,
    phase: finished ? 'results' : 'working',
  };
}

/**
 * "Forget my progress" in another tab removes the piles. A deck that missed that tab's storage event must not write
 * the forgotten marks back, so it saves only while every marked card still has a saved pile (Codex on #221).
 */
function marksStillSaved(storage: KeyValueStorage | undefined, deckId: string, draft: ResumeDraft): boolean {
  const progress = readProgress(storage);
  return Object.keys(draft.answers).every((id) => id === ROUND_KEY || pileOf(progress, deckId, id) !== null);
}

interface Props {
  /** The deck's file name in content/cards, without .json. Stars are saved under it. */
  deckId: string;
  cards: Card[];
  /** This page's own address, for the saved place (Task 300: every lesson has its own cards page). */
  page?: string;
}

// Big, comfortable tap targets (at least 44 px, --tap-min) that press in slightly when tapped (.press, Task 77).
const primaryButton =
  'press inline-flex min-h-(--tap-min) items-center justify-center gap-2 rounded-pill bg-button px-6 py-3 text-on-button hover:bg-button-hover';
const secondaryButton =
  'press inline-flex min-h-(--tap-min) items-center justify-center gap-2 rounded-pill border border-control px-6 py-3 text-ink disabled:opacity-50';

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


function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** One key in the shortcuts hint. */
function Key({ children }: { children: string }) {
  return <kbd className="rounded-sm border border-line bg-surface px-1.5 font-body text-ink">{children}</kbd>;
}

/**
 * Flashcards: show the answer, then sort the card into "Know it" or "Still learning". When a round is done, the next
 * round is just the "Still learning" pile. Shuffle and "Only starred cards" sit above the card, stars beside it.
 * Every control is a real button or checkbox, so it works by tapping, clicking or keyboard. The card itself also
 * flips by tap, click, Enter or Space, and the keys in cardkeys.ts work anywhere on the page outside other controls.
 * Rendered only in the browser (client:only); without JavaScript the page shows its <noscript> list instead.
 */
export default function CardDeck({ deckId, cards, page = RESUME_PAGE }: Props) {
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
  const [hasAnswered, setHasAnswered] = useState(false);
  const [resumePending, setResumePending] = useState(() => {
    const saved = readResume(storage);
    return saved?.tool === 'cards' && saved.page === page && saved.module === deckId;
  });
  // Study actions move keyboard focus to the card; changing an option doesn't.
  const [focusRequest, setFocusRequest] = useState(0);
  const [keysHint, setKeysHint] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<ResumeDraft | null>(null);
  draftRef.current = !resumePending && hasAnswered ? draftOf(state, cards, deckId, shuffle, starredOnly, page) : null;
  useEffect(() => attachResumeLifecycle(storage, () => {
    const draft = draftRef.current;
    return draft && marksStillSaved(storage, deckId, draft) ? draft : null;
  }), [storage, deckId]);
  useEffect(() => {
    if (draftRef.current && marksStillSaved(storage, deckId, draftRef.current)) saveResume(storage, draftRef.current);
  }, [storage, state, deckId, shuffle, starredOnly, hasAnswered, resumePending]);

  useEffect(() => {
    if (focusRequest > 0) faceRef.current?.focus();
  }, [focusRequest]);

  // Each "Know it" or "Still learning" is saved on this device (D-69). "Back" puts the card's previous pile back, so
  // this list holds the sorts made in the current round, newest last.
  const sorts = useRef<{ cardId: string; previous: Pile | null }[]>([]);

  // "Forget my progress" in another tab removes the record and the saved place. An open deck must not write its old
  // stars or undo history back, so on that deletion it drops both and the stale resume offer (Codex on #74). This
  // round's forgotten marks are never saved again either: see marksStillSaved (Codex on #221).
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      const wiped = event.key === null || (event.key === PROGRESS_STORAGE_KEY && event.newValue === null);
      if (!wiped) return;
      sorts.current = [];
      draftRef.current = null;
      setStarred(new Set());
      setStarredOnly(false);
      setResumePending(false);
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
    setHasAnswered(true);
    setResumePending(false); // sorting instead of answering the offer starts fresh; this save replaces the old one
  };

  const goBack = () => {
    const undone = state.pos > 0 ? sorts.current.pop() : undefined;
    // A card sorted before a reload (or before another tab forgot the progress) has no undo entry: Back still moves to
    // it and takes it out of this round's tally, and its saved pile changes only when the student sorts it again.
    if (undone) saveSort(storage, deckId, undone.cardId, undone.previous);
    act(back);
  };

  const newRound = (next: (s: CardsState) => CardsState) => {
    sorts.current = [];
    act(next);
  };

  const cardsToStudy = (onlyStarred: boolean) =>
    order(onlyStarred && starred.size > 0 ? starredIndexes(cards, starred) : allCards, shuffle);

  const startOver = () => {
    clearResume(storage);
    setHasAnswered(false);
    newRound(() => start(cardsToStudy(starredOnly)));
  };

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

  // Keyboard shortcuts (cardkeys.ts). The listener is added once and always calls this render's handler, so it never
  // acts on an old card. Keys pressed in the header, footer or an open dialog belong to them, not to the deck.
  const onShortcut = (e: KeyboardEvent) => {
    if (e.defaultPrevented || isRoundOver(state)) return;
    const target = e.target;
    const inDeck = target === document.body || (target instanceof Node && !!rootRef.current?.contains(target));
    if (!inDeck) return;
    const action = cardKeyAction(e);
    if (!action) return;
    switch (action) {
      case 'flip':
        e.preventDefault();
        act(flip);
        break;
      case 'back':
        if (state.pos > 0) {
          e.preventDefault();
          goBack();
        }
        break;
      case 'advance':
        if (!state.flipped) {
          e.preventDefault();
          act(flip);
        }
        break;
      case 'know':
      case 'learning':
        if (state.flipped) {
          e.preventDefault();
          sort(action === 'know' ? 'know' : 'learning');
        }
        break;
      case 'star': {
        const index = current(state);
        if (index === undefined) break;
        e.preventDefault();
        changeStar(cards[index]!.id);
        break;
      }
    }
  };
  const shortcut = useRef(onShortcut);
  shortcut.current = onShortcut;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => shortcut.current(e);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  const roundOver = isRoundOver(state);
  const progress = roundOver ? 1 : (state.pos + 1) / Math.max(state.round.length, 1);

  // The bar's length is a CSS custom property set through the style object, never a style="" attribute, so the strict
  // style-src policy allows it (the pattern described with .progress-fill in global.css). It runs after every render
  // because the round-done screen draws a new bar element.
  useEffect(() => {
    fillRef.current?.style.setProperty('--progress', String(progress));
  });

  // Two independent switches styled as one pill (.segmented, Task 77). Each real checkbox covers its whole segment,
  // invisible, so a tap anywhere on it toggles it (the ThemePicker pattern). An "on" segment fills in and shows a check
  // mark, so the state never depends on color.
  const optionClass = 'segmented-option relative has-disabled:cursor-not-allowed has-disabled:opacity-50';
  // The checkbox covers its whole segment but draws nothing itself except the shared keyboard focus ring, so the
  // focused element shows its own outline (Task 74 sweep).
  const optionInput = 'absolute inset-0 cursor-pointer appearance-none rounded-pill bg-transparent disabled:cursor-not-allowed';
  const options = (
    <div className="segmented" role="group" aria-label="Study options">
      <label className={optionClass}>
        <input
          type="checkbox"
          checked={shuffle}
          onChange={(e) => changeShuffle(e.currentTarget.checked)}
          className={optionInput}
        />
        {shuffle && <CheckIcon />}
        <span>Shuffle</span>
      </label>
      <label className={optionClass}>
        <input
          type="checkbox"
          checked={starredOnly && starred.size > 0}
          disabled={starred.size === 0}
          onChange={(e) => changeStarredOnly(e.currentTarget.checked)}
          className={optionInput}
        />
        {starredOnly && starred.size > 0 ? <CheckIcon /> : <StarIcon filled={false} />}
        <span>Only starred cards ({starred.size})</span>
      </label>
    </div>
  );

  const progressBar = (label: string) => (
    <div
      className="progress-track mt-stack"
      role="progressbar"
      aria-label="Cards in this round"
      aria-valuemin={0}
      aria-valuemax={state.round.length}
      aria-valuenow={roundOver ? state.round.length : state.pos + 1}
      aria-valuetext={label}
    >
      <div ref={fillRef} className="progress-fill" />
    </div>
  );

  const tally = counts(state);

  // A saved place is offered above the deck, never instead of it: the deck stays usable, and sorting a card starts
  // fresh (its own save replaces the old one), so ignoring the offer never blocks studying.
  const resumeChoice = resumePending && (
    <div className="mb-stack">
      <ResumePrompt page={page} onContinue={snapshot => {
        const saved = restoreCardRound(snapshot, deckId, cards, page);
        sorts.current = [];
        if (saved) {
          setState(saved.state);
          setShuffle(saved.shuffle);
          setStarredOnly(saved.starredOnly);
          setHasAnswered(true);
        } else {
          clearResume(storage);
          setState(start(allCards));
          setShuffle(false);
          setStarredOnly(false);
          setHasAnswered(false);
        }
        setResumePending(false);
        setFocusRequest(n => n + 1);
      }} onStartOver={() => {
        sorts.current = [];
        setState(start(allCards));
        setShuffle(false);
        setStarredOnly(false);
        setHasAnswered(false);
        setResumePending(false);
        setFocusRequest(n => n + 1);
      }} />
    </div>
  );

  if (roundOver) {
    const allKnown = tally.learning === 0;
    return (
      <>
      {resumeChoice}
      <div ref={rootRef}>
        {options}
        {progressBar(`Round ${state.roundNumber} done`)}
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
      </>
    );
  }

  const card = cards[current(state)!]!;
  const isStarred = starred.has(card.id);
  const round = state.roundNumber > 1 ? `Round ${state.roundNumber} · ` : '';
  const position = `${round}Card ${state.pos + 1} of ${state.round.length}`;
  const face = 'col-start-1 row-start-1 flex min-h-56 min-w-0 flex-col justify-center rounded-xl border border-line bg-surface px-6 py-10 shadow-card sm:px-10';

  return (
    <>
    {resumeChoice}
    <div ref={rootRef}>
      {options}

      {/*
        The card (.flip, Task 77). Both sides stay in the page, stacked in one grid cell so the card is as tall as its
        longer side; the hidden side is aria-hidden. Under reduced motion the shared CSS swaps the sides with a fade
        instead of turning the card. The status line below is the deck's one live region.
      */}
      <div
        // A new card gets a fresh flip container, so the back never animates in with the next card's answer.
        key={`${state.roundNumber}:${state.pos}:${card.id}`}
        ref={faceRef}
        role="region"
        aria-label={state.flipped ? 'Answer' : 'Question'}
        tabIndex={0}
        onClick={() => act(flip)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) {
            e.preventDefault();
            act(flip);
          }
        }}
        className={`flip mt-stack cursor-pointer touch-manipulation rounded-xl${state.flipped ? ' is-flipped' : ''}`}
        data-testid="flashcard"
      >
        <div className="flip-inner grid min-w-0 grid-cols-1">
          <div className={`flip-face ${face}`} aria-hidden={state.flipped || undefined}>
            <p className="text-sm text-ink-soft">Question</p>
            <p data-testid="card-text" className="mt-3 wrap-anywhere text-xl">
              {card.front}
            </p>
          </div>
          <div className={`flip-back relative ${face}`} aria-hidden={!state.flipped || undefined}>
            <p className="text-sm text-ink-soft">Answer</p>
            <p className="mt-3 wrap-anywhere text-xl">{card.back}</p>
          </div>
        </div>
      </div>

      {progressBar(position)}

      <div className="mt-stack flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft" aria-live="polite" data-testid="card-status">
          {position} · Know it: {tally.know} · Still learning: {tally.learning}
          <span className="sr-only">{state.flipped ? ' · answer showing' : ''}</span>
        </p>
        <button
          type="button"
          aria-pressed={isStarred}
          onClick={() => changeStar(card.id)}
          className="press flex min-h-(--tap-min) items-center gap-2 rounded-pill border border-control px-4 py-2 text-sm text-ink aria-pressed:bg-surface"
        >
          <StarIcon filled={isStarred} />
          Star
        </button>
      </div>

      <div className="mt-stack flex flex-wrap gap-3">
        {state.flipped ? (
          <>
            <button type="button" onClick={() => sort('know')} className={`${primaryButton} grow sm:grow-0`}>
              <CheckIcon />
              Know it
            </button>
            <button type="button" onClick={() => sort('learning')} className={`${secondaryButton} grow sm:grow-0`}>
              <RepeatIcon />
              Still learning
            </button>
            <button
              type="button"
              onClick={() => act(flip)}
              className="min-h-(--tap-min) rounded-pill px-3 py-2.5 text-ink-soft underline"
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

      {keysHint && (
        <div className="mt-stack flex items-center gap-3 text-sm text-ink-soft" data-testid="card-keys">
          <p className="min-w-0 flex-1">
            Keys: <Key>Space</Key> flip · <Key>←</Key> <Key>→</Key> move · <Key>1</Key> know it · <Key>2</Key> still
            learning · <Key>S</Key> star
          </p>
          <button
            type="button"
            aria-label="Hide the keys hint"
            onClick={() => {
              setKeysHint(false);
              faceRef.current?.focus();
            }}
            className="inline-flex min-h-(--tap-min) min-w-(--tap-min) shrink-0 items-center justify-center rounded-pill text-ink-soft hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>
      )}

      <p className="mt-section text-sm text-ink-soft">
        Your piles and stars are saved in this browser only. <a href="/progress">See or clear them</a>.
      </p>
    </div>
    </>
  );
}
