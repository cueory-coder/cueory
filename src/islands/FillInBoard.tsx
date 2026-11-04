import { useEffect, useId, useRef, useState } from 'react';
import { attachResumeLifecycle, clearResume, readResume, saveResume, type ResumeDraft, type ResumeSnapshot } from '../scripts/resume';
import { browserStorage } from '../scripts/storage';
import ResumePrompt from './ResumePrompt';
import {
  answerCurrent, blankOptions, boundTyped, currentIndex, isCheckKey, nextItem, normalizeAnswer, parseItems, sentenceParts, showHint,
  MAX_TYPED, startFillIn, summary, type FillInItem, type FillInState,
} from './fillin';

/** `page` is this page's own address, for the saved place (Task 300: every lesson has its own fill-in page). */
interface Props { items: FillInItem[]; page?: string }

const primaryButton =
  'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover disabled:opacity-50';
const secondaryButton = 'min-h-11 rounded-pill border border-control px-5 py-2.5 text-ink disabled:opacity-50';
const FILL_IN_PAGE = '/learn/study-skills/fill-in';

/** Sample content IDs can themselves reveal the blank's answer. Store opaque positions instead. */
const itemKey = (index: number) => `item-${index}`;
type Attempts = Record<string, string[]>;
const HINT_KEY = 'hint';

/** The open item has a hint showing and no answer checked since. */
function openHint(state: FillInState): boolean {
  return !state.done && state.hinted && state.result === null && currentIndex(state) !== undefined;
}

/** The resume format keeps at most 50 entries per item (`answerValue` in src/scripts/resume.ts). */
const MAX_HISTORY = 50;

/**
 * Add one submission to an item's history. A close answer leaves the item open, so the close tries in a row before
 * it matter to replay only while the item is still open: when a right or wrong answer ends that try, they are dropped,
 * and while it stays open only the latest close try is kept (it carries the typed text and the hint flag). The
 * history is then one entry per finished round plus at most one open close try, so earlier rounds are never evicted.
 */
function appendAttempt(history: readonly string[], entry: string, previousWasClose: boolean): string[] {
  const kept = previousWasClose ? history.slice(0, -1) : [...history];
  return [...kept, entry];
}

/** Only typed submissions and whether the student used a hint are saved. */
function fillInDraft(items: readonly FillInItem[], state: FillInState, attempts: Attempts, moves: number, page: string): ResumeDraft | null {
  if (!items.length) return null;
  const index = currentIndex(state) ?? items.length - 1;
  return {
    tool: 'fill-in', page, step: `advance-${moves}`,
    itemIndex: index, ...(state.done ? {} : { itemId: itemKey(index) }),
    totalItems: items.length,
    answers: {
      ...Object.fromEntries(Object.entries(attempts).map(([key, entries]) => [key, [...entries]])),
      // A hint taken before any answer on the open item: kept so a reload can't drop the repeat round it costs.
      ...(openHint(state) ? { [HINT_KEY]: itemKey(index) } : {}),
    },
    timer: null, phase: state.done ? 'results' : 'working',
  };
}

/**
 * Replay only the student's typed submissions through the existing rules. Never
 * trust a saved verdict, sentence, answer key, item ID or arbitrary engine state.
 * Multiple attempts on the same item also support close spelling and later rounds.
 */
