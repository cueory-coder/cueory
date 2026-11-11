import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { dayLabel } from './daily';
import { localDay, reportRound } from './gameresults';
import ResultBrandMark from './ResultBrandMark';
import {
  currentWord,
  emptyState,
  erase,
  isSolved,
  move,
  nextWord,
  numbering,
  parsePuzzle,
  previousWord,
  selectCell,
  shareLine,
  toggleDirection,
  type,
  words,
  type CuewordPuzzle,
  type CuewordState,
} from './cueword';

export type CuewordLevelId = 'easy' | 'mid' | 'hard';

export interface CuewordLevel {
  id: CuewordLevelId;
  label: string;
  size: number;
  puzzle: CuewordPuzzle;
}

interface Props {
  puzzle: CuewordPuzzle;
  levels: CuewordLevel[];
  name: string;
  onLevelChange: (level: CuewordLevelId) => void;
}

const button =
  'min-h-11 min-w-11 rounded-md border border-control bg-page px-4 py-2 text-ink disabled:opacity-50';
const letterButton =
  'flex size-11 shrink-0 items-center justify-center rounded-md border border-control bg-page text-ink';

function elapsedText(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function Board({ puzzle, levels, name, onLevelChange }: Props) {
  const [state, setState] = useState(() => emptyState(puzzle));
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [today] = useState(() => new Date());

  const started = useRef(Date.now());
  const cells = useRef(new Map<number, HTMLButtonElement>());
  const focusGrid = useRef(false);
  const result = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const dialogId = useId();

  const list = useMemo(() => words(puzzle), [puzzle]);
  const numbers = useMemo(() => numbering(puzzle), [puzzle]);
  const width = puzzle.grid[0]!.length;
  const active = currentWord(state);
  const clue = puzzle.clues[active.direction].find((item) => item.number === active.number)!;
  const solved = isSolved(state);
  const shared = shareLine(
    { solved, seconds: elapsed, cues: state.cued.length },
    dayLabel(today),
    name,
  );
  const level = levels.find((item) => item.puzzle.id === puzzle.id)!;
  const cellClass =
    level.id === 'easy'
      ? 'size-11 sm:size-16'
      : level.id === 'mid'
        ? 'size-10 sm:size-12'
        : 'size-8 sm:size-9';

  useEffect(() => {
    if (solved) return;
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started.current) / 1000)),
      1000,
    );
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
    reportRound({
      game: 'cueword',
      day: localDay(today),
      solved: true,
      tries: state.cued.length,
    });
  }, [solved, state.cued.length, today]);

  const update = (next: CuewordState, focus = true) => {
    if (!solved && isSolved(next)) {
      setElapsed(Math.floor((Date.now() - started.current) / 1000));
    }
    focusGrid.current = focus;
    setState(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (solved || event.ctrlKey || event.metaKey) return;

    let next: CuewordState;
    if (event.altKey && event.key === 'ArrowLeft') next = previousWord(state);
    else if (event.altKey && event.key === 'ArrowRight') next = nextWord(state);
    else if (event.altKey) return;
    else if (/^[a-z]$/i.test(event.key)) next = type(state, event.key);
    else if (event.key === 'Backspace' || event.key === 'Delete') next = erase(state);
    else if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown'
    ) {
      next = move(state, event.key);
    } else if (event.key === ' ') next = toggleDirection(state);
    else return;

    event.preventDefault();
    update(next);
  };

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(shared);
      setCopied(`copied: ${shared}`);
    } catch {
      setCopied(shared);
    }
  };

  return (
    <section aria-label={`${name} puzzle`} data-testid="cueword" data-crossword-print-root>
      <div data-crossword-screen>
        {puzzle.sample && <p className="text-sm text-ink-soft">today's puzzle is a sample</p>}

      <div className="mt-3 flex flex-wrap justify-center gap-2" role="group" aria-label="crossword levels">
        {levels.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`${button} rounded-full ${
              item.id === level.id
                ? 'border-ink font-medium underline decoration-2 underline-offset-4'
                : ''
            }`}
            aria-pressed={item.id === level.id}
            title={`${item.label} ${item.size} by ${item.size}`}
            onClick={() => onLevelChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="mt-2 text-center text-sm text-ink-soft">
        easy 5×5 · mid 7×7 · hard 15×15
      </p>

      <p id={helpId} className="mt-2 text-center text-sm text-ink-soft">
        type letters. arrows move; space switches direction; alt+left or alt+right changes word; tab
        leaves the grid.
      </p>

      <div className="relative mt-3 flex justify-center gap-2">
        <button
          type="button"
          className={`${button} rounded-full p-2`}
          aria-label="print this puzzle"
          title="print"
          data-testid="crossword-print"
          onClick={() => window.print()}
        >
          ⎙
        </button>
        <button
          type="button"
          className={`${button} rounded-full p-2`}
          aria-expanded={helpOpen}
          aria-controls={dialogId}
          aria-label="how to play"
          onClick={() => setHelpOpen((open) => !open)}
        >
          ?
        </button>
        {helpOpen && (
          <div
            id={dialogId}
            role="dialog"
            aria-label="how to play"
            className="absolute z-10 max-w-xs rounded-md border border-control bg-page p-4 text-left text-sm shadow-lg"
          >
            <p className="font-medium">how to play</p>
            <p className="mt-2">
              tap a square, then type. tap again to switch direction. use arrows to move and
              alt+left or alt+right to change word.
            </p>
          </div>
        )}
      </div>

      <p className="mt-2 text-center text-sm text-ink-soft">
        <span className="tabular-nums">{elapsedText(elapsed)}</span> · sample puzzle
      </p>

      <div className="mt-3 max-w-full overflow-x-auto">
        <div
          role="grid"
          aria-label={`${name} grid`}
          aria-describedby={helpId}
          aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
          aria-rowcount={puzzle.grid.length}
          aria-colcount={width}
          className="mx-auto flex w-max flex-col gap-1 p-1"
          onKeyDown={handleKeyDown}
        >
          {puzzle.grid.map((row, rowIndex) => (
            <div role="row" aria-rowindex={rowIndex + 1} key={rowIndex} className="flex gap-1">
              {[...row].map((answer, columnIndex) => {
                const cell = rowIndex * width + columnIndex;
                if (answer === '.') {
                  return (
                    <div
                      role="gridcell"
                      aria-colindex={columnIndex + 1}
                      aria-label="gap"
                      key={cell}
                      className={cellClass}
                    />
                  );
                }

                const word =
                  list.find((item) => item.direction === state.direction && item.cells.includes(cell)) ??
                  list.find((item) => item.cells.includes(cell))!;
                const selected = active.cells.includes(cell);
                const focused = cell === state.cell;
                const number = numbers[rowIndex]![columnIndex];

                return (
                  <div
                    role="gridcell"
                    aria-colindex={columnIndex + 1}
                    aria-selected={selected}
                    key={cell}
                  >
                    <button
                      ref={(element) => {
                        if (element) cells.current.set(cell, element);
                        else cells.current.delete(cell);
                      }}
                      type="button"
                      className={`relative flex ${cellClass} items-center justify-center rounded-sm border text-sm text-ink ${
                        selected
                          ? 'border-b-4 border-ink bg-surface underline decoration-2 underline-offset-4'
                          : 'border-control bg-page'
                      } ${focused ? 'outline outline-2 outline-ink' : ''}`}
                      tabIndex={focused ? 0 : -1}
                      disabled={solved}
                      aria-label={`row ${rowIndex + 1}, column ${columnIndex + 1}, ${word.number} ${word.direction}, ${
                        state.entries[cell] ? `letter ${state.entries[cell]}` : 'empty'
                      }`}
                      aria-pressed={focused}
                      onClick={() =>
                        update(
                          selectCell(
                            state,
                            cell,
                            cell === state.cell
                              ? state.direction === 'across'
                                ? 'down'
                                : 'across'
                              : state.direction,
                          ),
                        )
                      }
                    >
                      {number !== null && (
                        <span className="absolute left-0 top-0 px-1 text-[10px]" aria-hidden="true">
                          {number}
                        </span>
                      )}
                      <span aria-hidden="true">{state.entries[cell] || '\u00a0'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div
        className="mt-3 rounded-md border border-control bg-surface px-3 py-2 text-center font-medium"
        aria-live="polite"
        data-testid="cueword-clue"
      >
        {active.number} {active.direction}: {clue.text}
      </div>

      {!solved && (
        <div className="mx-auto mt-4 flex max-w-sm flex-wrap justify-center gap-1" role="group" aria-label="letters">
          {[...'abcdefghijklmnopqrstuvwxyz'].map((letter) => (
            <button
              type="button"
              key={letter}
              className={letterButton}
              onClick={() => update(type(state, letter))}
            >
              {letter}
            </button>
          ))}
          <button type="button" className={button} onClick={() => update(erase(state))}>
            erase
          </button>
        </div>
      )}

      </div>

      <div data-print-only data-crossword-print-only className="mt-6">
        <p>cueory.app</p>
        <div className={"crossword-print-grid crossword-print-grid-" + width} aria-label="blank numbered crossword grid">
          {puzzle.grid.map((row, rowIndex) => [...row].map((answer, columnIndex) => {
            const cell = rowIndex * width + columnIndex;
            const number = numbers[rowIndex]![columnIndex];
            return <div key={cell} className={answer === "." ? "crossword-print-cell crossword-print-block" : "crossword-print-cell"}>{number !== null && <span>{number}</span>}</div>;
          }))}
        </div>
        <h2>across</h2>
        <ol>{puzzle.clues.across.map((item) => <li key={item.number}>{item.number}. {item.text}</li>)}</ol>
        <h2>down</h2>
        <ol>{puzzle.clues.down.map((item) => <li key={item.number}>{item.number}. {item.text}</li>)}</ol>
      </div>

      {solved && (
        <div
          ref={result}
          tabIndex={-1}
          className="mt-6 rounded-md border border-control p-4"
          data-testid="cueword-result"
        >
          <p className="text-lg font-medium">solved.</p>
          <p className="mt-2">{shared}</p>
          <button type="button" className={`${button} mt-3`} onClick={copyResult}>
            copy my result
          </button>
          {copied && (
            <p className="mt-2 text-sm text-ink-soft" aria-live="polite">
              {copied}
            </p>
          )}
          <ResultBrandMark path="/play" />
        </div>
      )}
    </section>
  );
}

export default function CuewordGame(props: Props) {
  try {
    const parsed = parsePuzzle(props.puzzle);
    return <Board key={parsed.id} {...props} puzzle={parsed} />;
  } catch {
    return <p role="alert">this puzzle could not be loaded. please try again later.</p>;
  }
}
