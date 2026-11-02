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
 * Each sample's theme (Task 97), keyed by its id ("sample-01"). /play does not hand the theme over yet (its page belongs
 * to Task 87), so the themes are read from the same sample files the page loads. Only the `theme` field is imported.
 * A theme already on the puzzle wins, so this lookup can go once the page passes it.
 */
const sampleThemes = new Map(
  Object.entries(import.meta.glob<string>('../../content/games/suture/*.json', { eager: true, import: 'theme' })).map(
    ([file, theme]) => [file.replace(/^.*\//, '').replace(/\.json$/, ''), theme] as const,
  ),
);

/**
 * Word path on /play (D-71): picks the puzzle for the visitor's own date, going round the samples like the other daily
 * games, and hands it to the board. Rendered only in the browser (client:only), so "today" is the visitor's day.
 */
export default function SutureToday({ puzzles, name }: Props) {
  const puzzle = useMemo(() => {
    const today = puzzleForDay(puzzles, dayNumber(new Date()));
    if (!today || today.theme || !today.sample) return today;
    const theme = sampleThemes.get(today.id);
    return typeof theme === 'string' ? { ...today, theme } : today;
  }, [puzzles]);
  if (!puzzle) return <p>no puzzle today.</p>;
  return <SutureGame puzzle={puzzle} name={name} />;
}
