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

const primaryButton = 'press rounded-pill bg-button px-5 py-3 text-on-button hover:bg-button-hover inline-flex items-center gap-2';
const secondaryButton = 'press rounded-pill border border-control px-5 py-3 text-ink inline-flex items-center gap-2';

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

/** Empty circle placeholder for unchosen options. */
function UnpickedIcon() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 inline-block size-5 shrink-0 rounded-full border border-control"
    />
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

  // .enter and .press live in src/styles/global.css (Task 79).

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
  const progressValue = total > 0 ? mastered / total : 0;

  if (isOver(state)) {
    return (
      <div>
        <div
          ref={cardRef}
          tabIndex={-1}
          className="enter rounded-xl border border-line bg-surface px-8 py-12"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <p className="text-xl">
            You know all {total} {total === 1 ? 'card' : 'cards'}.
          </p>
          <p className="mt-2 text-sm text-ink-soft">Each one was seen, chosen and recalled.</p>
          <div className="mt-stack text-sm text-ink-soft">
            <p>Mastered: {total}</p>
          </div>
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
      {/* Progress bar */}
      <div className="flex items-center gap-4">
        <p className="shrink-0 text-sm text-ink-soft">Mastered {mastered} of {total}</p>
        <div
          className="progress-track flex-1 h-2 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={mastered}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`Mastered ${mastered} of ${total}`}
        >
          <div
            className="progress-fill h-full rounded-full bg-ink"
            style={{ transform: `scaleX(${progressValue})`, transformOrigin: 'left center' } as React.CSSProperties}
          />
        </div>
      </div>

      {/* Card — re-keyed on step change so .enter animation fires each time */}
      <div
        key={`${state.queue[0]}-${step}`}
        ref={cardRef}
        tabIndex={-1}
        aria-live="polite"
        data-testid="learn-card"
        className="enter mt-stack rounded-xl border border-line bg-surface px-8 py-10"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        <p data-testid="learn-step" className="text-sm text-ink-soft">
          {stepLabel[step]}
        </p>
        <p data-testid="learn-prompt" className="mt-3 text-xl">
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
            const note = result ? (isAnswer ? 'Correct answer' : picked ? 'Your choice' : '') : '';
            const showIcon = Boolean(result) && (isAnswer || picked);
            return (
              <li key={choice}>
                <button
                  type="button"
                  onClick={() => act((s) => choose(s, cards, choice))}
                  disabled={result !== null}
                  aria-pressed={result ? (picked || isAnswer) : undefined}
                  className={`press w-full rounded-xl border px-6 py-4 text-left disabled:cursor-default flex items-start gap-3 transition-colors${
                    result && isAnswer
                      ? ' border-button text-ink'
                      : result && picked && !isAnswer
                      ? ' border-control text-ink opacity-75'
                      : ' border-control text-ink hover:border-button'
                  }`}
                >
                  {showIcon ? <ResultIcon correct={isAnswer} /> : <UnpickedIcon />}
                  <span className="flex-1">
                    {cards[choice]!.back}
                    {note && <span className="mt-1 block text-sm text-ink-soft">{note}</span>}
                  </span>
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
            className="mt-2 w-full rounded-xl border border-control bg-surface px-5 py-3.5 text-lg text-ink"
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
