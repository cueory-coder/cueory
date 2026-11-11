import '../styles/pillo.css';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
  playablePuzzles,
  playGuess,
  puzzleForDay,
  shareText,
  startPulse,
  WORD_LENGTH,
  type Mark,
  type PulseState,
} from './pulse';
import { dayLabel } from './daily';
import { localDay, reportRound } from './gameresults';
import ResultBrandMark from './ResultBrandMark';
import { gameName } from '../config/games';

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
const columns = Array.from({ length: WORD_LENGTH }, (_, i) => i);

/** One pocket of the blister pack, with its pill: a guessed letter and its mark, a typed letter, or nothing yet. */
function Pocket({ letter, mark, typed, next }: { letter?: string; mark?: Mark; typed?: boolean; next?: boolean }) {
  const kind = mark ? ` pillo-${mark}` : typed ? ' pillo-typed' : next ? ' pillo-next' : '';
  return (
    <span className="pillo-pocket">
      <span className={`pillo-pill${kind}`}>
        {letter && <span className="pillo-letter">{letter.toUpperCase()}</span>}
        {mark && <span className="pillo-mark">{MARK_SYMBOL[mark]}</span>}
      </span>
    </span>
  );
}

/**
 * pillo (Task 114): guess the five-letter word of the day in six tries, on a foil blister pack. After each guess every
 * letter is a pill marked in place (●), elsewhere in the word (○) or not in it (·): by a symbol on the pill and in words
 * for screen readers, never by color alone. Type in the field that lies over the row being typed, or tap the letter
 * keys. Rendered only in the browser (client:only); without JavaScript the page shows its <noscript> note instead.
 */
