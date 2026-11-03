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
  /** Where "Back to the lesson" on the summary card goes. */
  lessonHref?: string;
}

const primaryButton =
  'press inline-flex min-h-(--tap-min) items-center justify-center gap-2 rounded-pill bg-button px-6 py-3 text-on-button hover:bg-button-hover';
const secondaryButton =
  'press inline-flex min-h-(--tap-min) items-center justify-center gap-2 rounded-pill border border-control px-6 py-3 text-ink no-underline';
// The prompt card and the summary card: a plain surface with the soft card shadow (Task 77). Study screens stay plain.
const cardClass = 'rounded-xl border border-line bg-surface px-6 py-10 shadow-card sm:px-10';

const stepLabel: Record<Step, string> = {
  see: 'New card',
  choose: 'Choose the answer',
  type: 'Type the answer',
  fill: 'Fill in the blank',
};

/** A tick or a cross next to the words, so right and wrong never depend on color. */
function ResultIcon({ correct }: { correct: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {correct ? <path d="M4 12.5 9.5 18 20 6" /> : <path d="M6 6 18 18M18 6 6 18" />}
    </svg>
  );
}

/** An empty ring in front of each answer before one is picked, the way a choice list reads. */
function OptionRing() {
  return <span aria-hidden="true" className="inline-block size-5 shrink-0 rounded-pill border-2 border-control" />;
}

/**
 * Learn mode (D-43): each card is seen, then chosen from the deck's answers, then typed or filled in, and anything
 * missed comes back until every card is mastered. Every control is a real button or text field, so it works by
 * tapping, clicking or keyboard, and nothing moves on by itself. Rendered only in the browser (client:only); without
 * JavaScript the page shows its <noscript> note instead.
 */
export default function LearnSession({ cards, lessonHref = '/learn/study-skills' }: Props) {
  const [state, setState] = useState<LearnState>(() => startLearn(cards));
  const [typed, setTyped] = useState('');
  // Every action moves keyboard focus to the card, so the next thing to do is right there.
  const [focusRequest, setFocusRequest] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  // Cards rise in (.enter, Task 77) only after the student does something: the first card is there at once on page
  // load, so nothing waits to fade in.
  const enter = focusRequest > 0 ? 'enter ' : '';

  const total = cards.length;
  const mastered = masteredCount(state);
  const progress = total > 0 ? mastered / total : 0;

  useEffect(() => {
    if (focusRequest > 0) cardRef.current?.focus();
  }, [focusRequest]);

  // The bar's length is a CSS custom property set through the element's style object, never a style="" attribute, so
  // the strict style-src policy allows it (the .progress-fill pattern in global.css). It runs after every render
  // because the summary screen draws a new bar element.
  useEffect(() => {
    fillRef.current?.style.setProperty('--progress', String(progress));
  });

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

  const progressBar = (
    <div className="flex items-center gap-4">
      <p className="shrink-0 text-sm text-ink-soft">
        recalled today {mastered} of {total}
      </p>
      <div
        className="progress-track min-w-0 flex-1"
        role="progressbar"
        aria-label="Cards recalled today"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={mastered}
        aria-valuetext={`${mastered} of ${total}`}
      >
        <div ref={fillRef} className="progress-fill" />
      </div>
    </div>
  );

  if (isOver(state)) {
    return (
      <div>
        {progressBar}
        {/* A calm summary: no confetti, no streaks. */}
        <div ref={cardRef} tabIndex={-1} className={`${enter}mt-stack ${cardClass}`}>
          <p className="text-xl">
            You know all {total} {total === 1 ? 'card' : 'cards'}.
          </p>
          <p className="mt-2 text-sm text-ink-soft">Each one was seen, chosen and recalled.</p>
          <p className="mt-stack text-sm text-ink-soft">
            recalled today: {total} · still learning: 0
          </p>
        </div>
        <div className="mt-stack flex flex-wrap gap-3">
          <button type="button" onClick={() => act(() => startLearn(cards))} className={primaryButton}>
            Start again
          </button>
          <a href={lessonHref} className={secondaryButton}>
            Back to the lesson
          </a>
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
      {progressBar}

      {/*
        The deck's one live region stays in the page; the card inside it is drawn fresh for every card and step, so it
        rises in after each action. Under reduced motion it simply appears.
      */}
      <div aria-live="polite" className="mt-stack">
        <div
          key={`${index}-${step}`}
          ref={cardRef}
          tabIndex={-1}
          data-testid="learn-card"
          className={`${enter}${cardClass}`}
        >
          <p data-testid="learn-step" className="text-sm text-ink-soft">
            {stepLabel[step]}
          </p>
          <p data-testid="learn-prompt" className="mt-3 text-xl">
            {card.front}
          </p>

          {step === 'see' && state.revealed && (
            <p className="enter mt-stack border-t border-line pt-stack text-lg">
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
            <div className="enter mt-stack border-t border-line pt-stack" data-testid="learn-feedback">
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
      </div>

      {step === 'choose' && (
        <ul aria-label="Answers" className="mt-stack space-y-3">
          {state.choices.map((choice) => {
            const picked = result?.given === choice;
            const isAnswer = choice === index;
            const note = result ? (isAnswer ? 'The answer' : picked ? 'Your choice' : '') : '';
            // After a pick, the answer gets a tick and a dark border, a wrong pick a cross; the words below each say
            // which is which, so the state never depends on the border or icon alone.
            const tone = !result
              ? 'border-control hover:bg-page'
              : isAnswer
                ? 'border-ink ring-1 ring-ink'
                : picked
                  ? 'border-control'
                  : 'border-line';
            return (
              <li key={choice}>
                <button
                  type="button"
                  onClick={() => act((s) => choose(s, cards, choice))}
                  disabled={result !== null}
                  aria-pressed={result ? picked : undefined}
                  className={`press flex min-h-(--tap-min) w-full items-start gap-3 rounded-xl border bg-surface px-5 py-4 text-left text-lg text-ink disabled:cursor-default ${tone}`}
                >
                  <span className="mt-1.5 flex shrink-0">
                    {result && (isAnswer || picked) ? <ResultIcon correct={isAnswer} /> : <OptionRing />}
                  </span>
                  <span className="min-w-0 flex-1">
                    {cards[choice]!.back}
                    {note && <span className="block text-sm text-ink-soft">{note}</span>}
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
            className="mt-2 min-h-(--tap-min) w-full rounded-xl border border-control bg-page px-5 py-4 text-lg text-ink"
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
