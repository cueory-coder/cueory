import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  beatsLeft,
  BEATS,
  canTakeCue,
  cleanGuess,
  dayNumber,
  guessInWords,
  guessProblem,
  letterMarks,
  MARK_SYMBOL,
  MARK_WORDS,
  playGuess,
  puzzleForDay,
  shareText,
  startPulse,
  takeCue,
  type Mark,
  type PulseState,
} from './pulse';

interface Puzzle {
  word: string;
  cue: string;
}

interface Props {
  /** Sample puzzles (D-61): the page picks one for the visitor's own date. */
  puzzles: Puzzle[];
}

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const primaryButton = 'rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';

/** The date on the share line, in the visitor's own words: "sat 1 nov". */
function dayLabel(date: Date): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
  return `${weekday} ${date.getDate()} ${month}`;
}

/**
 * pulse (D-61): guess the word of the day. Type a guess in the field (or tap the letters below) and press guess; each
 * letter is then marked in place, elsewhere in the word, or not in the word, by a symbol and in words for screen
 * readers, never by color alone. The cue spends one beat. Rendered only in the browser (client:only); without
 * JavaScript the page shows its <noscript> note instead.
 */
export default function PulseGame({ puzzles }: Props) {
  const today = useMemo(() => new Date(), []);
  const puzzle = useMemo(() => puzzleForDay(puzzles, dayNumber(today)), [puzzles, today]);
  const [state, setState] = useState<PulseState>(() => startPulse(puzzle?.word ?? ''));
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  const [said, setSaid] = useState('');
  const [copied, setCopied] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const result = useRef<HTMLDivElement>(null);

  // When the game ends, focus moves to the result so it is read out, and the share button is next.
  useEffect(() => {
    if (state.status !== 'playing') result.current?.focus();
  }, [state.status]);

  if (!puzzle) return <p>no puzzle today.</p>;
  const length = state.answer.length;
  const marks = letterMarks(state.guesses);
  const playing = state.status === 'playing';

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const word = cleanGuess(text);
    const why = guessProblem(word, length);
    if (why) {
      setProblem(why);
      return;
    }
    const next = playGuess(state, word);
    setState(next);
    setText('');
    setProblem('');
    const last = next.guesses.at(-1)!;
    const end =
      next.status === 'solved'
        ? ' solved.'
        : next.status === 'out'
          ? ` out of beats. the word was ${next.answer}.`
          : ` ${beatsLeft(next)} beats left.`;
    setSaid(`${guessInWords(last)}${end}`);
    field.current?.focus({ preventScroll: true });
  };

  const tapLetter = (letter: string) => {
    if (!playing) return;
    setText((current) => cleanGuess(current + letter).slice(0, length));
    setProblem('');
  };

  const cue = () => {
    const next = takeCue(state);
    setState(next);
    setSaid(`cue: ${puzzle.cue} ${beatsLeft(next)} beats left.`);
  };

  const share = async () => {
    const line = shareText(state, dayLabel(today));
    try {
      await navigator.clipboard.writeText(line);
      setCopied(`copied: ${line}`);
    } catch {
      setCopied(line);
    }
  };

  const keyLabel = (letter: string, mark: Mark | undefined) => (mark ? `${letter}, ${MARK_WORDS[mark]}` : letter);

  return (
    <div className="pulse" data-testid="pulse">
      <p className="text-sm text-ink-soft">
        a {length}-letter word · {beatsLeft(state)} of {BEATS} beats left
      </p>

      <ol className="pulse-board mt-4" aria-label="your guesses">
        {state.guesses.map((guess, row) => (
          <li key={row} className="pulse-row" aria-label={`guess ${row + 1}: ${guess.word}. ${guessInWords(guess)}`}>
            {Array.from(guess.word, (letter, i) => (
              <span key={i} className={`pulse-letter pulse-${guess.marks[i]}`} aria-hidden="true">
                <span className="pulse-char">{letter}</span>
                <span className="pulse-symbol">{MARK_SYMBOL[guess.marks[i]!]}</span>
              </span>
            ))}
          </li>
        ))}
      </ol>

      <p className="mt-3 text-sm text-ink-soft">
        {MARK_SYMBOL.here} in place · {MARK_SYMBOL.elsewhere} elsewhere in the word · {MARK_SYMBOL.absent} not in the word
      </p>

      {state.cueUsed && (
        <p className="pulse-cue mt-4" data-testid="pulse-cue">
          <span className="font-medium">cue:</span> {puzzle.cue}
        </p>
      )}

      {playing ? (
        <form className="mt-6 flex flex-wrap items-end gap-3" onSubmit={submit} noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="pulse-guess" className="text-sm text-ink-soft">
              your guess
            </label>
            <input
              id="pulse-guess"
              ref={field}
              className="pulse-field rounded-md border border-control bg-page px-4 py-3 text-ink"
              value={text}
              onChange={(event) => {
                setText(cleanGuess(event.target.value).slice(0, length));
                setProblem('');
              }}
              maxLength={length}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby={problem ? 'pulse-problem' : undefined}
              aria-invalid={problem ? true : undefined}
            />
          </div>
          <button type="submit" className={primaryButton}>
            guess
          </button>
          <button type="button" className="pulse-cue-button" onClick={cue} disabled={!canTakeCue(state)}>
            {state.cueUsed ? 'cue taken' : 'spend a beat on the cue'}
          </button>
          {problem && (
            <p id="pulse-problem" className="w-full text-sm text-ink">
              {problem}
            </p>
          )}
        </form>
      ) : (
        <div ref={result} tabIndex={-1} className="pulse-result mt-6" data-testid="pulse-result">
          <p className="text-lg font-medium">
            {state.status === 'solved' ? 'solved.' : `the word was ${state.answer}.`}
          </p>
          <p className="mt-1 text-ink-soft">{shareText(state, dayLabel(today))}</p>
          <button type="button" className={`${primaryButton} mt-4`} onClick={share}>
            copy my result
          </button>
          {copied && <p className="mt-2 text-sm text-ink-soft">{copied}</p>}
          <p className="mt-4 text-sm text-ink-soft">a new word comes tomorrow.</p>
        </div>
      )}

      {playing && (
        <div className="pulse-keys mt-6" role="group" aria-label="letters">
          {KEY_ROWS.map((row) => (
            <div key={row} className="pulse-key-row">
              {Array.from(row, (letter) => {
                const mark = marks.get(letter);
                return (
                  <button
                    key={letter}
                    type="button"
                    className={`pulse-key${mark ? ` pulse-${mark}` : ''}`}
                    aria-label={keyLabel(letter, mark)}
                    onClick={() => tapLetter(letter)}
                  >
                    <span aria-hidden="true">{letter}</span>
                    {mark && (
                      <span className="pulse-key-symbol" aria-hidden="true">
                        {MARK_SYMBOL[mark]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="pulse-key-row">
            <button
              type="button"
              className="pulse-key pulse-key-wide"
              onClick={() => setText((current) => current.slice(0, -1))}
            >
              delete
            </button>
            <button type="button" className="pulse-key pulse-key-wide" onClick={() => submit()}>
              enter
            </button>
          </div>
        </div>
      )}

      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="pulse-live">
        {said}
      </p>
    </div>
  );
}
