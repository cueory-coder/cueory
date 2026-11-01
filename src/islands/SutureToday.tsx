import { useMemo } from 'react';
import SutureGame from './SutureGame';
import type { SuturePuzzle } from './suture';
import { dayNumber, puzzleForDay } from './pulse';

interface Props {
  /** Sample puzzles (D-71): the page hands over all of them, and today's is picked from the visitor's own date. */
  puzzles: SuturePuzzle[];
  /** The game's name as the page shows it, from src/config/games.ts (D-66). */
  name: string;
}

/**
 * Word path on /play (D-71): picks the puzzle for the visitor's own date, going round the samples like the other daily
 * games, and hands it to the board. Rendered only in the browser (client:only), so "today" is the visitor's day.
 */
export default function SutureToday({ puzzles, name }: Props) {
  const puzzle = useMemo(() => puzzleForDay(puzzles, dayNumber(new Date())), [puzzles]);
  if (!puzzle) return <p>no puzzle today.</p>;
  return <SutureGame puzzle={puzzle} name={name} />;
}
