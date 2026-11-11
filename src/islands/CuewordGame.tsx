import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { localDay, reportRound } from './gameresults';
import ResultBrandMark from './ResultBrandMark';
import {
  currentWord, emptyState, erase, getResult, isSolved, move, nextWord, numbering, parsePuzzle,
  previousWord, selectOrToggleCell, type, words, type CuewordPuzzle, type CuewordState, type Direction,
} from './cueword';

interface Props { puzzle: CuewordPuzzle; name: string }
const letterButton = 'flex min-h-11 min-w-11 items-center justify-center rounded-md border border-control bg-page px-3 text-ink';
const quietButton = 'min-h-11 min-w-11 rounded-md border border-control bg-page px-4 py-2 text-ink';

function elapsedText(seconds: number): string {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

function Board({ puzzle, name }: Props) {
  const [state, setState] = useState(() => emptyState(puzzle));
  const [elapsed, setElapsed] = useState(0);
  const [today] = useState(() => new Date());
  const started = useRef(Date.now());
  const cells = useRef(new Map<number, HTMLButtonElement>());
  const focusGrid = useRef(false);
  const result = useRef<HTMLDivElement>(null);
  const eraseButton = useRef<HTMLButtonElement>(null);
  const help = useId();
  const list = useMemo(() => words(puzzle), [puzzle]);
  const numbers = useMemo(() => numbering(puzzle), [puzzle]);
  const width = puzzle.grid[0]!.length;
  const level = puzzle.level ?? 'easy';
  const active = currentWord(state);
  const clue = puzzle.clues[active.direction].find((item) => item.number === active.number)!;
  const solved = isSolved(state);
  const gameResult = getResult(state, elapsed);

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

  const reported = useRef(false);
  useEffect(() => {
    if (!solved || reported.current) return;
    reported.current = true;
    reportRound({ game: 'cueword', day: localDay(today), solved: true, tries: 0 });
  }, [solved, today]);

  const update = (next: CuewordState, focus = true) => {
    if (!solved && isSolved(next)) setElapsed(Math.floor((Date.now() - started.current) / 1000));
    focusGrid.current = focus;
    setState(next);
  };

  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (solved || event.ctrlKey || event.metaKey) return;
    let next: CuewordState;
    if (event.altKey && event.key === 'ArrowLeft') next = previousWord(state);
    else if (event.altKey && event.key === 'ArrowRight') next = nextWord(state);
    else if (event.altKey) return;
    else if (/^[a-z]$/i.test(event.key)) next = type(state, event.key);
    else if (event.key === 'Backspace' || event.key === 'Delete') next = erase(state);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') next = move(state, event.key);
    else if (event.key === 'Escape') {
      event.preventDefault();
      eraseButton.current?.focus();
      return;
    } else return;
    event.preventDefault();
    update(next);
  };

  return (
    <section className="crossword-panel" aria-label={name + ' puzzle'} data-testid="cueword">
      <div className="crossword-toolbar crossword-no-print">
        <button type="button" className="corner-button corner-button-quiet" aria-label="print this puzzle" onClick={() => window.print()}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/></svg>
        </button>
        <details className="crossword-help">
          <summary className="corner-button corner-button-quiet" aria-label="how to play">?</summary>
          <div className="crossword-help-panel">
            <h3 className="font-medium">how to play</h3>
            <p className="mt-2 text-sm text-ink-soft">{level} is {width} by {width}. tap a square and type, or use the letter buttons.</p>
            <p className="mt-2 text-sm text-ink-soft">tap the selected square again to switch across and down. arrows move one square. alt plus left or right moves between words.</p>
            <p className="mt-2 text-sm text-ink-soft">the printer button makes a blank grid with the complete clue list.</p>
          </div>
        </details>
      </div>

      {puzzle.sample && <p className="text-center text-sm text-ink-soft">today's puzzle is a sample</p>}
      <p className="mt-2 text-center text-sm text-ink-soft"><span className="tabular-nums">time: {elapsedText(elapsed)}</span></p>
      <p id={help} className="crossword-no-print mt-2 text-center text-sm text-ink-soft">
        type letters. arrows move. tap the selected square to switch direction. alt+left or alt+right changes word. tab leaves the grid.
      </p>

      <div className="crossword-board-wrap mt-4">
        <div
          role="grid"
          aria-label={name + ' grid'}
          aria-describedby={help}
          aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
          aria-rowcount={puzzle.grid.length}
          aria-colcount={width}
          className="crossword-board"
          data-level={level}
          onKeyDown={key}
        >
          {puzzle.grid.map((row, r) => (
            <div role="row" aria-rowindex={r + 1} key={r} className="crossword-row">
              {[...row].map((answer, c) => {
                const cell = r * width + c;
                if (answer === '.') return <div role="gridcell" aria-colindex={c + 1} aria-label="black square" key={cell} className="crossword-gap" />;
                const word = list.find((item) => item.direction === state.direction && item.cells.includes(cell)) ?? list.find((item) => item.cells.includes(cell))!;
                const selected = active.cells.includes(cell);
                const current = cell === state.cell;
                const number = numbers[r]![c];
                const label = 'row ' + (r + 1) + ', column ' + (c + 1) + ', ' + word.number + ' ' + word.direction + ', ' + (state.entries[cell] ? 'letter ' + state.entries[cell] : 'empty');
                return (
                  <div role="gridcell" aria-colindex={c + 1} aria-selected={selected} key={cell}>
                    <button
                      ref={(element) => { if (element) cells.current.set(cell, element); else cells.current.delete(cell); }}
                      type="button"
                      tabIndex={current ? 0 : -1}
                      disabled={solved}
                      aria-label={label}
                      aria-pressed={current}
                      data-cell={cell}
                      className={'crossword-cell' + (selected ? ' crossword-cell-word' : '') + (current ? ' crossword-cell-current' : '')}
                      onClick={() => update(selectOrToggleCell(state, cell))}
                    >
                      {number !== null && <span className="crossword-number" aria-hidden="true">{number}</span>}
                      <span className="crossword-entry" aria-hidden="true">{state.entries[cell] || '\u00a0'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="crossword-clue-bar" aria-live="polite" aria-atomic="true" data-testid="cueword-clue">
        <strong>{active.number} {active.direction}</strong><span>{clue.text}</span>
      </p>

      {!solved && (
        <div className="crossword-no-print">
          <div className="mx-auto mt-6 flex max-w-sm flex-wrap justify-center gap-1" role="group" aria-label="letters">
            {[...'abcdefghijklmnopqrstuvwxyz'].map((letter) => <button type="button" key={letter} className={letterButton} onClick={() => update(type(state, letter))}>{letter}</button>)}
          </div>
          <div className="mt-3 flex justify-center">
            <button ref={eraseButton} type="button" className={quietButton} onClick={() => update(erase(state))}>erase</button>
          </div>
        </div>
      )}

      <div className="crossword-print-clues">
        {(['across', 'down'] as const).map((direction: Direction) => (
          <section key={direction}>
            <h2>{direction}</h2>
            <ol>
              {puzzle.clues[direction].map((item) => <li key={item.number}><strong>{item.number}.</strong> {item.text}</li>)}
            </ol>
          </section>
        ))}
      </div>

      <footer className="crossword-print-footer">cueory.app</footer>

      {solved && (
        <div ref={result} tabIndex={-1} className="crossword-result mt-6 rounded-md border border-control p-4" data-testid="cueword-result" role="status">
          <p className="text-lg font-medium">solved.</p>
          <p className="mt-2">{gameResult.level} · {elapsedText(gameResult.seconds)}</p>
          <ResultBrandMark path="/play" />
        </div>
      )}
    </section>
  );
}

export default function CuewordGame({ puzzle, name }: Props) {
  try {
    const parsed = parsePuzzle(puzzle);
    return <Board key={JSON.stringify(parsed)} puzzle={parsed} name={name} />;
  } catch {
    return <p role="alert">this puzzle could not be loaded. please try again later.</p>;
  }
}
