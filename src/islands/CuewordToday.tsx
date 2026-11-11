import { useMemo, useState } from 'react';
import CuewordGame from './CuewordGame';
import { crosswordLevels, type CrosswordLevel, type CuewordPuzzle } from './cueword';
import { dayNumber, puzzleForDay } from './pulse';

interface Props { puzzles: CuewordPuzzle[]; name: string; }
const labels: Record<CrosswordLevel, string> = { easy: 'easy', mid: 'mid', hard: 'hard' };

export default function CuewordToday({ puzzles, name }: Props) {
  const [level, setLevel] = useState<CrosswordLevel>('easy');
  const choices = useMemo(
    () => Object.fromEntries(crosswordLevels.map(({ level: option }) => [
      option,
      puzzleForDay(puzzles.filter((puzzle) => puzzle.level === option), dayNumber(new Date())),
    ])) as Record<CrosswordLevel, CuewordPuzzle | undefined>,
    [puzzles],
  );
  const puzzle = choices[level];

  return (
    <section aria-label={name + ' level'}>
      <fieldset className="mb-4 flex justify-center">
        <legend className="sr-only">crossword level</legend>
        <div className="segmented" data-testid="crossword-levels">
          {crosswordLevels.map(({ level: option, size }) => (
            <label className="segmented-option" key={option} title={size + ' by ' + size}>
              <input className="sr-only" type="radio" name="crossword-level" value={option} checked={level === option} onChange={() => setLevel(option)} />
              {labels[option]}<span className="sr-only">, {size} by {size}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {puzzle ? <CuewordGame key={level + '-' + puzzle.id} puzzle={puzzle} name={name} /> : <p role="alert">no {level} sample puzzle today.</p>}
    </section>
  );
}
