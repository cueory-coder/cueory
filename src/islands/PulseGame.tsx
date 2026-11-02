import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  cleanGuess,
  dayNumber,
  GUESSES,
  guessesLeft,
  guessInWords,
  guessProblem,
  letterMarks,
  MARK_SYMBOL,
  MARK_WORDS,
  markGuess,
  playGuess,
  puzzleForDay,
  shareText,
  startPulse,
  type Mark,
  type PulseState,
} from './pulse';
import { dayLabel } from './daily';
import { localDay, reportRound } from './gameresults';
import ResultBrandMark from './ResultBrandMark';

interface Puzzle {
  word: string;
  cue: string;
}

interface Props {
  /** Sample puzzles: the page picks one for the visitor's own date. */
  puzzles: Puzzle[];
}

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const primaryButton = 'rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';

function PillCell({
  letter,
  mark,
  isActive,
  isFocus,
}: {
  letter?: string;
  mark?: Mark;
  isActive?: boolean;
  isFocus?: boolean;
}) {
  let cellClass = 'pillo-cell';
  if (mark === 'here') cellClass += ' pillo-here';
  else if (mark === 'elsewhere') cellClass += ' pillo-elsewhere';
  else if (mark === 'absent') cellClass += ' pillo-absent';
  else if (isActive && letter) cellClass += ' pillo-typed';
  else if (isActive && isFocus) cellClass += ' pillo-focus';
  else cellClass += ' pillo-empty';

  return (
    <div className={cellClass} aria-hidden="true">
      {letter && <span className="pillo-letter">{letter.toUpperCase()}</span>}
      {mark && <span className="pillo-symbol">{MARK_SYMBOL[mark]}</span>}
    </div>
  );
}

