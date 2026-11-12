import { useEffect, useMemo, useRef, useState } from 'react';
import { browserStorage } from '../scripts/storage';
import { printGame } from './gameprint';
import { localDay, showResultCard, sudokuResultCard } from './gameresults';
import { LEVEL_RULES, candidates, conflictIndices, dailySudokuSeed, generateSudoku, getResult, type SudokuLevel } from './sudoku';

interface Settings {
  checkGuesses: boolean;
  autoCandidates: boolean;
  showErrors: boolean;
  showTimer: boolean;
  highlightConflicts: boolean;
  highlightRowColumn: boolean;
  highlightBox: boolean;
  highlightIdentical: boolean;
  playSound: boolean;
}
const SETTINGS_KEY = 'cueory-sudoku-settings';
const DEFAULTS: Settings = {
  checkGuesses: true, autoCandidates: false, showErrors: true, showTimer: true, highlightConflicts: true,
  highlightRowColumn: true, highlightBox: true, highlightIdentical: true, playSound: true,
};
const LEVELS: SudokuLevel[] = ['easy', 'medium', 'hard'];
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function loadSettings(): Settings {
  try {
    const saved = browserStorage()?.getItem(SETTINGS_KEY);
    if (!saved) return DEFAULTS;
    const parsed = JSON.parse(saved) as Partial<Settings>;
    return Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) => [
      key, typeof parsed[key as keyof Settings] === 'boolean' ? parsed[key as keyof Settings] : fallback,
    ])) as unknown as Settings;
  } catch { return DEFAULTS; }
}
function saveSettings(settings: Settings): void {
  try { browserStorage()?.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* The game still works. */ }
}
function firstOpen(puzzle: readonly number[]): number {
  const index = puzzle.findIndex((value) => value === 0);
  return index < 0 ? 0 : index;
}
function playSolvedTone(): void {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain); gain.connect(context.destination); oscillator.frequency.value = 523;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
    oscillator.start(); oscillator.stop(context.currentTime + 0.35);
    oscillator.addEventListener('ended', () => void context.close(), { once: true });
  } catch { /* Sound is optional. */ }
}

