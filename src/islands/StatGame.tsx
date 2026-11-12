import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ResultBrandMark from './ResultBrandMark';
import {
  LOW_SECONDS,
  STAT_QUESTIONS,
  STAT_SECONDS,
  advanceTime,
  averageSeconds,
  getResult,
  gradeRound,
  letterLabel,
  nextQuestion,
  pickAnswer,
  reviewWords,
  ringFraction,
  sampleGrader,
  scoreOf,
  secondsLeft,
  startStat,
  statTimerMessage,
  verdict,
  type StatLetter,
  type StatQuestion,
  type StatReviewRow,
  type StatState,
} from './stat';
import { statKeyAction } from './statkeys';

const primaryButton =
  'press inline-flex min-h-(--tap-min) min-w-(--tap-min) items-center justify-center rounded-pill bg-button px-6 py-2.5 font-bold text-on-button hover:bg-button-hover';
const quietButton =
  'press inline-flex min-h-(--tap-min) min-w-(--tap-min) items-center justify-center rounded-pill border border-control px-6 py-2.5 text-ink';

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** How often the clock is read. The deadline decides the time; this only keeps the number fresh. */
const READ_EVERY_MS = 200;

interface Props {
  questions: readonly StatQuestion[];
  /** Sample mode only: the labeled sample key from content/games/stat. Real mode will grade through check_answer. */
  sampleKey: Readonly<Record<string, StatLetter>>;
}

type Phase = 'ready' | 'playing' | 'grading' | 'done' | 'failed';

