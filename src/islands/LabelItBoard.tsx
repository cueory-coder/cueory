import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { attachResumeLifecycle, clearResume, readResume, saveResume, type ResumeDraft, type ResumeSnapshot } from '../scripts/resume';
import { browserStorage } from '../scripts/storage';
import ResumePrompt from './ResumePrompt';
import {
  coverAll,
  coverWords,
  isCovered,
  isDone,
  isRoundOver,
  mark,
  markOf,
  nextRound,
  parseSet,
  readingOrder,
  reveal,
  revealAll,
  start,
  summary,
  type Label,
  type LabelItState,
  type LabelSet,
  type Mark,
} from './labelit';

interface Props {
  set: LabelSet;
}

const primaryButton = 'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';
const secondaryButton = 'min-h-11 rounded-pill border border-control px-5 py-2.5 text-ink';

const markWords: Record<Mark, string> = { know: 'know it', learning: 'still learning' };
const LABEL_PAGE = '/learn/study-skills/label-it';

/** Only submitted marks survive a reload. Round metadata distinguishes earlier know-it marks from this round's. */
function labelDraft(state: LabelItState, set: LabelSet): ResumeDraft {
  const ids = readingOrder(set.labels).map(label => label.id);
  const next = ids.findIndex(id => !state.known.includes(id) && !markOf(state, id));
  const itemIndex = next < 0 ? ids.length - 1 : next;
  return {
    tool: 'label-it', page: LABEL_PAGE, module: set.id, step: `round-${state.roundNumber}`,
    itemIndex, itemId: ids[itemIndex], totalItems: ids.length, timer: null,
    phase: isDone(state) ? 'results' : 'working',
    answers: Object.fromEntries([
      ...state.known.map(id => [id, { mark: 'know', round: 'earlier' }]),
      ...state.round.filter(id => markOf(state, id)).map(id => [id, { mark: markOf(state, id)!, round: 'current' }]),
    ]),
  };
}

/** Refuse stale or altered saves. Never restore label text or anything that was merely uncovered. */
function restoreLabels(snapshot: ResumeSnapshot, set: LabelSet): LabelItState | null {
  if (snapshot.tool !== 'label-it' || snapshot.page !== LABEL_PAGE || snapshot.module !== set.id ||
      snapshot.totalItems !== set.labels.length || snapshot.timer !== null) return null;
  const match = /^round-([1-9]\d*)$/.exec(snapshot.step ?? '');
  const roundNumber = match ? Number(match[1]) : 0;
  if (!Number.isSafeInteger(roundNumber) || roundNumber < 1) return null;
  const ids = readingOrder(set.labels).map(label => label.id);
  const known: string[] = [];
  const marks: [string, Mark][] = [];
  for (const [id, value] of Object.entries(snapshot.answers)) {
    if (!ids.includes(id) || !value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== 2 || !('mark' in value) || !('round' in value)) return null;
    if (value.mark !== 'know' && value.mark !== 'learning') return null;
    if (value.round === 'earlier' && value.mark === 'know' && roundNumber > 1) known.push(id);
    else if (value.round === 'current') marks.push([id, value.mark]);
    else return null;
  }
  const state: LabelItState = {
    round: ids.filter(id => !known.includes(id)), known: ids.filter(id => known.includes(id)),
    marks: Object.fromEntries(marks), revealed: ids.filter(id => marks.some(([marked]) => marked === id)), roundNumber,
  };
  if (!state.round.length) return null;
  const draft = labelDraft(state, set);
  return draft.itemIndex === snapshot.itemIndex && draft.itemId === snapshot.itemId && draft.phase === snapshot.phase ? state : null;
}

/** A tick, so "know it" never depends on color alone. */
function TickIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M4 12.5 L9.5 18 L20 6" />
    </svg>
  );
}

/**
 * Where a cover sits, as CSS for one axis. The button is centred on its box and never smaller than 44 px, so a tiny
 * label is still easy to tap, but it is kept inside the image: a small box at an edge gets a target that starts or
 * ends at that edge instead of hanging over it (and scrolling a 320 px page sideways).
 */
/** The smallest tap target, 44 px: eleven steps of the spacing token, the same size as Tailwind's min-h-11. */
const MIN_TARGET = 'calc(var(--spacing) * 11)';

export function coverAxis(start: number, length: number): { offset: string; size: string } {
  const size = `max(${MIN_TARGET}, ${length}%)`;
  return { offset: `clamp(0px, calc(${start + length / 2}% - ${size} / 2), calc(100% - ${size}))`, size };
}

/**
 * The cover's position, set through React's style property. The browser applies it through the CSSOM, which our
 * content security policy allows; a server-rendered style="" attribute would be blocked, so the board is only ever
 * rendered in the browser.
 */
function coverPlace(label: Label) {
  const x = coverAxis(label.x, label.w);
  const y = coverAxis(label.y, label.h);
  return { left: x.offset, top: y.offset, width: x.size, height: y.size };
}

