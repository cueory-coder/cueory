import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { candidates, conflicts, dailySeed, getResult, generatePuzzle, type Level } from './sudoku';
import { localDay, reportRound } from './gameresults';

const levels: Level[] = ['easy', 'medium', 'hard'];
const button = 'min-h-11 rounded-pill border border-control px-4 py-2 text-sm text-ink hover:bg-surface';
const activeButton = 'bg-button text-on-button hover:bg-button-hover';

function focusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])')).filter((item) => !item.hasAttribute('disabled'));
}

export default function SudokuGame() {
  const [level, setLevel] = useState<Level>('easy');
  const [puzzle, setPuzzle] = useState(() => generatePuzzle('easy', dailySeed(new Date(), 'easy')));
  const [grid, setGrid] = useState(puzzle.givens);
  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hints, setHints] = useState(false);
  const [checkOnEntry, setCheckOnEntry] = useState(false);
  const [showErrors, setShowErrors] = useState(true);
  const [showTimer, setShowTimer] = useState(true);
  const [highlightConflicts, setHighlightConflicts] = useState(true);
  const [highlightUnits, setHighlightUnits] = useState(true);
  const [highlightBox, setHighlightBox] = useState(true);
  const [highlightSame, setHighlightSame] = useState(true);
  const [errors, setErrors] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const helpTrigger = useRef<HTMLButtonElement>(null);
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const started = useRef(Date.now());
  const pausedAt = useRef<number | null>(null);
  const reported = useRef(false);
  const givens = useMemo(() => new Set(puzzle.givens.map((value, index) => value ? index : -1).filter((index) => index >= 0)), [puzzle]);
  const solved = grid.every((value) => value > 0) && conflicts(grid).size === 0;

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!paused && !solved) setSeconds(Math.floor((Date.now() - started.current) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [paused, solved]);

  useEffect(() => { if (solved) resultRef.current?.focus(); }, [solved]);
  useEffect(() => { if (settingsOpen) settingsRef.current?.focus(); else settingsTrigger.current?.focus(); }, [settingsOpen]);
  useEffect(() => { if (helpOpen) helpRef.current?.focus(); else helpTrigger.current?.focus(); }, [helpOpen]);
  useEffect(() => {
    if (solved && !reported.current) {
      reported.current = true;
      reportRound({ game: 'sudoku', day: localDay(new Date()), solved: true, tries: seconds });
    }
  }, [solved, seconds]);

  const closeDialog = (kind: 'settings' | 'help') => { if (kind === 'settings') setSettingsOpen(false); else setHelpOpen(false); };
  const trap = (event: KeyboardEvent<HTMLDivElement>, kind: 'settings' | 'help') => {
    if (event.key === 'Escape') { event.preventDefault(); closeDialog(kind); return; }
    if (event.key !== 'Tab') return;
    const root = kind === 'settings' ? settingsRef.current : helpRef.current;
    const items = focusable(root);
    if (!items.length) return;
    const first = items[0]!, last = items[items.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const togglePause = () => {
    if (paused) {
      if (pausedAt.current !== null) started.current += Date.now() - pausedAt.current;
      pausedAt.current = null;
      setPaused(false);
    } else {
      setSeconds(Math.floor((Date.now() - started.current) / 1000));
      pausedAt.current = Date.now();
      setPaused(true);
    }
  };
  const newLevel = (next: Level) => {
    const nextPuzzle = generatePuzzle(next, dailySeed(new Date(), next));
    setLevel(next); setPuzzle(nextPuzzle); setGrid(nextPuzzle.givens); setSelected(0); setPaused(false); setErrors(0); setSeconds(0); setCopied(false); reported.current = false; started.current = Date.now(); pausedAt.current = null;
  };
  const enter = (value: number) => {
    if (paused || solved || givens.has(selected) || value < 1 || value > 9) return;
    const next = [...grid]; next[selected] = value;
    if (checkOnEntry && value !== puzzle.solution[selected]) setErrors((count) => count + 1);
    setGrid(next);
  };
  const erase = () => { if (!paused && !solved && !givens.has(selected)) { const next = [...grid]; next[selected] = 0; setGrid(next); } };
  const key = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (/^[1-9]$/.test(event.key)) { event.preventDefault(); setSelected(index); enter(Number(event.key)); return; }
    if (event.key === 'Backspace' || event.key === 'Delete' || event.key === '0') { event.preventDefault(); setSelected(index); erase(); return; }
    const row = Math.floor(index / 9), column = index % 9;
    let nextRow = row, nextColumn = column;
    if (event.key === 'ArrowUp') nextRow -= 1;
    else if (event.key === 'ArrowDown') nextRow += 1;
    else if (event.key === 'ArrowLeft') nextColumn -= 1;
    else if (event.key === 'ArrowRight') nextColumn += 1;
    else return;
    event.preventDefault();
    if (nextRow >= 0 && nextRow < 9 && nextColumn >= 0 && nextColumn < 9) setSelected(nextRow * 9 + nextColumn);
  };
  const share = async () => {
    const payload = getResult(level, seconds, errors, solved);
    const line = 'cueory sudoku, ' + payload.day + ': ' + (solved ? 'solved' : 'in progress') + ' in ' + seconds + 's';
    try { await navigator.clipboard.writeText(line); setCopied(true); } catch { setCopied(false); }
  };
  const conflictCells = highlightConflicts ? conflicts(grid) : new Set<number>();
  const selectedValue = grid[selected];
  const row = Math.floor(selected / 9), column = selected % 9, box = Math.floor(row / 3) * 3 + Math.floor(column / 3);
  const shownCandidates = hints && !givens.has(selected) ? candidates(grid, selected) : [];
  const label = (index: number) => 'row ' + (Math.floor(index / 9) + 1) + ', column ' + (index % 9 + 1) + (givens.has(index) ? ', given' : grid[index] ? ', ' + grid[index] : ', empty');
  const settings: Array<[string, string, boolean, (value: boolean) => void]> = [
    ['checkOnEntry', 'check guesses when entered', checkOnEntry, setCheckOnEntry],
    ['showErrors', 'show error counter', showErrors, setShowErrors],
    ['showTimer', 'show timer', showTimer, setShowTimer],
    ['highlightConflicts', 'highlight conflicts', highlightConflicts, setHighlightConflicts],
    ['highlightUnits', 'highlight row and column', highlightUnits, setHighlightUnits],
    ['highlightBox', 'highlight box', highlightBox, setHighlightBox],
    ['highlightSame', 'highlight identical numbers', highlightSame, setHighlightSame],
  ];

  return <section aria-label="sudoku puzzle" data-testid="sudoku">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-soft">{showTimer ? 'time: ' + String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0') : 'timer hidden'} <span aria-hidden="true">.</span> {showErrors ? 'errors: ' + errors : 'errors hidden'}</p>
      <div className="flex items-center gap-2"><button type="button" className={button} onClick={togglePause} aria-pressed={paused}>{paused ? 'play' : 'pause'}</button><button ref={helpTrigger} type="button" className={button} aria-label="how to play" aria-expanded={helpOpen} onClick={() => setHelpOpen(true)}>?</button><button type="button" className={button} onClick={() => window.print()} aria-label="print puzzle">print</button></div>
    </div>
    <div className="mt-4 flex justify-center gap-1" role="group" aria-label="difficulty">{levels.map((item) => <button type="button" key={item} className={button + ' ' + (item === level ? activeButton : '')} aria-pressed={item === level} onClick={() => newLevel(item)}>{item}</button>)}</div>
    <div className="mt-4 overflow-x-auto">
      <div role="grid" aria-label="sudoku board" aria-rowcount={9} aria-colcount={9} className="mx-auto grid aspect-square w-[min(84vw,32rem)] grid-cols-9 border-2 border-ink">
        {Array.from({ length: 9 }, (_, boardRow) => <div role="row" key={boardRow} className="contents">
          {Array.from({ length: 9 }, (_, boardColumn) => {
            const index = boardRow * 9 + boardColumn;
            const value = grid[index];
            const same = selectedValue > 0 && value === selectedValue;
            const selectedUnit = boardRow === row || boardColumn === column;
            const indexBox = Math.floor(boardRow / 3) * 3 + Math.floor(boardColumn / 3);
            const cellConflict = conflictCells.has(index);
            return <button type="button" role="gridcell" key={index} ref={(element) => { cellRefs.current[index] = element; }} tabIndex={selected === index ? 0 : -1} aria-label={label(index)} aria-selected={selected === index} onClick={() => { if (!paused) setSelected(index); }} onKeyDown={(event) => key(event, index)} disabled={paused} className={'relative flex min-h-11 items-center justify-center border border-control text-lg ' + (givens.has(index) ? 'font-bold' : 'underline underline-offset-4') + ' ' + (selected === index ? 'outline outline-2 outline-control outline-offset-[-3px]' : '') + ' ' + (highlightUnits && selectedUnit ? 'bg-soft' : '') + ' ' + (highlightBox && indexBox === box ? 'bg-surface' : '') + ' ' + (highlightSame && same ? 'bg-highlight' : '') + ' ' + (cellConflict ? 'border-2 border-control font-bold' : '')}>
              {paused ? 'hidden' : value || ''}<span className="sr-only">{cellConflict ? ', conflict' : ''}</span>
            </button>;
          })}
        </div>)}
      </div>
    </div>
    {paused && <p className="mt-3 text-center text-sm text-ink-soft" aria-live="polite">paused. the puzzle is hidden.</p>}
    {!paused && <><p className="mt-3 min-h-6 text-center text-sm text-ink-soft" aria-live="polite">{shownCandidates.length ? 'hints: ' + shownCandidates.join(', ') : 'select a square, then use the number keys or buttons.'}</p><div className="mt-3 flex flex-wrap justify-center gap-2" role="group" aria-label="numbers">{[1,2,3,4,5,6,7,8,9].map((n) => <button type="button" className={button} key={n} onClick={() => enter(n)}>{n}</button>)}<button type="button" className={button} onClick={erase} aria-label="erase square">erase</button></div></>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={hints} onChange={(event) => setHints(event.target.checked)} /> hints</label><button ref={settingsTrigger} type="button" className={button} onClick={() => setSettingsOpen(true)} aria-expanded={settingsOpen}>settings</button></div>
    {settingsOpen && <div ref={settingsRef} role="dialog" aria-modal="true" aria-label="settings" tabIndex={-1} onKeyDown={(event) => trap(event, 'settings')} className="mt-4 rounded-md border border-control bg-surface p-4"><div className="flex items-center justify-between"><h3 className="text-lg font-medium">settings</h3><button type="button" className={button} onClick={() => closeDialog('settings')} aria-label="close settings">close</button></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{settings.map(([keyName, text, checked, setChecked]) => <label key={keyName} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} /> {text}</label>)}</div></div>}
    {helpOpen && <div ref={helpRef} role="dialog" aria-modal="true" aria-label="how to play" tabIndex={-1} onKeyDown={(event) => trap(event, 'help')} className="mt-4 rounded-md border border-control bg-surface p-4"><div className="flex items-center justify-between"><h3 className="text-lg font-medium">how to play</h3><button type="button" className={button} onClick={() => closeDialog('help')}>close</button></div><p className="mt-3">Fill every row, column and 3 by 3 box with the numbers 1 through 9. Select a square, then use number buttons or the keyboard. Arrow keys move within the board. Given numbers cannot be changed.</p></div>}
    {solved && <div ref={resultRef} tabIndex={-1} className="mt-6 rounded-md border border-control bg-surface p-4" data-testid="sudoku-result"><p className="text-lg font-medium">solved.</p><p className="mt-1 text-ink-soft">time: {seconds}s. errors: {errors}</p><button type="button" className={button + ' mt-3'} onClick={share}>share result</button>{copied && <p className="mt-2 text-sm text-ink-soft" aria-live="polite">copied.</p>}</div>}
    <p className="mt-6 text-sm text-ink-soft">same numbers cannot repeat in a row, column or 3 by 3 box.</p>
  </section>;
}