/**
 * pillo (task-114): guess the word of the day. Six tries, five-letter words.
 * Letters are marked in place (●), elsewhere (○), or not in the word (·) — never by color alone.
 * Rendered only in the browser (client:only); without JavaScript the page shows its <noscript> note.
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
  const reported = useRef(false);

  useEffect(() => {
    if (state.status === 'playing') return;
    result.current?.focus();
    if (reported.current) return;
    reported.current = true;
    reportRound({
      game: 'pulse',
      day: localDay(today),
      solved: state.status === 'solved',
      tries: GUESSES - guessesLeft(state),
    });
  }, [state.status]);

  if (!puzzle) return <p>no puzzle today.</p>;
  const length = state.answer.length;
  const marks = letterMarks(state.guesses);
  const playing = state.status === 'playing';
  const currentRow = state.guesses.length;
  const left = guessesLeft(state);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const word = cleanGuess(text);
    const why = guessProblem(word, length);
    if (why) {
      setProblem(why);
      field.current?.focus({ preventScroll: true });
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
          ? ` out of guesses. the word was ${next.answer}.`
          : ` ${guessesLeft(next)} ${guessesLeft(next) === 1 ? 'guess' : 'guesses'} left.`;
    setSaid(`${guessInWords(last)}${end}`);
    field.current?.focus({ preventScroll: true });
  };

  const tapLetter = (letter: string) => {
    if (!playing) return;
    setText((current) => cleanGuess(current + letter).slice(0, length));
    setProblem('');
    field.current?.focus({ preventScroll: true });
  };

  const tapDelete = () => {
    if (!playing) return;
    setText((current) => current.slice(0, -1));
    setProblem('');
    field.current?.focus({ preventScroll: true });
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

  // Build the 6×5 board: committed rows, the current typing row, then empty rows.
  const rows = Array.from({ length: GUESSES }, (_, rowIdx) => {
    const committed = state.guesses[rowIdx];
    if (committed) {
      return { type: 'committed' as const, guess: committed };
    }
    if (rowIdx === currentRow && playing) {
      return { type: 'active' as const, text };
    }
    return { type: 'empty' as const };
  });

  return (
    <div className="pillo" data-testid="pulse">
      {/* Guesses-left strip */}
      <div className="pillo-strip" aria-label={`${left} of ${GUESSES} guesses left`}>
        {Array.from({ length: GUESSES }, (_, i) => (
          <div key={i} className={`pillo-pip${i < GUESSES - left ? ' pillo-pip-used' : ''}`} aria-hidden="true" />
        ))}
        <span className="sr-only">{left} of {GUESSES} guesses left</span>
      </div>

      <p className="mt-2 text-sm text-ink-soft" aria-live="polite">
        {playing
          ? `guess ${currentRow + 1} of ${GUESSES}`
          : state.status === 'solved'
            ? 'solved!'
            : `the word was ${state.answer}`}
      </p>

      {/* Blister-pack board */}
      <div className="pillo-board mt-4" aria-label="your guesses" role="group">
        {rows.map((row, rowIdx) => {
          if (row.type === 'committed') {
            return (
              <div
                key={rowIdx}
                className="pillo-row"
                role="listitem"
                aria-label={`guess ${rowIdx + 1}: ${row.guess.word}. ${guessInWords(row.guess)}`}
              >
                {Array.from(row.guess.word, (letter, i) => (
                  <PillCell key={i} letter={letter} mark={row.guess.marks[i]} />
                ))}
              </div>
            );
          }
          if (row.type === 'active') {
            const typedLetters = Array.from({ length }, (_, i) => row.text[i] ?? '');
            return (
              <div key={rowIdx} className="pillo-row pillo-row-active" aria-hidden="true">
                {typedLetters.map((letter, i) => (
                  <PillCell
                    key={i}
                    letter={letter}
                    isActive
                    isFocus={i === row.text.length && i < length}
                  />
                ))}
              </div>
            );
          }
          return (
            <div key={rowIdx} className="pillo-row" aria-hidden="true">
              {Array.from({ length }, (_, i) => <PillCell key={i} />)}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-sm text-ink-soft">
        {MARK_SYMBOL.here} in place · {MARK_SYMBOL.elsewhere} elsewhere · {MARK_SYMBOL.absent} not in the word
      </p>

      {playing ? (
        <form className="mt-4" onSubmit={submit} noValidate>
          {/* Visually hidden input: captures keyboard on desktop; on-screen keyboard adds letters directly */}
          <label className="sr-only" htmlFor="pillo-guess">type your guess</label>
          <input
            id="pillo-guess"
            ref={field}
            className="pillo-hidden-field"
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
            aria-describedby={problem ? 'pillo-problem' : 'pillo-hint'}
            aria-invalid={problem ? true : undefined}
          />
          <p id="pillo-hint" className="sr-only">type a {length}-letter word and press enter to guess</p>
          {problem && (
            <p id="pillo-problem" className="mt-2 text-sm text-ink" role="alert">
              {problem}
            </p>
          )}
        </form>
      ) : (
        <div ref={result} tabIndex={-1} className="pillo-result mt-6" data-testid="pulse-result">
          <p className="text-lg font-medium">
            {state.status === 'solved' ? 'solved.' : `the word was ${state.answer}.`}
          </p>
          <p className="mt-1 text-ink-soft">{shareText(state, dayLabel(today))}</p>
          <button type="button" className={`${primaryButton} mt-4`} onClick={share}>
            copy my result
          </button>
          {copied && <p className="mt-2 text-sm text-ink-soft">{copied}</p>}
          <p className="mt-4 text-sm text-ink-soft">a new word comes tomorrow.</p>
          <ResultBrandMark path="/play" />
        </div>
      )}

      {/* On-screen keyboard */}
      {playing && (
        <div className="pillo-keys mt-6" role="group" aria-label="letters">
          {KEY_ROWS.map((row) => (
            <div key={row} className="pillo-key-row">
              {Array.from(row, (letter) => {
                const mark = marks.get(letter);
                return (
                  <button
                    key={letter}
                    type="button"
                    className={`pillo-key${mark ? ` pillo-${mark}` : ''}`}
                    aria-label={keyLabel(letter, mark)}
                    onClick={() => tapLetter(letter)}
                    tabIndex={-1}
                  >
                    <span aria-hidden="true">{letter.toUpperCase()}</span>
                    {mark && (
                      <span className="pillo-key-symbol" aria-hidden="true">
                        {MARK_SYMBOL[mark]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="pillo-key-row">
            <button
              type="button"
              className="pillo-key pillo-key-wide"
              aria-label="delete last letter"
              onClick={tapDelete}
              tabIndex={-1}
            >
              ⌫
            </button>
            <button
              type="button"
              className="pillo-key pillo-key-wide"
              aria-label="submit guess"
              onClick={() => submit()}
              tabIndex={-1}
            >
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