export default function SudokuGame() {
  const today = useMemo(() => new Date(), []);
  const day = useMemo(() => localDay(today), [today]);
  const [level, setLevel] = useState<SudokuLevel>('easy');
  const puzzle = useMemo(() => generateSudoku(dailySudokuSeed(day, level), level), [day, level]);
  const [entries, setEntries] = useState<number[]>(() => [...puzzle.puzzle]);
  const [marks, setMarks] = useState<Set<number>>(() => new Set());
  const [selected, setSelected] = useState(() => firstOpen(puzzle.puzzle));
  const [seconds, setSeconds] = useState(0);
  const [errors, setErrors] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hints, setHints] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [said, setSaid] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const solvedResult = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<number, HTMLButtonElement>());
  const solved = entries.every((value, index) => value === puzzle.solution[index]);
  const conflicts = useMemo(() => new Set(conflictIndices(entries)), [entries]);
  const reported = useRef(false);

  useEffect(() => {
    setEntries([...puzzle.puzzle]); setMarks(new Set()); setSelected(firstOpen(puzzle.puzzle));
    setSeconds(0); setErrors(0); setPaused(false); setHints(settings.autoCandidates);
    setSaid(`${level} puzzle ready. ${LEVEL_RULES[level].givens} given numbers.`); reported.current = false;
  }, [puzzle]);

  useEffect(() => {
    if (paused || solved) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [paused, solved]);

  useEffect(() => {
    if (!solved || reported.current) return;
    reported.current = true;
    solvedResult.current?.focus();
    if (settings.playSound) playSolvedTone();
    const result = getResult({ day, level, seconds, errors, solved: true });
    // Queue the display result even if the separate host island has not hydrated yet.
    showResultCard(sudokuResultCard(result));
    // Keep the existing public completion event for other observers. The host no longer consumes it.
    window.dispatchEvent(new CustomEvent('cueory:sudoku-solved', { detail: result }));
    setSaid(`solved in ${result.time} with ${errors} ${errors === 1 ? 'error' : 'errors'}.`);
  }, [solved, day, level, seconds, errors, settings.playSound]);

  useEffect(() => { saveSettings(settings); }, [settings]);

  useEffect(() => {
    if (!settingsOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') ?? [])];
    controls()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setSettingsOpen(false); return; }
      if (event.key !== 'Tab') return;
      const list = controls(); if (!list.length) return;
      const first = list[0]!; const last = list[list.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); (previous ?? settingsButton.current)?.focus(); };
  }, [settingsOpen]);

  const enter = (value: number) => {
    if (paused || solved || puzzle.puzzle[selected]) {
      if (puzzle.puzzle[selected]) setSaid('given numbers cannot be changed.');
      return;
    }
    const next = [...entries]; next[selected] = value; setEntries(next);
    setMarks((current) => { const copy = new Set(current); copy.delete(selected); return copy; });
    const wrong = value !== puzzle.solution[selected];
    if (wrong && settings.checkGuesses) setErrors((count) => count + 1);
    setSaid(wrong && settings.checkGuesses
      ? `${value} is not right for row ${Math.floor(selected / 9) + 1}, column ${selected % 9 + 1}. error added.`
      : `${value} entered.`);
  };
  const mark = () => {
    if (paused || solved || puzzle.puzzle[selected]) return;
    const removing = marks.has(selected);
    const next = [...entries]; next[selected] = 0; setEntries(next);
    setMarks((current) => { const copy = new Set(current); removing ? copy.delete(selected) : copy.add(selected); return copy; });
    setSaid(removing ? 'mark removed.' : 'x mark added.');
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (settingsOpen || howOpen || paused || solved || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!(event.target as HTMLElement | null)?.closest('.sudoku-board')) return;
      const row = Math.floor(selected / 9); const column = selected % 9; let next = selected;
      if (event.key === 'ArrowUp') next = row ? selected - 9 : selected;
      else if (event.key === 'ArrowDown') next = row < 8 ? selected + 9 : selected;
      else if (event.key === 'ArrowLeft') next = column ? selected - 1 : selected;
      else if (event.key === 'ArrowRight') next = column < 8 ? selected + 1 : selected;
      else if (/^[1-9]$/.test(event.key)) { event.preventDefault(); enter(Number(event.key)); return; }
      else if (event.key.toLowerCase() === 'x' || event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); mark(); return; }
      else return;
      event.preventDefault();
      setSelected(next);
      cells.current.get(next)?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const updateSetting = (key: keyof Settings) => setSettings((current) => {
    const next = { ...current, [key]: !current[key] };
    if (key === 'autoCandidates') setHints(next.autoCandidates);
    return next;
  });
  // The shared print helper (Task 641): marks the page for sudoku's print rules and clears the mark after printing.
  const printPuzzle = () => printGame('sudoku');
  const elapsed = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const selectedRow = Math.floor(selected / 9); const selectedColumn = selected % 9; const selectedValue = entries[selected];

  return <section className="sudoku-game" data-testid="sudoku">
    <div className="sudoku-title-row">
      <div className="sudoku-corner-actions">
        <button type="button" className="sudoku-icon-button print-control" aria-label="print this puzzle" onClick={printPuzzle}><svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" focusable="false"><path d="M7 9V4h10v5M7 17H5.5A2.5 2.5 0 0 1 3 14.5v-3A2.5 2.5 0 0 1 5.5 9h13a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1-2.5 2.5H17M7 14h10v6H7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        <button type="button" className="sudoku-icon-button" aria-label="how to play" aria-expanded={howOpen} onClick={() => setHowOpen((open) => !open)}>?</button>
      </div>
      {howOpen && <div className="sudoku-how" role="region" aria-label="how to play sudoku">
        <p className="font-medium">how to play</p>
        <ol><li>fill each row, column and 3 by 3 box with 1 to 9, with no repeats.</li><li>pick a square, then type or tap a number. arrow keys move between squares.</li><li>use x for your own mark and hints to show possible numbers.</li><li>pause hides the puzzle until you resume.</li></ol>
      </div>}
    </div>
    <div className="sudoku-panel">
      <div className="sudoku-toolbar">
        <div className="sudoku-time">{settings.showTimer && <span>time: <strong>{elapsed}</strong></span>}{settings.showTimer && ' '}<button type="button" className="sudoku-small-button" aria-label={paused ? 'resume puzzle' : 'pause puzzle'} onClick={() => setPaused((value) => !value)}><span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span></button></div>
        <div className="segmented" aria-label="difficulty">{LEVELS.map((choice) => <button key={choice} type="button" className="segmented-option" aria-pressed={level === choice} onClick={() => setLevel(choice)}>{choice}</button>)}</div>
        <span className="sudoku-errors">{settings.showErrors ? <>error: <strong>{errors}</strong></> : null}</span>
      </div>
      <div className="sudoku-board-scroll">
        <div className={`sudoku-board${paused ? ' is-paused' : ''}`} role="grid" aria-label="sudoku grid" aria-rowcount={9} aria-colcount={9}>
        {Array.from({ length: 9 }, (_, row) => <div key={row} className="sudoku-row" role="row">
          {entries.slice(row * 9, row * 9 + 9).map((value, column) => {
          const index = row * 9 + column; const given = puzzle.puzzle[index] !== 0;
          const related = settings.highlightRowColumn && (row === selectedRow || column === selectedColumn);
          const box = settings.highlightBox && Math.floor(row / 3) === Math.floor(selectedRow / 3) && Math.floor(column / 3) === Math.floor(selectedColumn / 3);
          const identical = settings.highlightIdentical && Boolean(selectedValue) && value === selectedValue;
          const options = !value && !marks.has(index) && hints ? candidates(entries, index) : [];
          const classes = ['sudoku-cell', given && 'is-given', !given && value && 'is-entered', selected === index && 'is-selected', selected !== index && related && 'is-related', selected !== index && box && 'is-box-related', identical && 'is-identical', settings.highlightConflicts && conflicts.has(index) && 'is-conflict', (column === 2 || column === 5) && 'sudoku-box-right', (row === 2 || row === 5) && 'sudoku-box-bottom'].filter(Boolean).join(' ');
          const spoken = paused ? 'hidden while paused' : marks.has(index) ? 'x mark' : value ? String(value) : options.length ? `empty, candidates ${options.join(', ')}` : 'empty';
          return <button ref={(element) => { if (element) cells.current.set(index, element); else cells.current.delete(index); }} key={index} type="button" role="gridcell" tabIndex={selected === index ? 0 : -1} className={classes} aria-rowindex={row + 1} aria-colindex={column + 1} aria-selected={selected === index} aria-label={`row ${row + 1}, column ${column + 1}, ${spoken}${given ? ', given' : ''}`} data-given={given ? 'true' : 'false'} onClick={() => setSelected(index)}>
            {paused ? <span aria-hidden="true">x</span> : marks.has(index) ? <span className="sudoku-mark" aria-hidden="true">x</span> : value ? <span>{value}</span> : options.length ? <span className="sudoku-candidates" aria-hidden="true">{NUMBERS.map((number) => <i key={number}>{options.includes(number) ? number : ''}</i>)}</span> : null}
          </button>;
          })}
        </div>)}
        </div>
      </div>
      <div className="sudoku-pad-wrap">
        <button type="button" className="sudoku-setting-button sudoku-hints" role="checkbox" aria-checked={hints} onClick={() => setHints((value) => !value)}><span aria-hidden="true">{hints ? '☑' : '☐'}</span> hints</button>
        <div className="sudoku-number-row" aria-label="numbers">{NUMBERS.map((number) => <button key={number} type="button" onClick={() => enter(number)} disabled={paused || solved}>{number}</button>)}<button type="button" onClick={mark} aria-label="add or remove x mark" disabled={paused || solved}>x</button></div>
        <button ref={settingsButton} type="button" className="sudoku-setting-button sudoku-settings-trigger" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}><span aria-hidden="true">⚙</span> settings</button>
      </div>
    </div>
    {solved && <div ref={solvedResult} className="sudoku-solved" tabIndex={-1} role="status" data-testid="sudoku-result"><p className="text-lg font-medium">solved.</p><p>{elapsed} · {errors} {errors === 1 ? 'error' : 'errors'}</p><p className="text-sm text-ink-soft">a new sudoku comes out tomorrow.</p></div>}
    {settingsOpen && <div className="sudoku-overlay" onPointerDown={(event) => event.target === event.currentTarget && setSettingsOpen(false)}>
      <div ref={dialog} className="sudoku-settings" role="dialog" aria-modal="true" aria-labelledby="sudoku-settings-title">
        <div className="sudoku-settings-heading"><h3 id="sudoku-settings-title">settings</h3><button type="button" className="sudoku-icon-button" aria-label="close settings" onClick={() => setSettingsOpen(false)}>×</button></div>
        <fieldset><legend>gameboard settings</legend>{(Object.keys(DEFAULTS) as Array<keyof Settings>).map((key) => {
          const labels: Record<keyof Settings, string> = { checkGuesses: 'check guesses when entered', autoCandidates: 'start in auto candidate mode', showErrors: 'show error counter', showTimer: 'show timer', highlightConflicts: 'highlight conflicts', highlightRowColumn: 'highlight row and column', highlightBox: 'highlight box', highlightIdentical: 'highlight identical numbers', playSound: 'play sound on solve' };
          return <label key={key} className="sudoku-option"><span>{labels[key]}</span><input type="checkbox" checked={settings[key]} onChange={() => updateSetting(key)} /></label>;
        })}</fieldset>
      </div>
    </div>}
    <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="sudoku-live">{said}</p>
    <p className="sudoku-print-footer">cueory.app</p>
  </section>;
}
