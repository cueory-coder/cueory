import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  advance,
  canAdvance,
  choose,
  fillParts,
  isOver,
  masteredCount,
  overrule,
  reveal,
  startLearn,
  stepOf,
  submit,
  type LearnCard,
  type LearnState,
  type Step,
} from './learn';

interface Props {
  cards: LearnCard[];
}

const primaryButton = 'rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';
const secondaryButton = 'rounded-pill border border-control px-5 py-2.5 text-ink';

const stepLabel: Record<Step, string> = {
  see: 'New card',
  choose: 'Choose the answer',
  type: 'Type the answer',
  fill: 'Fill in the blank',
};

/** A tick or a cross next to the words, so right and wrong never depend on color. */
function ResultIcon({ correct }: { correct: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5}>
      {correct ? <path d="M4 12.5 L9.5 18 L20 6" /> : <path d="M6 6 L18 18 M18 6 L6 18" />}
    </svg>
  );
}

/**
 * Learn mode (D-43): each card is seen, then chosen from the deck's answers, then typed or filled in, and anything
 * missed comes back until every card is mastered. Every control is a real button or text field, so it works by
 * tapping, clicking or keyboard, and nothing moves on by itself. Rendered only in the browser (client:only); without
 * JavaScript the page shows its <noscript> note instead.
 */
export default function LearnSession({ cards }: Props) {
  const [state, setState] = useState<LearnState>(() => startLearn(cards));
  const [typed, setTyped] = useState('');
  // Every action moves keyboard focus to the card, so the next thing to do is right there.
  const [focusRequest, setFocusRequest] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (focusRequest > 0) cardRef.current?.focus();
  }, [focusRequest]);

  const act = (next: (s: LearnState) => LearnState) => {
    setState(next);
    setFocusRequest((n) => n + 1);
  };
  const moveOn = () => {
    setTyped('');
    act((s) => advance(s, cards));
  };
  const check = (e: FormEvent) => {
    e.preventDefault();
    act((s) => submit(s, cards, typed));
  };

  const total = cards.length;
  const mastered = masteredCount(state);

  if (isOver(state)) {
    return (
      <div>
        <div ref={cardRef} tabIndex={-1} className="rounded-md border border-line bg-surface px-6 py-10">
          <p className="text-xl">
            You know all {total} {total === 1 ? 'card' : 'cards'}.
          </p>
          <p className="mt-2 text-sm text-ink-soft">Each one was seen, chosen and recalled.</p>
        </div>
        <div className="mt-stack">
          <button type="button" onClick={() => act(() => startLearn(cards))} className={primaryButton}>
            Start again
          </button>
        </div>
      </div>
    );
  }

  const index = state.queue[0]!;
  const card = cards[index]!;
  const step = stepOf(state, cards)!;
  const result = state.result;
  const fill = step === 'fill' ? fillParts(card) : null;
  const expected = step === 'fill' ? card.blank! : card.back;

  return (
    <div>
      <p className="text-sm text-ink-soft">
        Mastered {mastered} of {total}
      </p>

      <div
        ref={cardRef}
        tabIndex={-1}
        aria-live="polite"
        className="mt-stack rounded-md border border-line bg-surface px-6 py-10"
      >
        <p data-testid="learn-step" className="text-sm text-ink-soft">
          {stepLabel[step]}
        </p>
        <p data-testid="learn-prompt" className="mt-2 text-xl">
          {card.front}
        </p>

        {step === 'see' && state.revealed && (
          <p className="mt-stack border-t border-line pt-stack text-lg">
            <span className="sr-only">Answer: </span>
            {card.back}
          </p>
        )}

        {fill && (
          <p className="mt-stack border-t border-line pt-stack text-lg">
            {fill.before}
            <span aria-hidden="true">______</span>
            <span className="sr-only">blank</span>
            {fill.after}
          </p>
        )}

        {result && (
          <div className="mt-stack border-t border-line pt-stack">
            <p className="flex items-center gap-2 text-lg">
              <ResultIcon correct={result.correct} />
              {result.overruled ? 'Counted as right.' : result.correct ? 'Correct.' : 'Not quite.'}
            </p>
            {!result.correct && (
              <p className="mt-2">
                <span className="text-ink-soft">The answer: </span>
                {expected}
              </p>
            )}
            {!result.correct && typeof result.given === 'string' && (
              <p className="mt-1 text-ink-soft">You wrote: {result.given}</p>
            )}
          </div>
        )}
      </div>

      {step === 'choose' && (
        <ul aria-label="Answers" className="mt-stack space-y-3">
          {state.choices.map((choice) => {
            const picked = result?.given === choice;
            const isAnswer = choice === index;
            const note = result ? (isAnswer ? 'The answer' : picked ? 'Your choice' : '') : '';
            return (
              <li key={choice}>
                <button
                  type="button"
                  onClick={() => act((s) => choose(s, cards, choice))}
                  disabled={result !== null}
                  aria-pressed={result ? picked : undefined}
                  className="w-full rounded-md border border-control px-5 py-3 text-left text-ink disabled:cursor-default"
                >
                  {cards[choice]!.back}
                  {note && <span className="block text-sm text-ink-soft">{note}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {(step === 'type' || step === 'fill') && !result && (
        <form onSubmit={check} className="mt-stack">
          <label htmlFor={inputId} className="block text-sm text-ink-soft">
            {step === 'fill' ? 'The missing words' : 'Your answer'}
          </label>
          <input
            id={inputId}
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.currentTarget.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="mt-2 w-full rounded-md border border-control bg-surface px-4 py-2.5 text-ink"
          />
          <button type="submit" disabled={typed.trim() === ''} className={`mt-stack ${primaryButton} disabled:opacity-50`}>
            Check
          </button>
        </form>
      )}

      <div className="mt-stack flex flex-wrap gap-3">
        {step === 'see' && !state.revealed && (
          <button type="button" onClick={() => act((s) => reveal(s, cards))} className={primaryButton}>
            Show answer
          </button>
        )}
        {canAdvance(state, cards) && (
          <button type="button" onClick={moveOn} className={primaryButton}>
            {step === 'see' ? 'Next card' : 'Continue'}
          </button>
        )}
        {result && !result.correct && (step === 'type' || step === 'fill') && (
          <button type="button" onClick={() => act((s) => overrule(s, cards))} className={secondaryButton}>
            I was right
          </button>
        )}
      </div>

      <p className="mt-section text-sm text-ink-soft">
        Anything you miss comes back a little later, until you know every card. Nothing is saved yet.
      </p>
    </div>
  );
}
