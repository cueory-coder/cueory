import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { dayLabel } from './daily';
import {
  checkAll, checkWord, currentWord, emptyState, erase, isSolved, move, nextWord, numbering,
  parsePuzzle, previousWord, revealCue, selectCell, shareLine, toggleDirection, type, words,
  type CuewordPuzzle, type CuewordState, type Direction,
} from './cueword';

interface Props { puzzle: CuewordPuzzle; name: string }
const button = 'min-h-11 min-w-11 rounded-md border border-control bg-page px-4 py-2 text-ink disabled:opacity-50';
const letterButton = 'flex size-11 shrink-0 items-center justify-center rounded-md border border-control bg-page text-ink';

function elapsedText(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function Board({ puzzle, name }: Props) {
  const [state, setState] = useState(() => emptyState(puzzle));
  const [said, setSaid] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState('');
  const [today] = useState(() => new Date());
  const started = useRef(Date.now());
  const cells = useRef(new Map<number, HTMLButtonElement>());
  const focusGrid = useRef(false);
  const result = useRef<HTMLDivElement>(null);
  const checkButton = useRef<HTMLButtonElement>(null);
  const help = useId();
  const list = useMemo(() => words(puzzle), [puzzle]);
  const numbers = useMemo(() => numbering(puzzle), [puzzle]);
  const width = puzzle.grid[0]!.length;
  const active = currentWord(state);
  const clue = puzzle.clues[active.direction].find((item) => item.number === active.number)!;
  const solved = isSolved(state);
  const shared = shareLine({ solved, seconds: elapsed, cues: state.cued.length }, dayLabel(today), name);

  useEffect(() => {
    if (solved) return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started.current) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [solved]);

  useEffect(() => {
    if (solved) result.current?.focus();
    else if (focusGrid.current) cells.current.get(state.cell)?.focus();
    focusGrid.current = false;
  }, [state, solved]);

  const update = (next: CuewordState, focus = true) => {
    if (!solved && isSolved(next)) setElapsed(Math.floor((Date.now() - started.current) / 1000));
    focusGrid.current = focus;
    setState(next);
  };

  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (solved || event.altKey || event.ctrlKey || event.metaKey) return;
    let next: CuewordState;
    if (/^[a-z]$/i.test(event.key)) next = type(state, event.key);
    else if (event.key === 'Backspace' || event.key === 'Delete') next = erase(state);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') next = move(state, event.key);
    else if (event.key === ' ') next = toggleDirection(state);
    else if (event.key === 'Tab') next = event.shiftKey ? previousWord(state) : nextWord(state);
    else if (event.key === 'Escape') {
      event.preventDefault();
      checkButton.current?.focus();
      return;
    } else return;
    event.preventDefault();
    update(next);
  };

  const check = (all = false) => {
    const next = all ? checkAll(state) : checkWord(state);
    const checked = all ? list.flatMap((word) => word.cells) : active.cells;
    const unique = [...new Set(checked)];
    const wrong = unique.filter((cell) => next.checks[cell] === 'wrong').length;
    const empty = unique.filter((cell) => next.checks[cell] === 'empty').length;
    const where = all ? 'the puzzle' : `${active.number} ${active.direction}`;
    setSaid(`${wrong} ${wrong === 1 ? 'letter is' : 'letters are'} wrong in ${where}. ${empty} ${empty === 1 ? 'cell is' : 'cells are'} empty.`);
    update(next, false);
  };

  const cue = () => {
    const next = revealCue(state, state.cell);
    if (next === state) return;
    update(next);
    setSaid(`letter ${next.entries[state.cell]?.toLowerCase()} revealed. ${next.cued.length} of 3 cues used. this letter stays in place.`);
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(shared);
      setCopied(`copied: ${shared}`);
    } catch {
      setCopied(shared);
    }
  };

  return (
    <section aria-label={`${name} puzzle`} data-testid="cueword">
      {puzzle.sample && <p className="text-sm text-ink-soft">today's puzzle is a sample</p>}
      <p className="mt-2 text-sm text-ink-soft"><span className="tabular-nums">{elapsedText(elapsed)}</span> · {state.cued.length} of 3 cues used</p>
      <p className="mt-4 font-medium" aria-live="polite" aria-atomic="true" data-testid="cueword-clue">
        {active.number} {active.direction}: {clue.text}
      </p>
      <p id={help} className="mt-2 text-sm text-ink-soft">
        type letters. arrows move, space switches direction, and tab or shift+tab changes word. escape leaves the grid.
        the outlined and underlined cells are the current word.
      </p>

      <div className="mt-4 max-w-full overflow-x-auto">
        <div role="grid" aria-label={`${name} grid`} aria-describedby={help} aria-rowcount={puzzle.grid.length} aria-colcount={width} className="mx-auto flex w-max flex-col gap-1 p-1" onKeyDown={key}>
          {puzzle.grid.map((row, r) => (
            <div role="row" aria-rowindex={r + 1} key={r} className="flex gap-1">
              {[...row].map((answer, c) => {
                const cell = r * width + c;
                if (answer === '.') return <div role="gridcell" aria-colindex={c + 1} aria-label="gap" key={cell} className="size-11" />;
                const word = list.find((item) => item.direction === state.direction && item.cells.includes(cell)) ?? list.find((item) => item.cells.includes(cell))!;
                const selected = active.cells.includes(cell);
                const cued = state.cued.includes(cell);
                const mark = state.checks[cell];
                const number = numbers[r]![c];
                const label = `row ${r + 1}, column ${c + 1}, ${word.number} ${word.direction}, ${state.entries[cell] ? `letter ${state.entries[cell]}` : 'empty'}${cued ? ', cued' : mark ? `, ${mark}` : ''}`;
                return (
                  <div role="gridcell" aria-colindex={c + 1} aria-selected={selected} key={cell}>
                    <button
                      ref={(element) => { if (element) cells.current.set(cell, element); else cells.current.delete(cell); }}
                      type="button"
                      tabIndex={cell === state.cell ? 0 : -1}
                      disabled={solved}
                      aria-label={label}
                      aria-pressed={cell === state.cell}
                      data-cell={cell}
                      data-cued={cued || undefined}
                      className={`relative flex size-11 items-center justify-center rounded-sm border text-lg text-ink ${selected ? 'border-b-4 border-ink outline outline-2 outline-ink underline decoration-2 underline-offset-4' : 'border-control'} ${cell === state.cell ? 'bg-surface' : 'bg-page'}`}
                      onClick={() => update(selectCell(state, cell))}
                    >
                      {number !== null && <span className="absolute left-0 top-0 px-1 text-xs" aria-hidden="true">{number}</span>}
                      <span aria-hidden="true">{state.entries[cell] || '\u00a0'}</span>
                      {(cued || mark) && <span className="absolute right-0 bottom-0 px-1 text-xs" aria-hidden="true">{cued ? 'cue' : mark === 'wrong' ? '×' : mark === 'right' ? '✓' : '?'}</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {!solved && (
        <>
          <div className="mx-auto mt-6 flex max-w-sm flex-wrap justify-center gap-1" role="group" aria-label="letters">
            {[...'abcdefghijklmnopqrstuvwxyz'].map((letter) => <button type="button" key={letter} className={letterButton} onClick={() => update(type(state, letter))}>{letter}</button>)}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2" role="group" aria-label="puzzle controls">
            <button type="button" className={button} onClick={() => update(erase(state))}>erase</button>
            <button type="button" className={button} onClick={cue} disabled={state.cued.length >= 3 || state.cued.includes(state.cell)}>cue</button>
            <button ref={checkButton} type="button" className={button} onClick={() => check()}>check</button>
            <button type="button" className={button} onClick={() => check(true)}>check all</button>
          </div>
          <p className="mt-2 text-sm text-ink-soft">× wrong · ✓ right · ? empty · a cued letter stays in place</p>
        </>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {(['across', 'down'] as const).map((direction: Direction) => (
          <div key={direction}>
            <h2 className="text-lg font-medium">{direction}</h2>
            <ul className="mt-2 flex flex-col gap-1" aria-label={`${direction} clues`}>
              {puzzle.clues[direction].map((item) => {
                const word = list.find((candidate) => candidate.direction === direction && candidate.number === item.number)!;
                return <li key={item.number}><button type="button" className={`${button} w-full text-left ${active.direction === direction && active.number === item.number ? 'font-medium underline decoration-2 underline-offset-4' : ''}`} disabled={solved} onClick={() => update(selectCell(state, word.cells[0]!, direction))}>{item.number}. {item.text}</button></li>;
              })}
            </ul>
          </div>
        ))}
      </div>

      {solved && (
        <div ref={result} tabIndex={-1} className="mt-6 rounded-md border border-control p-4" data-testid="cueword-result">
          <p className="text-lg font-medium">solved.</p>
          <p className="mt-2">{shared}</p>
          <button type="button" className={`${button} mt-3`} onClick={share}>copy my result</button>
          {copied && <p className="mt-2 text-sm text-ink-soft" aria-live="polite">{copied}</p>}
        </div>
      )}
      <p className="mt-3 text-sm text-ink-soft" aria-live="polite" aria-atomic="true" data-testid="cueword-live">{said}</p>
    </section>
  );
}

/** The page supplies reviewed puzzle data; this island contains no puzzle content or persistent storage. */
export default function CuewordGame({ puzzle, name }: Props) {
  try {
    const parsed = parsePuzzle(puzzle);
    return <Board key={JSON.stringify(parsed)} puzzle={parsed} name={name} />;
  } catch {
    return <p role="alert">this puzzle could not be loaded. please try again later.</p>;
  }
}
