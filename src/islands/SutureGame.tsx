import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { dayLabel } from './daily';
import { localDay, reportRound } from './gameresults';
import { cellLabel, clearPick, foundWord, isDone, moveCursor, outcomeInWords, parsePuzzle, pick, selection, shareLine, startSuture, type Cell, type SuturePuzzle } from './suture';

interface Props { puzzle: SuturePuzzle; name: string }
const button = 'min-h-11 min-w-11 rounded-md border border-control bg-page px-4 py-2 text-ink disabled:opacity-50';
// Whole class names, so Tailwind sees each one (grids are 3 to 11 letters wide).
const columns: Record<number, string> = {
  3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6', 7: 'grid-cols-7', 8: 'grid-cols-8',
  9: 'grid-cols-9', 10: 'grid-cols-10', 11: 'grid-cols-11',
};

/**
 * A gentle sideways shake for a wrong pick, through the Web Animations API, so no stylesheet is injected (the CSP allows
 * none) and the distance and timing come from the design tokens. Nothing moves when the device asks for reduced motion.
 */
function shake(element: HTMLElement | null) {
  if (!element || typeof element.animate !== 'function') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const tokens = getComputedStyle(element);
  const step = tokens.getPropertyValue('--spacing').trim();
  const duration = Number.parseFloat(tokens.getPropertyValue('--duration-base'));
  if (!step || !Number.isFinite(duration)) return;
  const away = (sign: number) => ({ translate: `calc(${step} * ${sign}) 0` });
  element.animate([{ translate: '0 0' }, away(-1), away(1), away(-1), { translate: '0 0' }], { duration, easing: 'ease-in-out' });
}

function Board({ puzzle, name }: Props) {
  const [state, setState] = useState(() => startSuture(puzzle));
  const [focused, setFocused] = useState(0);
  const [said, setSaid] = useState('');
  const [copied, setCopied] = useState('');
  const [today] = useState(() => new Date());
  const result = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const help = useId();
  const title = useId();
  const done = isDone(state);
  const width = puzzle.grid[0]!.length;
  const shared = shareLine(state, dayLabel(today), name);
  const picked = selection(state);

  useEffect(() => { if (done) result.current?.focus(); }, [done]);

  // A finished grid is reported once, for the stats panel, which keeps it only if the student turned stats on (D-76).
  const reported = useRef(false);
  useEffect(() => {
    if (!done || reported.current) return;
    reported.current = true;
    reportRound({
      game: 'suture',
      day: localDay(today),
      solved: true,
      tries: state.misses,
      card: {
        game: 'suture',
        name,
        date: dayLabel(today),
        result: `${state.found.length} / ${state.totalWords}`,
        summary: 'you found every word in today\'s path.',
        stats: [
          { label: 'words found', value: `${state.found.length}` },
          { label: 'wrong picks', value: `${state.misses}` },
        ],
        path: '/play/word-path',
      },
    });
  }, [done]);

  const choose = (cell: Cell) => {
    const next = pick(state, puzzle, cell);
    if (next.outcome.kind === 'ignored') {
      if (!done) setSaid('that letter is in a word you found. pick another letter.');
      return;
    }
    setState(next.state);
    setSaid(outcomeInWords(next.state, puzzle, next.outcome));
    if (next.outcome.kind === 'miss') shake(board.current);
  };

  const hover = (event: PointerEvent<HTMLButtonElement>, cell: Cell) => {
    if (event.pointerType === 'mouse') setState((current) => moveCursor(current, puzzle, cell));
  };

  const clear = () => {
    if (!state.anchor) return;
    setState(clearPick(state));
    setSaid('pick cleared.');
  };

  const key = (event: KeyboardEvent<HTMLButtonElement>, cell: Cell) => {
    if (done || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape' || event.key === 'Backspace') {
      if (state.anchor) event.preventDefault();
      clear();
      return;
    }
    let [row, col] = cell;
    if (event.key === 'ArrowLeft') col--;
    else if (event.key === 'ArrowRight') col++;
    else if (event.key === 'ArrowUp') row--;
    else if (event.key === 'ArrowDown') row++;
    else return; // Enter and Space reach the letter's button as a click.
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
    <section aria-labelledby={puzzle.theme ? title : undefined} aria-label={puzzle.theme ? undefined : `${name} puzzle`} data-testid="suture">
      {puzzle.theme && <h3 id={title} className="display text-center text-2xl text-ink sm:text-3xl" data-testid="suture-theme">{puzzle.theme}</h3>}
      <p className="mt-2 text-center text-ink-soft">find all {state.totalWords} words. they run up, down, left or right.</p>
      <p id={help} className="mt-2 text-center text-sm text-ink-soft">
        tap a word's first letter, then its last letter. tap the first letter again to start over. on a keyboard, arrows
        move, enter or space picks, and escape clears.
      </p>
      {/*
        On phones the board spans the panel's padding (p-6 on /play), so 11 letters stay at least 24 px wide at 320 px.
        The frame is --border-board (2.5 px, Christian's design) in the ink color.
      */}
      <div
        ref={board}
        role="grid"
        aria-label={`${name} letters`}
        aria-describedby={help}
        aria-rowcount={puzzle.grid.length}
        aria-colcount={width}
        className="-mx-6 mt-6 flex flex-col border-(length:--border-board) border-ink bg-page text-ink sm:mx-0 sm:p-3"
      >
        {puzzle.grid.map((row, r) => (
          <div key={r} role="row" aria-rowindex={r + 1} className={`grid ${columns[width]}`}>
            {[...row].map((letter, c) => {
              const cell: Cell = [r, c];
              const index = r * width + c;
              const word = foundWord(state, puzzle, cell);
              const isFirst = state.anchor?.[0] === r && state.anchor?.[1] === c;
              const inPick = picked.some(([pr, pc]) => pr === r && pc === c);
              const look = word !== undefined
                ? 'bg-soft'
                : isFirst
                  ? 'bg-button text-on-button'
                  : inPick
                    ? 'bg-surface ring-2 ring-inset ring-ink-soft'
                    : 'bg-transparent';
              return (
                <div key={c} role="gridcell" aria-colindex={c + 1} aria-selected={inPick} className="sm:p-0.5">
                  <button
                    ref={(element) => { if (element) buttons.current.set(index, element); else buttons.current.delete(index); }}
                    type="button"
                    tabIndex={index === focused ? 0 : -1}
                    disabled={done}
                    aria-label={cellLabel(state, puzzle, cell)}
                    data-cell={`${r},${c}`}
                    className={`flex aspect-square w-full items-center justify-center overflow-hidden rounded-full text-base font-bold sm:text-xl ${look}`}
                    onFocus={() => { setFocused(index); setState((current) => moveCursor(current, puzzle, cell)); }}
                    onPointerEnter={(event) => hover(event, cell)}
                    onClick={() => choose(cell)}
                    onKeyDown={(event) => key(event, cell)}
                  >
                    <span aria-hidden="true">{letter}</span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <ul className="mt-6 columns-3 gap-x-4 text-sm font-bold sm:text-lg" aria-label="words to find" data-testid="suture-words">
        {puzzle.words.map((word, i) => {
          const isFound = state.found.includes(i);
          return (
            <li key={i} className="break-inside-avoid break-words">
              {isFound
                ? <><s className="text-ink-soft">{word.answer.toLowerCase()}</s><span className="sr-only"> (found)</span></>
                : <span className="text-ink">{word.answer.toLowerCase()}</span>}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm text-ink-soft">
        <p data-testid="suture-count">{state.found.length} of {state.totalWords} found</p>
        {puzzle.sample && <p>sample puzzle</p>}
      </div>
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
