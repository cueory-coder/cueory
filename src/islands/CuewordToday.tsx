import { useEffect, useMemo, useState } from 'react';
import CuewordGame, { type CuewordLevel, type CuewordLevelId } from './CuewordGame';
import type { CuewordPuzzle } from './cueword';
import { dayNumber, puzzleForDay } from './pulse';

interface Props {
  puzzles: CuewordPuzzle[];
  name: string;
}

const specs = [
  { id: 'easy', label: 'easy', size: 5 },
  { id: 'mid', label: 'mid', size: 7 },
  { id: 'hard', label: 'hard', size: 15 },
] as const;

export function puzzleForLevel(puzzles: CuewordPuzzle[], size: number): CuewordPuzzle | undefined {
  return puzzles.find((puzzle) => puzzle.grid.length === size && puzzle.grid[0]?.length === size);
}

function initialLevel(): CuewordLevelId {
  if (typeof window === 'undefined') return 'easy';
  const match = window.location.hash.match(/^#crossword-(easy|mid|hard)$/);
  return (match?.[1] as CuewordLevelId | undefined) ?? 'easy';
}

export default function CuewordToday({ puzzles, name }: Props) {
  const levels = useMemo<CuewordLevel[]>(
    () =>
      specs
        .map((spec) => ({
          ...spec,
          puzzle: puzzleForLevel(puzzles, spec.size),
        }))
        .filter((level): level is CuewordLevel => Boolean(level.puzzle)),
    [puzzles],
  );
  const [selectedLevel, setSelectedLevel] = useState<CuewordLevelId>(initialLevel);

  useEffect(() => {
    const handleHashChange = () => setSelectedLevel(initialLevel());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const selected = levels.find((level) => level.id === selectedLevel) ?? levels[0];

  if (!selected || levels.length !== specs.length) {
    return <p role="alert">the crossword sample levels are not available.</p>;
  }

  const handleLevelChange = (level: CuewordLevelId) => {
    setSelectedLevel(level);
    window.history.replaceState(null, '', `#crossword-${level}`);
  };

  const todayPuzzle = puzzleForDay([selected.puzzle], dayNumber(new Date())) ?? selected.puzzle;

  return (
    <CuewordGame
      key={todayPuzzle.id}
      puzzle={todayPuzzle}
      levels={levels}
      name={name}
      onLevelChange={handleLevelChange}
    />
  );
}
