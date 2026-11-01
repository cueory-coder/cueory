import { useMemo } from 'react';
import CuewordGame from './CuewordGame';
import type { CuewordPuzzle } from './cueword';
import { dayNumber, puzzleForDay } from './pulse';

interface Props {
  /** Sample puzzles (D-67): the page hands over all of them, and today's is picked from the visitor's own date. */
  puzzles: CuewordPuzzle[];
  /** The game's name as the page shows it, from src/config/games.ts (D-66). */
  name: string;
}

/**
 * The small crossword on /play (D-67): picks the puzzle for the visitor's own date, going round the samples like pulse
 * and sort do, and hands it to the board. Rendered only in the browser (client:only), so "today" is the visitor's day.
 */
export default function CuewordToday({ puzzles, name }: Props) {
  const puzzle = useMemo(() => puzzleForDay(puzzles, dayNumber(new Date())), [puzzles]);
  if (!puzzle) return <p>no puzzle today.</p>;
  return <CuewordGame puzzle={puzzle} name={name} />;
}
