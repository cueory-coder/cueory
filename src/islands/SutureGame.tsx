import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { dayLabel } from './daily';
import { localDay, reportRound } from './gameresults';
import { cellLabel, clearTrace, foundWord, isDone, parsePuzzle, pathBetween, shareLine, startSuture, stitch, tapCell, traceInWords, wordsLeft, type Cell, type SuturePuzzle } from './suture';

interface Props { puzzle: SuturePuzzle; name: string }
const button = 'min-h-11 min-w-11 rounded-md border border-control bg-page px-4 py-2 text-ink disabled:opacity-50';

function Board({ puzzle, name }: Props) {
  const [state, setState] = useState(() => startSuture(puzzle));
  const [focused, setFocused] = useState(0);
  const [said, setSaid] = useState('');
  const [copied, setCopied] = useState('');
  const [shaking, setShaking] = useState(false);
  const [today] = useState(() => new Date());
  const result = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const help = useId();
  const done = isDone(state);
  const width = puzzle.grid[0]!.length;
  const shared = shareLine(state, dayLabel(today), name);
  const foundCount = state.found.length;

  useEffect(() => { if (done) result.current?.focus(); }, [done]);

  const reported = useRef(false);
  useEffect(() => {
    if (!done || reported.current) return;
    reported.current = true;
    reportRound({ game: 'suture', day: localDay(today), solved: true, tries: state.looseStitches });
  }, [done]);

  const activePath = state.anchor && state.cursor && !state.anchor.every((v, i) => v === state.cursor![i])
    ? pathBetween(state.anchor, state.cursor)
    : state.anchor ? [state.anchor] : null;

  const tap = (cell: Cell) => {
    const next = tapCell(state, puzzle, cell);
    if (next === state) return;
    setState(next);
    setSaid(traceInWords(next, puzzle));
  };

  const sew = () => {
    const outcome = stitch(state, puzzle);
    setState(outcome.state);
    if (outcome.found) {
      setSaid(`found word ${outcome.word}: ${puzzle.words[outcome.word! - 1]!.answer.toLowerCase()}.${isDone(outcome.state) ? ' all words found.' : ''}`);
      setShaking(false);
    } else {
      setSaid("loose stitch: those letters aren't one of the words.");
      setShaking(true);
      setTimeout(() => setShaking(false), 400);
    }
  };

  const key = (event: KeyboardEvent<HTMLButtonElement>, cell: Cell) => {
    if (done || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); tap(cell); return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      setState((s) => clearTrace(s));
      setSaid('selection cleared.');
      return;
    }
    let [row, col] = cell;
    if (event.key === 'ArrowLeft') col--;
    else if (event.key === 'ArrowRight') col++;
    else if (event.key === 'ArrowUp') row--;
    else if (event.key === 'ArrowDown') row++;
    else return;
    event.preventDefault();
    if (row < 0 || col < 0 || row >= puzzle.grid.length || col >= width) return;
    const next = row * width + col;
    setFocused(next);
    buttons.current.get(next)?.focus();
  };

  const share = async () => {
    try { await navigator.clipboard.writeText(shared); setCopied(`copied: ${shared}`); }
    catch { setCopied(shared); }
  };

  return (
    <section aria-label={`${name} puzzle`} data-testid="suture">
      {puzzle.sample && <p className="text-sm text-ink-soft">today's puzzle is a sample</p>}
      {puzzle.theme && <p className="mt-1 text-xl font-bold text-ink">{puzzle.theme}</p>}
      <p className="mt-1 text-sm text-ink-soft">
        find all {state.totalWords} words. they run up, down, left or right.
      </p>
      <p className="mt-2 text-sm text-ink-soft">{wordsLeft(state)} words left · {state.looseStitches} loose {state.looseStitches === 1 ? 'stitch' : 'stitches'}</p>
      <p id={help} className="mt-2 text-sm text-ink-soft">tap a letter to anchor it, then tap the other end of the word, then stitch. arrows move; enter or space selects. backspace clears.</p>
      <div className="mt-4">
        <div
          role="grid"
          aria-label={`${name} letters`}
          aria-describedby={help}
          aria-rowcount={puzzle.grid.length}
          aria-colcount={width}
          className={`w-full text-ink${shaking ? ' suture-shake' : ''}`}
          style={{ display: 'grid', gridTemplateColumns: `repeat(${width}, 1fr)`, border: '2.5px solid currentColor' }}
        >
          {puzzle.grid.map((row, r) => (
            <div key={r} role="row" aria-rowindex={r + 1} style={{ display: 'contents' }}>
              {row.split('').map((letter, c) => {
                const cell: Cell = [r, c];
                const index = r * width + c;
                const word = foundWord(state, puzzle, cell);
                const inActivePath = activePath?.some(([pr, pc]) => pr === r && pc === c) ?? false;
                const isAnchor = state.anchor?.[0] === r && state.anchor?.[1] === c;
                return (
                  <div role="gridcell" aria-colindex={c + 1} key={c}>
                    <button
                      ref={(el) => { if (el) buttons.current.set(index, el); else buttons.current.delete(index); }}
                      type="button"
                      tabIndex={index === focused ? 0 : -1}
                      disabled={done}
                      aria-label={cellLabel(state, puzzle, cell)}
                      aria-pressed={isAnchor || inActivePath}
                      aria-disabled={word !== undefined || done}
                      data-cell={index}
                      className={`relative w-full flex items-center justify-center font-bold text-ink${
                        word !== undefined
                          ? ' bg-line'
                          : isAnchor
                          ? ' bg-button text-on-button'
                          : inActivePath
                          ? ' bg-surface'
                          : ' bg-page'
                      }`}
                      style={{ aspectRatio: '1 / 1' }}
                      onFocus={() => setFocused(index)}
                      onClick={() => tap(cell)}
                      onKeyDown={(event) => key(event, cell)}
                    >
                      <span aria-hidden="true" className={word !== undefined ? 'line-through opacity-50' : ''}>{letter}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-sm text-ink-soft" data-testid="suture-trace">{traceInWords(state, puzzle)}</p>
      {!done && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={button} onClick={sew} disabled={!state.anchor || !state.cursor || (state.anchor[0] === state.cursor[0] && state.anchor[1] === state.cursor[1])}>stitch</button>
          <button type="button" className={button} onClick={() => { setState(clearTrace(state)); setSaid('selection cleared.'); }} disabled={!state.anchor}>clear</button>
        </div>
      )}
      <p className="mt-2 text-sm text-ink-soft">{foundCount} of {state.totalWords} found</p>
      <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="word cues">
        {puzzle.words.map((word, i) => {
          const iFound = state.found.includes(i);
          return (
            <li key={i} className={`rounded-md border p-2 text-sm${iFound ? ' border-line text-ink-soft' : ' border-control text-ink'}`}>
              {iFound ? <s>{word.answer.toLowerCase()}</s> : <span className="font-bold">{word.answer.toLowerCase()}</span>}
              {word.cue && !iFound && <span className="block text-xs text-ink-soft">{word.cue}</span>}
            </li>
          );
        })}
      </ol>
      {done && (
        <div ref={result} tabIndex={-1} className="mt-6 rounded-md border border-control p-4" data-testid="suture-result">
          <p className="text-lg font-medium">all words found.</p>
          <p className="mt-2">{shared}</p>
          <button type="button" className={`${button} mt-3`} onClick={share}>copy my result</button>
          {copied && <p className="mt-2 text-sm text-ink-soft" aria-live="polite">{copied}</p>}
        </div>
      )}
      <p className="mt-3 text-sm text-ink-soft" aria-live="polite" aria-atomic="true" data-testid="suture-live">{said}</p>
    </section>
  );
}

/** Reviewed puzzle data and the configurable display name are supplied by the page. */
export default function SutureGame({ puzzle, name }: Props) {
  try {
    const parsed = parsePuzzle(puzzle);
    return <Board key={JSON.stringify(parsed)} puzzle={parsed} name={name} />;
  } catch { return <p role="alert">this puzzle could not be loaded. please try again later.</p>; }
}