function Board({ set }: Props) {
  const ordered = readingOrder(set.labels);
  const numberOf = new Map(ordered.map((l, i) => [l.id, i + 1]));
  const [state, setState] = useState<LabelItState>(() => start(set));
  const [resumePending, setResumePending] = useState(() => readResume(browserStorage())?.page === LABEL_PAGE);
  const latestDraft = useRef<ResumeDraft | null>(null);
  useEffect(() => attachResumeLifecycle(browserStorage(), () => latestDraft.current), []);
  const [said, setSaid] = useState('');
  const [focusRequest, setFocusRequest] = useState(0);
  const statusRef = useRef<HTMLDivElement>(null);
  const knowButtons = useRef(new Map<string, HTMLButtonElement>());
  // After "uncover" in the list, that button is gone, so focus moves to the label's "know it" button.
  const focusKnow = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    if (focusKnow.current) knowButtons.current.get(focusKnow.current)?.focus();
    focusKnow.current = undefined;
  });

  // A new round moves keyboard focus to the top of the board; uncovering and marking leave focus where it is.
  useEffect(() => {
    if (focusRequest > 0) statusRef.current?.focus();
  }, [focusRequest]);

  const uncovered = (id: string) => !isCovered(state, id);
  const inRound = (id: string) => state.round.includes(id);

  const saveState = (next: LabelItState) => {
    const draft = labelDraft(next, set);
    latestDraft.current = draft;
    saveResume(browserStorage(), draft);
    setState(next);
  };

  const doReveal = (label: Label) => {
    if (!isCovered(state, label.id)) return;
    // Revealing alone is not an answer and must not create a saved session.
    setState(reveal(state, label.id));
    setSaid(`${coverWords(numberOf.get(label.id)!, label, true)}.`);
  };

  const doMark = (label: Label, value: Mark) => {
    const next = mark(state, label.id, value);
    saveState(next);
    const tally = summary(next);
    setSaid(
      isRoundOver(next)
        ? `${label.text}: ${markWords[value]}. round ${next.roundNumber} done.`
        : `${label.text}: ${markWords[value]}. ${tally.unmarked} left to mark.`,
    );
  };

  const newRound = (next: LabelItState, words: string) => {
    saveState(next);
    setSaid(words);
    setFocusRequest((n) => n + 1);
  };

  const restart = () => {
    latestDraft.current = null;
    clearResume(browserStorage());
    setResumePending(false);
    setState(start(set));
    setSaid('every label covered. starting over.');
    setFocusRequest(n => n + 1);
  };

  const continueSaved = (snapshot: ResumeSnapshot) => {
    const restored = restoreLabels(snapshot, set);
    if (!restored) { restart(); return; }
    setResumePending(false);
    newRound(restored, 'your marked labels are back.');
  };

  const tally = summary(state);
  const roundOver = isRoundOver(state);
  const done = isDone(state);
  const round = state.roundNumber > 1 ? `round ${state.roundNumber} · ` : '';

  return (
    <div data-testid="labelit">
      <ResumePrompt page={LABEL_PAGE} onContinue={continueSaved} onStartOver={restart} />
      <div inert={resumePending} data-testid="labelit-session">
      <div ref={statusRef} tabIndex={-1}>
        <p className="text-sm text-ink-soft" data-testid="labelit-status">
          {round}
          {tally.covered} covered · know it: {tally.know + tally.knownBefore} · still learning: {tally.learning}
        </p>
      </div>

      <div className="mt-stack grid gap-stack md:grid-cols-2 md:items-start">
        <figure>
          <div className="relative">
            <img
              src={set.image.src}
              alt={set.image.alt}
              width={set.image.width}
              height={set.image.height}
              className="block h-auto w-full rounded-md"
            />
            <ul aria-label="labels on the image">
              {ordered.map((label) => {
                const number = numberOf.get(label.id)!;
                const open = uncovered(label.id);
                return (
                  <li key={label.id}>
                    <button
                      type="button"
                      style={coverPlace(label)}
                      onClick={() => doReveal(label)}
                      // aria-disabled rather than disabled: an uncovered cover keeps keyboard focus.
                      aria-disabled={open || undefined}
                      aria-label={coverWords(number, label, open)}
                      data-testid={`cover-${number}`}
                      // Uncovered: a dashed frame with a page-colored ring around it, so it shows on light and dark
                      // diagrams alike, and the number moves outside the frame so it never hides the label.
                      className={`absolute rounded-sm text-sm ${
                        open
                          ? 'border-2 border-dashed border-ink bg-transparent ring-2 ring-page'
                          : 'flex items-center justify-center border border-control bg-surface font-medium text-ink'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={
                          open ? 'absolute -left-3 -top-3 rounded-pill bg-button px-1.5 text-on-button' : undefined
                        }
                      >
                        {number}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <figcaption className="mt-2 text-sm text-ink-soft">{set.image.credit}</figcaption>
        </figure>

        <section aria-labelledby="labelit-list-heading">
          <h2 id="labelit-list-heading" className="text-sm text-ink-soft">
            labels
          </h2>
          <ol className="mt-2 space-y-3" data-testid="labelit-list">
            {ordered.map((label) => {
              const number = numberOf.get(label.id)!;
              const open = uncovered(label.id);
              const current = markOf(state, label.id);
              const knownBefore = state.known.includes(label.id);
              return (
                <li key={label.id} className="rounded-md border border-line px-4 py-3">
                  <p className="flex flex-wrap items-center gap-x-2">
                    <span>{open ? `${number}. ${label.text}` : `${number}. covered`}</span>
                    {(knownBefore || current) && (
                      <span className="flex items-center gap-1 text-sm text-ink-soft">
                        {(knownBefore || current === 'know') && <TickIcon />}
                        {knownBefore ? 'know it' : markWords[current!]}
                      </span>
                    )}
                  </p>
                  {!open && (
                    <button
                      type="button"
                      onClick={() => {
                        focusKnow.current = label.id;
                        doReveal(label);
                      }}
                      aria-label={`uncover label ${number}`}
                      className={`${secondaryButton} mt-2`}
                    >
                      uncover
                    </button>
                  )}
                  {open && inRound(label.id) && (
                    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`mark label ${number}`}>
                      {(['know', 'learning'] as const).map((value) => (
                        <button
                          key={value}
                          ref={(element) => {
                            if (value !== 'know') return;
                            if (element) knowButtons.current.set(label.id, element);
                            else knowButtons.current.delete(label.id);
                          }}
                          type="button"
                          aria-pressed={current === value}
                          onClick={() => doMark(label, value)}
                          className={`${secondaryButton} ${current === value ? 'border-ink bg-surface font-medium' : ''}`}
                        >
                          {markWords[value]}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <div className="mt-stack flex flex-wrap gap-3">
        {!roundOver && (
          <>
            <button
              type="button"
              onClick={() => {
                setState(revealAll(state));
                setSaid('every label uncovered.');
              }}
              disabled={tally.covered === 0}
              className={`${secondaryButton} disabled:opacity-50`}
            >
              reveal all
            </button>
            <button
              type="button"
              onClick={() => {
                const next = coverAll(state);
                // A cover-all after marking must replace the old save, or those marks would reappear.
                if (latestDraft.current) saveState(next);
                else setState(next);
                setSaid('every label covered again.');
              }}
              disabled={tally.covered === tally.total}
              className={`${secondaryButton} disabled:opacity-50`}
            >
              cover all
            </button>
          </>
        )}
        {roundOver && !done && (
          <button
            type="button"
            onClick={() => newRound(nextRound(state), `round ${state.roundNumber + 1}: ${tally.learning} covered again.`)}
            className={primaryButton}
          >
            study the {tally.learning} still learning
          </button>
        )}
        {roundOver && (
          <button
            type="button"
            onClick={restart}
            className={done ? primaryButton : secondaryButton}
          >
            start over
          </button>
        )}
      </div>

      {done && <p className="mt-stack text-lg">that's every label for now.</p>}

      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="labelit-live">
        {said}
      </p>
      </div>
    </div>
  );
}

/** A key that changes whenever the set's content changes, so a new set starts on a fresh board. */
const setKey = (set: LabelSet) => JSON.stringify(set);

/**
 * Label it (ROADMAP Task 4c): the labels on a diagram are covered. Uncover them one at a time by tapping a numbered
 * cover (or with the keyboard), or all at once, then mark each one "know it" or "still learning". The next round
 * covers only the "still learning" ones. A covered label's text is never in the page, not even for screen readers.
 *
 * A different set remounts the board (via `key`) before it renders, so a new set always starts fully covered.
 * Pages should use LabelItFromUrl below rather than passing `set` as an Astro prop: Astro writes island props into the
 * page's HTML, and `set` holds every label's text.
 */
export default function LabelItBoard({ set }: Props) {
  let parsed: LabelSet;
  try {
    parsed = parseSet(set);
  } catch {
    return <p role="alert">this diagram could not be loaded. please try again later.</p>;
  }
  return <Board key={setKey(parsed)} set={parsed} />;
}

/** Only our own site's paths, so a page can't point the board at another site. */
const isOwnPath = (src: string) => /^\/(?!\/)[\w\-./]+\.json$/.test(src);

/**
 * The way pages mount label it: the page passes only the address of the set's JSON file, so no label text is in the
 * page's HTML or the island's props. The file is fetched from our own site after the page loads (the CSP's
 * connect-src 'self' allows it), checked with parseSet, then shown fully covered. Wire with client:only="react".
 */
export function LabelItFromUrl({ src }: { src: string }) {
  const [loaded, setLoaded] = useState<{ src: string; set: LabelSet } | 'failed' | undefined>(undefined);

  useEffect(() => {
    if (!isOwnPath(src)) {
      setLoaded('failed');
      return;
    }
    let cancelled = false;
    setLoaded(undefined);
    fetch(src, { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: unknown) => {
        if (!cancelled) setLoaded({ src, set: parseSet(data) });
      })
      .catch(() => {
        if (!cancelled) setLoaded('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (loaded === 'failed') return <p role="alert">this diagram could not be loaded. please try again later.</p>;
  if (!loaded || loaded.src !== src) return <p className="text-sm text-ink-soft">loading the diagram…</p>;
  return <LabelItBoard set={loaded.set} />;
}
