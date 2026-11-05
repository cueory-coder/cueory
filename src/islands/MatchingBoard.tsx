import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { attachResumeLifecycle, clearResume, readResume, saveResume, type ResumeDraft, type ResumeSnapshot } from '../scripts/resume';
import { browserStorage } from '../scripts/storage';
import ResumePrompt from './ResumePrompt';
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
  /** This page's own address, for the saved place (Task 300: every lesson has its own matching page). */
  page?: string;
}

const primaryButton = 'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover press';

const MATCHING_PAGE = '/learn/study-skills/matching';

/** The matching engine uses deck indices, not exposed card text, as its identifiers. */
function matchingDraft(state: MatchState, page: string): ResumeDraft | null {
  const total = state.terms.length;
  if (!total) return null;
  return {
    tool: 'matching', page, step: `round-${state.roundNumber}`,
    itemIndex: Math.min(matchedCount(state), total - 1), totalItems: total,
    // Store only the term/meaning IDs the student successfully paired, in attempt order.
    answers: Object.fromEntries(state.matchedTerms.map((term, i) =>
      [`term-${term}`, `meaning-${state.matchedMeanings[i]}`])),
    timer: null,
    phase: isRoundOver(state) && !hasNextRound(state) ? 'results' : 'working',
  };
}

/** Replay saved *student* pairs through the existing engine; reject stale or altered records. */
function restoreMatching(cards: readonly MatchCard[], snapshot: ResumeSnapshot, page: string): MatchState | null {
  if (snapshot.tool !== 'matching' || snapshot.page !== page) return null;
  const match = /^round-([1-9]\d*)$/.exec(snapshot.step ?? '');
  if (!match) return null;
  const roundNumber = Number(match[1]);
  let state = startMatching(cards);
  if (roundNumber > state.rounds.length || !Number.isSafeInteger(roundNumber)) return null;

  // Earlier rounds are complete if the student reached a later one. The engine's
  // own transitions preserve its duplicate-card and round-size rules.
  for (let round = 1; round < roundNumber; round++) {
    for (const index of state.terms) {
      state = pick(state, 'term', index);
      state = pick(state, 'meaning', index);
    }
    state = nextRound(state);
  }
  if (snapshot.totalItems !== state.terms.length || !state.terms.length) return null;
  for (const [termId, meaningId] of Object.entries(snapshot.answers)) {
    const term = /^term-(\d+)$/.exec(termId);
    const meaning = typeof meaningId === 'string' ? /^meaning-(\d+)$/.exec(meaningId) : null;
    if (!term || !meaning) return null;
    const termIndex = Number(term[1]);
    const meaningIndex = Number(meaning[1]);
    if (!state.terms.includes(termIndex) || !state.meanings.includes(meaningIndex)) return null;
    state = pick(state, 'term', termIndex);
    state = pick(state, 'meaning', meaningIndex);
    if (!state.last?.correct) return null;
  }
  const draft = matchingDraft(state, page);
  if (!draft || draft.itemIndex !== snapshot.itemIndex ||
      draft.phase !== snapshot.phase || Object.keys(draft.answers).length !== Object.keys(snapshot.answers).length) return null;
  // Restoring is not a new match and must not trigger a success animation.
  return { ...state, last: null };
}

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
export default function MatchingBoard({ cards, page = MATCHING_PAGE }: Props) {
  const [state, setState] = useState<MatchState>(() => startMatching(cards));
  const [resumePending, setResumePending] = useState(() => {
    const stored = readResume(browserStorage());
    return stored?.tool === 'matching' && stored.page === page;
  });
  const [focusRequest, setFocusRequest] = useState(0);
  const statusRef = useRef<HTMLDivElement>(null);
  const progressFill = useRef<HTMLDivElement>(null);
  const itemButtons = useRef(new Map<string, HTMLButtonElement>());
  const latestDraft = useRef<ResumeDraft | null>(null);

  // The lifecycle callback must stay null until the student actually makes or
  // restores progress, so visiting another study mode cannot overwrite its save.
  useEffect(() => attachResumeLifecycle(browserStorage(), () => latestDraft.current), []);

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

  // Flush a confirmed match before paint, so immediately leaving the page still
  // remembers it. Incorrect attempts and unconfirmed selections are never saved.
  useLayoutEffect(() => {
    if (!state.last?.correct) return;
    const draft = matchingDraft(state, page);
    if (draft) {
      latestDraft.current = draft;
      saveResume(browserStorage(), draft);
    }
  }, [state.last]);

  // Advancing to a new round resets the round's progress in the saved snapshot.
  useLayoutEffect(() => {
    if (state.roundNumber === 1 || !latestDraft.current) return;
    const draft = matchingDraft(state, page);
    if (draft) {
      latestDraft.current = draft;
      saveResume(browserStorage(), draft);
    }
  }, [state.roundNumber]);

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
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches) return;
    const frames: Keyframe[] = [{ opacity: 0.75, transform: 'scale(0.97)' }, { opacity: 1, transform: 'scale(1)' }];
    const animations: Animation[] = [];
    for (const side of ['term', 'meaning'] as const) {
      const animation = itemButtons.current.get(`${side}-${side === 'term' ? last.term : last.meaning}`)?.animate(frames, { duration, easing });
      if (animation) animations.push(animation);
    }
    const cancel = () => { for (const animation of animations) animation.cancel(); };
    const changed = () => { if (motion.matches) cancel(); };
    motion.addEventListener('change', changed);
    return () => {
      motion.removeEventListener('change', changed);
      cancel();
    };
  }, [state.last]);

  const newRound = (next: (s: MatchState) => MatchState) => {
    setState(next);
    setFocusRequest((n) => n + 1);
  };

  const restart = () => {
    setResumePending(false);
    latestDraft.current = null;
    clearResume(browserStorage());
    newRound(() => startMatching(cards));
  };

  const continueSaved = (snapshot: ResumeSnapshot) => {
    const restored = restoreMatching(cards, snapshot, page);
    if (!restored) {
      restart();
      return;
    }
    latestDraft.current = matchingDraft(restored, page);
    setResumePending(false);
    newRound(() => restored);
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
      <ResumePrompt page={page} onContinue={continueSaved} onStartOver={restart} />
      {/* An existing saved session needs an explicit continue/start-over choice. */}
      <div inert={resumePending}>
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
            <button type="button" onClick={restart} className={primaryButton}>
              Play again
            </button>
          )}
        </div>
      )}

      <p className="mt-section text-sm text-ink-soft">
        Pick a term, then the meaning that goes with it, in either order. There is no timer.
      </p>
      </div>
    </div>
  );
}
