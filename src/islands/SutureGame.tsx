import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { dayLabel } from './daily';
import { cellLabel, clearTrace, foundWord, isDone, parsePuzzle, shareLine, startSuture, stitch, tapCell, traceInWords, wordsLeft, type Cell, type SuturePuzzle } from './suture';

interface Props { puzzle: SuturePuzzle; name: string }
const button = 'min-h-11 min-w-11 rounded-md border border-control bg-page px-4 py-2 text-ink disabled:opacity-50';

function Board({ puzzle, name }: Props) {
  const [state, setState] = useState(() => startSuture(puzzle));
  const [focused, setFocused] = useState(0);
  const [said, setSaid] = useState('');
  const [copied, setCopied] = useState('');
  const [today] = useState(() => new Date());
  const result = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const help = useId();
  const done = isDone(state);
  const width = puzzle.grid[0]!.length;
  const shared = shareLine(state, dayLabel(today), name);

  useEffect(() => { if (done) result.current?.focus(); }, [done]);

  const tap = (cell: Cell) => {
    const next = tapCell(state, puzzle, cell);
    if (next === state) {
      setSaid('choose a touching letter, up, down, left or right. a found word stays in place.');
      return;
    }
    setState(next);
    setSaid(traceInWords(next, puzzle));
  };

  const key = (event: KeyboardEvent<HTMLButtonElement>, cell: Cell) => {
    if (done || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); tap(cell); return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      const last = state.trace.at(-1);
      if (last) tap(last);
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

  const sew = () => {
    const outcome = stitch(state, puzzle);
    setState(outcome.state);
    setSaid(outcome.found
      ? `found word ${outcome.word}: ${puzzle.words[outcome.word! - 1]!.answer.toLowerCase()}.${isDone(outcome.state) ? ' all words found.' : ''}`
      : "loose stitch: those letters aren't one of the words.");
  };

  const share = async () => {
    try { await navigator.clipboard.writeText(shared); setCopied(`copied: ${shared}`); }
    catch { setCopied(shared); }
  };

  return (
    <section aria-label={`${name} puzzle`} data-testid="suture">
      {puzzle.sample && <p className="text-sm text-ink-soft">today's puzzle is a sample</p>}
      <p className="mt-2 text-sm text-ink-soft">{wordsLeft(state)} words left · {state.looseStitches} loose {state.looseStitches === 1 ? 'stitch' : 'stitches'}</p>
      <p id={help} className="mt-3 text-sm text-ink-soft">tap touching letters, then stitch. arrows move; enter or space chooses a letter. backspace removes the last letter. words run up, down, left or right.</p>
      <div className="mt-4 max-w-full overflow-x-auto">
        <div role="grid" aria-label={`${name} letters`} aria-describedby={help} aria-rowcount={puzzle.grid.length} aria-colcount={width} className="mx-auto flex w-max flex-col gap-1 p-1">
          {puzzle.grid.map((row, r) => <div role="row" aria-rowindex={r + 1} key={r} className="flex gap-1">
            {[...row].map((letter, c) => {
              const cell: Cell = [r, c];
              const index = r * width + c;
              const position = state.trace.findIndex(([row, col]) => row === r && col === c);
              const word = foundWord(state, puzzle, cell);
              return <div role="gridcell" aria-colindex={c + 1} aria-selected={position >= 0} key={c}>
                <button
                  ref={(element) => { if (element) buttons.current.set(index, element); else buttons.current.delete(index); }}
                  type="button" tabIndex={index === focused ? 0 : -1} disabled={done}
                  aria-label={cellLabel(state, puzzle, cell)} aria-pressed={position >= 0}
                  aria-disabled={word !== undefined || done} data-cell={index}
                  className={`relative flex size-11 items-center justify-center rounded-sm border text-lg text-ink ${position >= 0 ? 'border-b-4 border-ink bg-surface outline outline-2 outline-ink' : 'border-control bg-page'}`}
                  onFocus={() => setFocused(index)} onClick={() => tap(cell)} onKeyDown={(event) => key(event, cell)}
                >
                  <span aria-hidden="true">{letter}</span>
                  {position >= 0 && <span aria-hidden="true" className="absolute left-0 top-0 px-1 text-xs">{position + 1}</span>}
                  {word !== undefined && <span aria-hidden="true" className="absolute right-0 bottom-0 px-1 text-xs">{word} ✓</span>}
                </button>
              </div>;
            })}
          </div>)}
        </div>
      </div>
      <p className="mt-3 text-sm text-ink-soft" data-testid="suture-trace">{traceInWords(state, puzzle)}</p>
      {!done && <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={button} onClick={sew} disabled={!state.trace.length}>stitch</button>
        <button type="button" className={button} onClick={() => { setState(clearTrace(state)); setSaid('trace cleared.'); }} disabled={!state.trace.length}>clear</button>
      </div>}
      <ol className="mt-6 flex flex-col gap-3" aria-label="word cues">
        {puzzle.words.map((word, i) => <li key={i} className="rounded-md border border-line p-3">
          <span className="font-medium">{i + 1}. </span>{state.found.includes(i) && <span>found: {word.answer.toLowerCase()}. </span>}{word.cue} ({word.answer.length})
        </li>)}
      </ol>
      {done && <div ref={result} tabIndex={-1} className="mt-6 rounded-md border border-control p-4" data-testid="suture-result">
        <p className="text-lg font-medium">all words found.</p>
        <p className="mt-2">{shared}</p>
        <button type="button" className={`${button} mt-3`} onClick={share}>copy my result</button>
        {copied && <p className="mt-2 text-sm text-ink-soft" aria-live="polite">{copied}</p>}
      </div>}
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