export default function PulseGame({ puzzles }: Props) {
  const today = useMemo(() => new Date(), []);
  const puzzle = useMemo(() => puzzleForDay(playablePuzzles(puzzles), dayNumber(today)), [puzzles, today]);
  const [state, setState] = useState<PulseState>(() => startPulse(puzzle?.word ?? ''));
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  const [said, setSaid] = useState('');
  const [copied, setCopied] = useState('');
  const result = useRef<HTMLDivElement>(null);
  const reported = useRef(false);

  // When the game ends, focus moves to the result so it is read out, and the share button is next. The round is also
  // reported once, for the stats panel, which keeps it only if the student has turned stats on (D-76).
  useEffect(() => {
    if (state.status === 'playing') return;
    result.current?.focus();
    if (reported.current) return;
    reported.current = true;
    const tries = GUESSES - guessesLeft(state);
    const solved = state.status === 'solved';
    reportRound({
      game: 'pulse',
      day: localDay(today),
      solved,
      tries,
      card: {
        game: 'pulse',
        name: gameName('pulse'),
        date: dayLabel(today),
        result: solved ? `${tries} / ${GUESSES}` : 'not solved',
        summary: solved ? 'you found today\'s word.' : 'today\'s word is ready for another try tomorrow.',
        stats: [{ label: 'guesses', value: `${tries}` }],
        path: '/play/pillo',
      },
    });
  }, [state.status]);

  if (!puzzle) return <p>no puzzle today.</p>;
  const marks = letterMarks(state.guesses);
  const playing = state.status === 'playing';
  const left = guessesLeft(state);
  const leftWords = `${left} of ${GUESSES} ${left === 1 ? 'guess' : 'guesses'} left`;
  // Rows below the guesses: the one being typed (while playing), then bare pockets.
  const emptyRows = GUESSES - state.guesses.length - (playing ? 1 : 0);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!playing) return;
    const word = cleanGuess(text);
    const why = guessProblem(word, WORD_LENGTH);
    if (why) {
      setProblem(why);
      setSaid(why);
      return;
    }
    const next = playGuess(state, word);
    setState(next);
    setText('');
    setProblem('');
    const last = next.guesses.at(-1)!;
    const n = guessesLeft(next);
    const end =
      next.status === 'solved'
        ? ' solved.'
        : next.status === 'out'
          ? ` out of guesses. the word was ${next.answer}.`
          : ` ${n} ${n === 1 ? 'guess' : 'guesses'} left.`;
    setSaid(`${guessInWords(last)}${end}`);
  };

  const type = (value: string) => {
    setText(cleanGuess(value).slice(0, WORD_LENGTH));
    setProblem('');
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
  const rowClass = (row: number) => `pillo-row${row === GUESSES - 1 ? ' pillo-row-last' : ''}`;

  return (
    <div className="pillo" data-testid="pulse">
      <div className="pillo-top">
        <p className="pillo-status">
          guess the {WORD_LENGTH}-letter word · <strong>{leftWords}</strong>
        </p>
        {/* The same count as the words beside it, drawn as a blister strip: a used guess leaves an empty pocket. */}
        <span className="pillo-strip" aria-hidden="true" data-testid="pulse-strip">
          {Array.from({ length: GUESSES }, (_, i) => (
            <span key={i} className={`pillo-strip-pocket${i >= GUESSES - left ? ' pillo-strip-pill' : ''}`} />
          ))}
        </span>
      </div>

      <div className="pillo-pack mt-4">
        <ol className="pillo-board" aria-label="your guesses">
          {state.guesses.map((guess, row) => (
            <li key={row} className={rowClass(row)} aria-label={`guess ${row + 1}: ${guess.word}. ${guessInWords(guess)}`}>
              {Array.from(guess.word, (letter, i) => (
                <Pocket key={i} letter={letter} mark={guess.marks[i]} />
              ))}
            </li>
          ))}
        </ol>

        {playing && (
          <form className={rowClass(state.guesses.length)} onSubmit={submit} noValidate>
            {columns.map((i) => (
              <Pocket key={i} letter={text[i]} typed={i < text.length} next={i === text.length} />
            ))}
            <label htmlFor="pillo-guess" className="sr-only">
              your guess
            </label>
            <input
              id="pillo-guess"
              className="pillo-field"
              value={text}
              onChange={(event) => type(event.target.value)}
              maxLength={WORD_LENGTH}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              aria-describedby={problem ? 'pillo-problem pillo-hint' : 'pillo-hint'}
              aria-invalid={problem ? true : undefined}
            />
          </form>
        )}

        {Array.from({ length: emptyRows }, (_, i) => {
          const row = GUESSES - emptyRows + i;
          return (
            <div key={row} className={rowClass(row)} aria-hidden="true">
              {columns.map((c) => (
                <Pocket key={c} />
              ))}
            </div>
          );
        })}
      </div>

      <p id="pillo-hint" className="sr-only">
        type a {WORD_LENGTH}-letter word and press enter, or tap the letters below.
      </p>
      {problem && (
        <p id="pillo-problem" className="mt-3 text-sm text-ink" data-testid="pulse-problem">
          {problem}
        </p>
      )}

      {playing ? (
        <div className="pillo-keys mt-6" role="group" aria-label="letters">
          {KEY_ROWS.map((row, r) => (
            <div key={row} className="pillo-key-row">
              {r === KEY_ROWS.length - 1 && (
                <button
                  type="button"
                  className="pillo-key pillo-key-wide"
                  aria-label="delete"
                  onClick={() => type(text.slice(0, -1))}
                >
                  ⌫
                </button>
              )}
              {Array.from(row, (letter) => {
                const mark = marks.get(letter);
                return (
                  <button
                    key={letter}
                    type="button"
                    className={`pillo-key${mark ? ` pillo-${mark}` : ''}`}
                    aria-label={keyLabel(letter, mark)}
                    onClick={() => type(text + letter)}
                  >
                    <span aria-hidden="true">{letter.toUpperCase()}</span>
                    {mark && (
                      <span className="pillo-key-mark" aria-hidden="true">
                        {MARK_SYMBOL[mark]}
                      </span>
                    )}
                  </button>
                );
              })}
              {r === KEY_ROWS.length - 1 && (
                <button type="button" className="pillo-key pillo-key-wide" onClick={() => submit()}>
                  enter
                </button>
              )}
            </div>
          ))}
        </div>
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

      <section className="pillo-legend mt-8" aria-labelledby="pillo-how">
        <h3 id="pillo-how" className="text-lg font-semibold">
          how to play
        </h3>
        <ul className="mt-3 flex flex-col gap-3 text-sm">
          {(['here', 'elsewhere', 'absent'] as const).map((mark) => (
            <li key={mark} className="pillo-legend-row">
              <span className={`pillo-pill pillo-${mark}`} aria-hidden="true">
                <span className="pillo-mark">{MARK_SYMBOL[mark]}</span>
              </span>
              <span>
                {MARK_SYMBOL[mark]} {mark === 'here' ? 'in its place' : mark === 'elsewhere' ? 'in the word, somewhere else' : 'not in the word'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-sm text-ink-soft">
          every word has {WORD_LENGTH} letters, and you have {GUESSES} guesses.
        </p>
      </section>

      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="pulse-live">
        {said}
      </p>
    </div>
  );
}