function restoreFillIn(items: readonly FillInItem[], snapshot: ResumeSnapshot, page: string): {
  state: FillInState; typed: string; attempts: Attempts; moves: number;
} | null {
  if (snapshot.tool !== 'fill-in' || snapshot.page !== page || snapshot.module !== undefined ||
      snapshot.timer !== null || !items.length || snapshot.totalItems !== items.length) return null;
  const marker = /^advance-(0|[1-9]\d*)$/.exec(snapshot.step ?? '');
  if (!marker) return null;
  const moves = Number(marker[1]);
  if (!Number.isSafeInteger(moves) || moves > 2000) return null;

  const attempts: Attempts = {};
  let count = 0;
  let pendingHint: string | undefined;
  for (const [key, submitted] of Object.entries(snapshot.answers)) {
    if (key === HINT_KEY) {
      if (typeof submitted !== 'string' || !/^item-(0|[1-9]\d*)$/.test(submitted)) return null;
      pendingHint = submitted;
      continue;
    }
    const match = /^item-(0|[1-9]\d*)$/.exec(key);
    if (!match || Number(match[1]) >= items.length || !Array.isArray(submitted)) return null;
    const entries: string[] = [];
    for (const raw of submitted) {
      if (typeof raw !== 'string' || !/^[nh]:/.test(raw) ||
          normalizeAnswer(raw.slice(2)) === '' || boundTyped(raw.slice(2)) !== raw.slice(2)) return null;
      entries.push(raw);
      if (++count > 1000) return null;
    }
    if (!entries.length) return null;
    attempts[key] = entries;
  }

  let state = startFillIn(items);
  const used = new Map<string, number>();
  let advancesLeft = moves;
  let typed = '';
  let operations = 0;
  while (!state.done && ++operations <= 3000) {
    const current = currentIndex(state);
    if (current === undefined) return null;
    const key = itemKey(current);
    const entries = attempts[key] ?? [];
    let offset = used.get(key) ?? 0;
    while (offset < entries.length && state.result !== 'right' && state.result !== 'wrong') {
      const attempt = entries[offset++]!;
      if (attempt.startsWith('h:')) state = showHint(state);
      const checked = answerCurrent(state, items, attempt.slice(2));
      if (checked === state) return null;
      state = checked;
      typed = attempt.slice(2);
    }
    used.set(key, offset);
    if (advancesLeft === 0) break;
    if (state.result !== 'right' && state.result !== 'wrong') return null;
    state = nextItem(state);
    advancesLeft--;
    typed = '';
  }
  if (operations > 3000 || advancesLeft !== 0) return null;
  if (Object.entries(attempts).some(([key, entries]) => used.get(key) !== entries.length)) return null;
  if (pendingHint !== undefined) {
    const current = currentIndex(state);
    if (state.done || current === undefined || itemKey(current) !== pendingHint ||
        state.result === 'right' || state.result === 'wrong') return null;
    if (!state.hinted || state.result !== null) state = showHint(state);
  }
  const expected = fillInDraft(items, state, attempts, moves, page);
  if (!expected || expected.itemIndex !== snapshot.itemIndex || expected.itemId !== snapshot.itemId ||
      expected.phase !== snapshot.phase) return null;
  return { state, typed, attempts, moves };
}

/** The key starts a fresh session when a parent replaces the items. */
export default function FillInBoard(props: Props) {
  return <Session key={JSON.stringify(props.items)} items={props.items} page={props.page ?? FILL_IN_PAGE} />;
}