/** Seconds left as a ring and as text. The ring is decoration; the number is always there. */
function Ring({ left }: { left: number }) {
  const low = left <= LOW_SECONDS;
  return (
    <div role="timer" aria-label={`${left} ${left === 1 ? 'second' : 'seconds'} left`} className="relative size-16 shrink-0" data-testid="stat-timer">
      <svg viewBox="0 0 64 64" className="size-16" aria-hidden="true" focusable="false">
        <circle cx="32" cy="32" r={RADIUS} fill="none" stroke="currentColor" strokeWidth="6" className="text-line" />
        <circle
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE.toFixed(2)}
          strokeDashoffset={(CIRCUMFERENCE * (1 - ringFraction(left))).toFixed(2)}
          transform="rotate(-90 32 32)"
          className="text-ink transition-none ease-linear motion-safe:transition-all motion-safe:duration-(--duration-slow)"
          data-testid="stat-ring"
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center text-xl font-bold tabular-nums ${low ? 'underline underline-offset-4' : ''}`}
        data-testid="stat-seconds"
        data-low={low || undefined}
      >
        {left}
        <span className="sr-only">{left === 1 ? ' second left' : ' seconds left'}</span>
      </span>
    </div>
  );
}

/**
 * stat: fifteen timed questions, graded only at the end. All rules live in ./stat.ts; this file renders them and runs
 * the clock. Keys: a to d pick, Enter goes on (unless a button has focus, where Enter presses that button).
 */
export default function StatGame({ questions, sampleKey }: Props) {
  const grader = useMemo(() => sampleGrader(sampleKey), [sampleKey]);
  const [phase, setPhase] = useState<Phase>('ready');
  const [state, setState] = useState<StatState>(() => startStat(0));
  const [now, setNow] = useState(0);
  const [rows, setRows] = useState<StatReviewRow[] | null>(null);
  const [said, setSaid] = useState('');
  const [copied, setCopied] = useState('');
  const [rounds, setRounds] = useState(0);
  const today = useMemo(() => new Date(), []);
  const stemRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const heard = useRef({ index: -1, left: STAT_SECONDS });

  const left = phase === 'playing' ? secondsLeft(state, now) : STAT_SECONDS;
  const question = questions[state.index];

  const begin = useCallback(() => {
    const start = Date.now();
    heard.current = { index: 0, left: STAT_SECONDS };
    setState(startStat(start));
    setNow(start);
    setRows(null);
    setCopied('');
    setRounds((count) => count + 1);
    setPhase('playing');
    setSaid(statTimerMessage({ kind: 'question', index: 0, left: STAT_SECONDS }) ?? '');
  }, []);

  // Start: focus goes to the question so it is read out.
  useEffect(() => {
    if (phase === 'playing' && state.index === 0) stemRef.current?.focus();
  }, [phase, rounds]);

  // The clock: read it often; the deadline in the state decides. No pause, no resume.
  useEffect(() => {
    if (phase !== 'playing') return;
    const read = () => {
      const time = Date.now();
      setNow(time);
      setState((current) => advanceTime(current, questions, time));
    };
    const timer = setInterval(read, READ_EVERY_MS);
    document.addEventListener('visibilitychange', read);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', read);
    };
  }, [phase, questions]);

  // Screen readers hear each new question, and the clock at 10 and at 5 seconds, once each, never every second.
  useEffect(() => {
    if (phase !== 'playing' || state.status !== 'playing') return;
    if (heard.current.index !== state.index) {
      const timedOut = state.answers.at(-1)?.timedOut;
      // A sleeping tab may skip to a question already in progress. Announce its real time left.
      heard.current = { index: state.index, left };
      setSaid(statTimerMessage({ kind: 'question', index: state.index, left, previousTimedOut: timedOut }) ?? '');
      return;
    }
    const line = statTimerMessage({ kind: 'tick', before: heard.current.left, left });
    heard.current = { index: state.index, left };
    if (line) setSaid(line);
  }, [phase, state.index, state.status, left]);

  // The round is over: grade it (only now), then show the results.
  useEffect(() => {
    if (phase !== 'playing' || state.status !== 'over') return;
    setPhase('grading');
    setSaid('all fifteen done. checking your answers.');
    let live = true;
    gradeRound(questions, state.answers, grader).then(
      (graded) => {
        if (!live) return;
        setRows(graded);
        setPhase('done');
        setSaid('');
      },
      () => {
        if (live) setPhase('failed');
      },
    );
    return () => {
      live = false;
    };
  }, [phase, state.status]);

  useEffect(() => {
    if (phase === 'done' || phase === 'failed') resultRef.current?.focus();
  }, [phase]);

  const pick = (letter: StatLetter) => {
    if (phase !== 'playing') return;
    setState((current) => pickAnswer(advanceTime(current, questions, Date.now()), letter));
    setSaid(`${letterLabel(letter)} selected.`);
  };

  const next = () => {
    if (phase !== 'playing') return;
    const time = Date.now();
    setNow(time);
    setState((current) => nextQuestion(current, questions, time));
  };

  // Give visible dialogs, menus and search their own keyboard handling. Only the pure helper decides a shortcut.
  useEffect(() => {
    if (phase !== 'playing') return;
    const onKey = (event: KeyboardEvent) => {
      // Synthetic window events can have no Element target. Fall back to actual focus without trusting it alone:
      // the overlay-open guard also blocks shortcuts when a modal's focus trap fails or focus has escaped.
      const target = event.target instanceof Element ? event.target : document.activeElement;
      // Only real overlays or Cueory's two menu toggles may block shortcuts.
      // An unrelated expanded accordion must not disable stat.
      const overlays = document.querySelectorAll<HTMLElement>(
        'dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"], ' +
        '[data-menu-open][aria-expanded="true"], [data-account-toggle][aria-expanded="true"]',
      );
      const overlayOpen = Array.from(overlays).some((overlay) => {
        if (overlay.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
        // Some closed overlays remain mounted but invisible or outside the viewport.
        for (let element: HTMLElement | null = overlay; element; element = element.parentElement) {
          const style = getComputedStyle(element);
          if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) <= 0) return false;
        }
        const bounds = overlay.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 &&
          bounds.top < window.innerHeight && bounds.left < window.innerWidth &&
          bounds.bottom > 0 && bounds.right > 0;
      });
      const action = statKeyAction({
        key: event.key,
        hasModifier: event.altKey || event.ctrlKey || event.metaKey,
        isRepeated: event.repeat,
        isEditing: Boolean(target?.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]',
        )),
        focusInsideOverlay: Boolean(target?.closest(
          'dialog, [role="dialog"], [role="alertdialog"], [role="menu"], [data-site-search], [data-account], [data-menu-open]',
        )),
        overlayOpen,
        onActionControl: Boolean(target?.closest('button, a, summary, [role="button"], [role="link"]')),
      });
      if (!action) return;
      event.preventDefault();
      if (action.kind === 'pick') pick(action.letter);
      else next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // TASK-626 HOOK: `result` is this game's finished round in the shared shape (StatRoundResult from ./stat, built on
  // gameresults.ts RoundResult: game, day, solved, tries, plus score, total, averageSeconds, share, practice). When the
  // shared results/share card lands, render it here with `result` instead of (or under) the copy button below. It is
  // null until the round has been graded. Not sent to the stats panel yet: 'stat' isn't one of its GameIds.
  const result = getResult(rows, state.answers, today, rounds > 1);

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.share);
      setCopied('copied.');
    } catch {
      setCopied('copying is blocked here. you can select the line above and copy it.');
    }
  };

  if (questions.length !== STAT_QUESTIONS) return <p>no questions today.</p>;

  return (
    <div className="text-ink" data-testid="stat">
      <p role="status" aria-live="polite" className="sr-only" data-testid="stat-said">
        {said}
      </p>

      {phase === 'ready' && (
        <div className="flex flex-col items-start gap-4">
          <ul className="flex list-disc flex-col gap-2 ps-5 text-ink-soft">
            <li>fifteen hard clinical questions, one at a time.</li>
            <li>you have {STAT_SECONDS} seconds for each. pick an answer and press next, or the next question starts when the clock runs out.</li>
            <li>you can change your pick until you press next. answers and your score stay hidden until the end.</li>
            <li>there is no pause. keys: a to d to pick, enter for next.</li>
          </ul>
          <button type="button" className={primaryButton} onClick={begin} data-testid="stat-start">
            start
          </button>
        </div>
      )}

      {phase === 'playing' && question && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-ink-soft" data-testid="stat-progress">
              question <strong className="text-ink">{state.index + 1}</strong> of {STAT_QUESTIONS}
            </p>
            <Ring left={left} />
          </div>

          <section className="flex flex-col gap-4 rounded-xl border border-line bg-page p-5 sm:p-7" aria-labelledby="stat-stem">
            <p className="text-sm font-bold text-ink-soft">clinical question</p>
            <h3 id="stat-stem" ref={stemRef} tabIndex={-1} className="wrap-anywhere text-lg font-bold" data-testid="stat-stem">
              {question.stem}
            </h3>
            <div className="flex flex-col gap-3" role="group" aria-labelledby="stat-stem">
              {question.choices.map((choice) => {
                const selected = state.picked === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => pick(choice.id)}
                    data-testid={`stat-choice-${choice.id}`}
                    className={`press flex min-h-14 w-full min-w-0 cursor-pointer touch-manipulation items-center gap-3 rounded-lg bg-surface px-4 py-2.5 text-start ${selected ? 'border-2 border-ink font-bold' : 'border border-control'}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-8 shrink-0 items-center justify-center rounded-full border border-control text-sm font-bold ${selected ? 'bg-button text-on-button' : ''}`}
                    >
                      {letterLabel(choice.id)}
                    </span>
                    <span className="min-w-0 flex-1 wrap-anywhere">
                      <span className="sr-only">{letterLabel(choice.id)}. </span>
                      {choice.text}
                    </span>
                    {selected && <span className="shrink-0 text-sm font-bold">● selected</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-ink-soft">pick an answer, then press next. answers and your score show at the end.</p>
          </section>

          <div className="flex justify-end">
            <button type="button" className={primaryButton} onClick={next} data-testid="stat-next">
              {state.index + 1 >= STAT_QUESTIONS ? 'see results' : 'next'} <span aria-hidden="true">&nbsp;→</span>
            </button>
          </div>
        </div>
      )}

      {phase === 'grading' && <p data-testid="stat-grading">checking your answers…</p>}

      {phase === 'failed' && (
        <div ref={resultRef} tabIndex={-1} className="flex flex-col items-start gap-4" data-testid="stat-failed">
          <p>couldn't check your answers. please try again.</p>
          <button type="button" className={quietButton} onClick={begin}>
            practice again
          </button>
        </div>
      )}

      {phase === 'done' && rows && result && (
        <div ref={resultRef} tabIndex={-1} className="flex flex-col items-center gap-3 text-center" data-testid="stat-result">
          <p className="text-sm font-bold text-ink-soft">today's shift</p>
          <p className="display text-display" data-testid="stat-score">
            {scoreOf(rows)}
            <span className="text-2xl text-ink-soft"> / {STAT_QUESTIONS}</span>
          </p>
          <p className="text-lg font-bold" data-testid="stat-verdict">
            {verdict(scoreOf(rows))}
          </p>
          <p className="text-ink-soft">
            average answer time: <strong className="text-ink" data-testid="stat-average">{averageSeconds(state.answers)} s</strong>
          </p>
          <p className="max-w-full wrap-anywhere rounded-lg border-2 border-dashed border-line bg-page px-4 py-3" data-testid="stat-share">
            {result.share}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" className={primaryButton} onClick={copy} data-testid="stat-copy">
              copy my score
            </button>
            <button type="button" className={quietButton} onClick={begin} data-testid="stat-again">
              practice again
            </button>
          </div>
          <p className="min-h-6 text-sm text-ink-soft" role="status" data-testid="stat-copied">
            {copied}
          </p>

          <section className="mt-4 w-full text-start" aria-labelledby="stat-review-heading">
            <h3 id="stat-review-heading" className="text-lg font-bold">
              your answers
            </h3>
            <ol className="mt-3 flex flex-col gap-3" data-testid="stat-review">
              {rows.map((row) => {
                const words = reviewWords(row);
                return (
                  <li
                    key={row.questionId}
                    tabIndex={0}
                    className={
                      'min-w-0 rounded-lg bg-page p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ' +
                      (row.right ? 'border border-line' : 'border-2 border-dashed border-line')
                    }
                    data-testid="stat-review-row"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <h4 id={'stat-review-item-' + row.number} className="font-bold">
                        question {row.number}
                      </h4>
                      <p className="font-bold">
                        <span aria-hidden="true">{words.mark} </span>
                        {words.result}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <p className="wrap-anywhere">{words.yours}</p>
                      <p className="font-bold">{words.answer}</p>
                      <p className="text-ink-soft">{words.time}</p>
                    </div>
                    {words.counted && <p className="mt-2 text-sm text-ink-soft">{words.counted}</p>}
                    <p className="mt-2 text-sm text-ink-soft" data-testid="stat-review-rationale">
                      reason: [sample rationale pending review]
                    </p>
                  </li>
                );
              })}
            </ol>
          </section>
          <p className="text-sm text-ink-soft" data-testid="stat-tomorrow">
            these are sample questions. play again tomorrow for another practice round. reviewed daily sets will come later.
          </p>
          <ResultBrandMark path="/play" />
        </div>
      )}
    </div>
  );
}
