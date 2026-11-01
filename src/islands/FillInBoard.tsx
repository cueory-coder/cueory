import { useEffect, useId, useRef, useState } from 'react';
import {
  answerCurrent, currentIndex, isCheckKey, nextItem, normalizeAnswer, parseItems, sentenceParts, showHint,
  startFillIn, summary, type FillInItem,
} from './fillin';

interface Props { items: FillInItem[] }

const primaryButton =
  'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover disabled:opacity-50';
const secondaryButton = 'min-h-11 rounded-pill border border-control px-5 py-2.5 text-ink disabled:opacity-50';

/** The key starts a fresh session when a parent replaces the items. */
export default function FillInBoard(props: Props) {
  return <Session key={JSON.stringify(props.items)} items={props.items} />;
}

function Session({ items: suppliedItems }: Props) {
  const [items] = useState(() => parseItems(suppliedItems));
  const [state, setState] = useState(() => startFillIn(items));
  const [typed, setTyped] = useState('');
  const [focusInput, setFocusInput] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const id = useId();
  const index = currentIndex(state);
  const item = index === undefined ? undefined : items[index];
  const parts = item ? sentenceParts(item.sentence) : undefined;
  const answered = state.result === 'right' || state.result === 'wrong';

  useEffect(() => {
    if (state.done) end.current?.focus();
    else if (answered) nextButton.current?.focus();
    else if (focusInput > 0) input.current?.focus();
  }, [answered, focusInput, state.done]);

  const check = () => {
    if (!parts || normalizeAnswer(typed) === '' || answered) return;
    const next = answerCurrent(state, items, typed);
    setState(next);
    if (next.result === 'close') setFocusInput((request) => request + 1);
  };

  const hint = () => {
    setState((previous) => showHint(previous));
    setFocusInput((request) => request + 1);
  };

  const advance = () => {
    setState((previous) => nextItem(previous));
    setTyped('');
    setFocusInput((request) => request + 1);
  };

  const hintMessage = parts && state.hinted ? `starts with ${Array.from(parts.answer.trim())[0]?.toLowerCase() ?? ''}.` : '';
  const resultMessage = state.result === 'right'
    ? state.hinted ? "right. you'll see this one again because you used a hint." : 'right.'
    : state.result === 'close' ? 'almost. check the spelling.'
      : state.result === 'wrong' && parts ? `the word was ${parts.answer}.` : '';
  const message = resultMessage || hintMessage;

  if (state.done) {
    return (
      <div ref={end} tabIndex={-1}>
        <p className="text-lg font-medium">{summary(state)}</p>
      </div>
    );
  }

  if (!item || !parts) return null;

  return (
    <div className="text-ink">
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
        <label htmlFor={`${id}-answer`} className="block text-sm font-medium">the missing word</label>
        <input
          ref={input}
          id={`${id}-answer`}
          value={typed}
          readOnly={answered}
          // The sentence describes the field, so moving to the next item reads the new sentence too (Codex on #56).
          aria-describedby={message ? `${id}-sentence ${id}-message` : `${id}-sentence`}
          onChange={(event) => setTyped(event.currentTarget.value)}
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
      </div>

      <p id={`${id}-message`} className="mt-4 min-h-6" aria-live="polite" aria-atomic="true">{message}</p>

      <div className="mt-4 flex flex-wrap gap-3">
        {answered ? (
          <button ref={nextButton} type="button" className={primaryButton} onClick={advance}>next</button>
        ) : (
          <>
            <button type="button" className={primaryButton} disabled={normalizeAnswer(typed) === ''} onClick={check}>check</button>
            <button type="button" className={secondaryButton} disabled={state.hinted} onClick={hint}>hint</button>
          </>
        )}
      </div>
    </div>
  );
}