function Session({ items: suppliedItems, page = FILL_IN_PAGE }: Props) {
  const [items] = useState(() => parseItems(suppliedItems));
  const [state, setState] = useState(() => startFillIn(items));
  const [typed, setTyped] = useState('');
  const [inputMode, setInputMode] = useState<'dropdown' | 'type'>('dropdown');
  const [focusInput, setFocusInput] = useState(0);
  const [resumePending, setResumePending] = useState(() => {
    const saved = readResume(browserStorage());
    return saved?.tool === 'fill-in' && saved.page === page;
  });
  const attempts = useRef<Attempts>({});
  // The item whose last saved entry is a close try that is still open (a hint in between doesn't close it).
  const openClose = useRef<string | null>(null);
  const moves = useRef(0);
  const latestDraft = useRef<ResumeDraft | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const id = useId();
  const index = currentIndex(state);
  const item = index === undefined ? undefined : items[index];
  const parts = item ? sentenceParts(item.sentence) : undefined;
  const answered = state.result === 'right' || state.result === 'wrong';

  // Extract all other answers across the deck as fallback distractors
  const allAnswers = items
    .map((it) => {
      try {
        return sentenceParts(it.sentence).answer;
      } catch {
        return '';
      }
    })
    .filter(Boolean);

  const options = parts && item
    ? blankOptions(parts.answer, item.distractors, allAnswers, (index ?? 0) + state.roundNumber * 7)
    : [];

  // A resumed free-text attempt may not be one of the dropdown's options.
  // Never enable checking an answer the student cannot see selected.
  const canSubmit = normalizeAnswer(typed) !== '' && (inputMode === 'type' || options.includes(typed));

  // Do not overwrite a different mode's save merely by visiting this page.
  useEffect(() => attachResumeLifecycle(browserStorage(), () => latestDraft.current), []);

  useEffect(() => {
    if (state.done) end.current?.focus();
    else if (answered) nextButton.current?.focus();
    else if (focusInput > 0) {
      if (inputMode === 'type') input.current?.focus();
      else select.current?.focus();
    }
  }, [answered, focusInput, inputMode, state.done]);

  const persist = (next: FillInState) => {
    const draft = fillInDraft(items, next, attempts.current, moves.current, page);
    if (!draft) return;
    if (Object.values(attempts.current).some((entries) => entries.length > MAX_HISTORY)) {
      // Too many rounds on one item to save in a form replay can trust: stop saving rather than keep a broken save.
      latestDraft.current = null;
      clearResume(browserStorage());
      return;
    }
    latestDraft.current = draft;
    saveResume(browserStorage(), draft);
  };

  const check = () => {
    // Check exactly the text that will be saved, so a resumed replay reaches the same verdict.
    const submitted = boundTyped(typed);
    if (index === undefined || !parts || !canSubmit || answered) return;
    const next = answerCurrent(state, items, submitted);
    if (next === state) return;
    const key = itemKey(index);
    attempts.current = {
      ...attempts.current,
      [key]: appendAttempt(attempts.current[key] ?? [], `${state.hinted ? 'h' : 'n'}:${submitted}`, openClose.current === key),
    };
    openClose.current = next.result === 'close' ? key : null;
    if (submitted !== typed) setTyped(submitted);
    setState(next);
    persist(next);
    if (next.result === 'close') setFocusInput((request) => request + 1);
  };

  const hint = () => {
    const next = showHint(state);
    setState(next);
    if (next !== state) persist(next);
    setFocusInput((request) => request + 1);
  };

  const advance = () => {
    const next = nextItem(state);
    if (next === state) return;
    moves.current++;
    setState(next);
    persist(next);
    setTyped('');
    setFocusInput((request) => request + 1);
  };

  const startOver = () => {
    attempts.current = {};
    openClose.current = null;
    moves.current = 0;
    latestDraft.current = null;
    clearResume(browserStorage());
    setState(startFillIn(items));
    setTyped('');
    setResumePending(false);
    setFocusInput((request) => request + 1);
  };

  const continueSaved = (snapshot: ResumeSnapshot) => {
    const saved = restoreFillIn(items, snapshot, page);
    if (!saved) {
      startOver();
      return;
    }
    attempts.current = saved.attempts;
    openClose.current = saved.state.result === 'close' && saved.state.done === false
      ? itemKey(currentIndex(saved.state) ?? -1) : null;
    moves.current = saved.moves;
    latestDraft.current = fillInDraft(items, saved.state, saved.attempts, saved.moves, page);
    setState(saved.state);
    setTyped(saved.typed);
    setResumePending(false);
    setFocusInput((request) => request + 1);
  };

  const hintMessage = parts && state.hinted ? `starts with ${Array.from(parts.answer.trim())[0]?.toLowerCase() ?? ''}.` : '';
  const resultMessage = state.result === 'right'
    ? state.hinted ? "right. you'll see this one again because you used a hint." : 'right.'
    : state.result === 'close' ? 'almost. check the spelling.'
      : state.result === 'wrong' && parts ? `the word was ${parts.answer}.` : '';
  const message = resultMessage || hintMessage;
  const previous = items.flatMap((_, position) =>
    (attempts.current[itemKey(position)] ?? []).map((attempt, n) => ({
      key: `${position}-${n}`, position: position + 1, word: attempt.slice(2),
    })));

  return (
    <div className="text-ink">
      <ResumePrompt page={page} onContinue={continueSaved} onStartOver={startOver} />
      <div inert={resumePending} data-testid="fill-in-session">
        {state.done ? (
          <div ref={end} tabIndex={-1}>
            <p className="text-lg font-medium">{summary(state)}</p>
          </div>
        ) : item && parts ? (
          <>
            <p className="text-sm text-ink-soft">
              round {state.roundNumber} · item {state.pos + 1} of {state.round.length}
            </p>
            <p id={`${id}-sentence`} className="mt-4 text-xl">
              {parts.before}
              <span aria-hidden="true" className="border-b border-control px-3">_____</span>
              <span className="sr-only">blank</span>
              {parts.after}
            </p>

            <div className="mt-6">
              <div className="flex items-center justify-between">
                <label htmlFor={`${id}-answer`} className="block text-sm font-medium">the missing word</label>
                <button
                  type="button"
                  className="min-h-11 px-2 text-xs leading-relaxed text-ink-soft underline hover:text-ink"
                  onClick={() => {
                    // A select can only submit one of its visible options. Do not retain
                    // an unseen free-text answer when changing back to dropdown mode.
                    if (inputMode === 'type' && typed !== '' && !options.includes(typed)) {
                      setTyped('');
                    }
                    setInputMode(inputMode === 'dropdown' ? 'type' : 'dropdown');
                    setFocusInput((req) => req + 1);
                  }}
                >
                  {inputMode === 'dropdown' ? 'type instead' : 'choose from options'}
                </button>
              </div>

              {inputMode === 'dropdown' ? (
                <select
                  ref={select}
                  id={`${id}-answer`}
                  value={typed}
                  disabled={answered}
                  aria-describedby={message ? `${id}-sentence ${id}-message` : `${id}-sentence`}
                  onChange={(event) => setTyped(event.currentTarget.value)}
                  className="mt-2 min-h-11 w-full rounded-md border border-control bg-surface px-4 py-2.5 text-ink"
                >
                  <option value="">choose an answer...</option>
                  {options.map((option, optIdx) => (
                    <option key={`${option}-${optIdx}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  ref={input}
                  id={`${id}-answer`}
                  value={typed}
                  readOnly={answered}
                  // The sentence describes the field, so moving to the next item reads the new sentence too (Codex on #56).
                  aria-describedby={message ? `${id}-sentence ${id}-message` : `${id}-sentence`}
                  maxLength={MAX_TYPED}
                  onChange={(event) => setTyped(boundTyped(event.currentTarget.value))}
                  onKeyDown={(event) => {
                    // Not while an input method is still composing the word (Codex on #56).
                    if (isCheckKey({ key: event.key, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode })) {
                      event.preventDefault();
                      check();
                    }
                  }}
                  className="mt-2 min-h-11 w-full rounded-md border border-control bg-surface px-4 py-2.5 text-ink"
                  autoComplete="off"
                />
              )}
            </div>

            <p id={`${id}-message`} className="mt-4 min-h-6" aria-live="polite" aria-atomic="true">{message}</p>

            <div className="mt-4 flex flex-wrap gap-3">
              {answered ? (
                <button ref={nextButton} type="button" className={primaryButton} onClick={advance}>next</button>
              ) : (
                <>
                  <button type="button" className={primaryButton} disabled={!canSubmit} onClick={check}>check</button>
                  <button type="button" className={secondaryButton} disabled={state.hinted} onClick={hint}>hint</button>
                </>
              )}
            </div>
          </>
        ) : null}

        {previous.length > 0 && (
          <section className="mt-6" aria-labelledby={`${id}-submitted`}>
            <h2 id={`${id}-submitted`} className="text-sm font-medium">your submitted answers</h2>
            <ol className="mt-2 space-y-1 text-sm text-ink-soft">
              {previous.map(({ key, position, word }) => (
                <li key={key}>item {position}: {word}</li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
