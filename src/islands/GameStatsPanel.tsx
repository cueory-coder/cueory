import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dailyGames } from '../config/games';
import { browserStorage } from '../scripts/storage';
import {
  deleteStats,
  GAME_RESULT_EVENT,
  loadStats,
  saveStats,
  triesInWords,
  type RoundResult,
} from './gameresults';
import { forget, recordResult, summary, summaryInWords, type GameId, type GameStats } from './gamestats';

const button = 'min-h-11 rounded-pill border border-control bg-page px-5 py-2.5 text-ink';

/**
 * Private stats for the daily games (D-76). Off until the student turns them on; then this browser keeps each finished
 * round (the day, solved or not, and the tries) and shows a short summary per game. Nothing is ever sent to us, there
 * are no streaks, and turning stats off or "forget" deletes them. Rendered only in the browser (client:only).
 */
interface Props {
  /** The games in the order the page shows them. */
  games: readonly GameId[];
}

export default function GameStatsPanel({ games: order }: Props) {
  const [saved, setSaved] = useState(() => loadStats(browserStorage()));
  const [said, setSaid] = useState('');
  const [blocked, setBlocked] = useState(false);
  /** Rounds finished on this page while stats were off, so turning them on right after a game still counts it. */
  const unsaved = useRef<RoundResult[]>([]);
  /** The latest saved state, for the event listener, which is set up once. */
  const current = useRef(saved);
  current.current = saved;
  const toggleButton = useRef<HTMLButtonElement>(null);
  const headings = useRef(new Map<GameId, HTMLHeadingElement>());
  /** Where focus goes after a "forget" button removes itself, so keyboard users keep their place. */
  const focusNext = useRef<GameId | 'switch' | undefined>(undefined);

  useLayoutEffect(() => {
    const target = focusNext.current;
    if (target === undefined) return;
    focusNext.current = undefined;
    (target === 'switch' ? toggleButton.current : headings.current.get(target))?.focus();
  });

  const keep = (stats: GameStats, message: string): boolean => {
    if (!saveStats(browserStorage(), stats)) {
      setBlocked(true);
      setSaid("this browser won't keep stats, so nothing was saved.");
      return false;
    }
    setBlocked(false);
    setSaved({ on: true, stats });
    setSaid(message);
    return true;
  };

  useEffect(() => {
    const onResult = (event: Event) => {
      const result = (event as CustomEvent<RoundResult>).detail;
      if (!current.current.on) {
        unsaved.current.push(result);
        return;
      }
      const name = dailyGames.find((game) => game.id === result?.game)?.name;
      const next = recordResult(current.current.stats, result);
      // The first result of each game and day counts; a replay changes nothing.
      if (next === current.current.stats) {
        if (name) setSaid(`${name}: today's first game is already in your stats.`);
        return;
      }
      keep(next, name ? `${name} added to your stats.` : '');
    };
    window.addEventListener(GAME_RESULT_EVENT, onResult);
    return () => window.removeEventListener(GAME_RESULT_EVENT, onResult);
  }, []);

  const toggle = () => {
    if (saved.on) {
      if (!deleteStats(browserStorage())) {
        setSaid("this browser didn't let us delete your stats. clearing this site's data in your browser removes them.");
        return;
      }
      unsaved.current = [];
      setSaved({ on: false, stats: [] });
      setSaid('stats are off, and what was kept is forgotten.');
      return;
    }
    const stats = unsaved.current.reduce<GameStats>((all, result) => recordResult(all, result), saved.stats);
    if (keep(stats, 'stats are on. they stay in this browser.')) unsaved.current = [];
  };

  const forgetGame = (game: GameId, name: string) => {
    focusNext.current = game;
    keep(forget(saved.stats, game), `${name} stats forgotten.`);
  };

  const forgetAll = () => {
    focusNext.current = 'switch';
    keep(forget(saved.stats), 'all your stats are forgotten. stats stay on.');
  };

  const games = order.flatMap((id) => dailyGames.filter((game) => game.id === id && game.ready));

  return (
    <section className="mt-16" aria-labelledby="stats-heading" data-testid="game-stats">
      <h2 id="stats-heading" className="text-2xl font-medium">
        your stats
      </h2>
      <p className="mt-2 text-ink-soft">
        only if you want them. they stay in this browser, on this device, and never reach us. there are no streaks.
      </p>
      <button
        ref={toggleButton}
        type="button"
        role="switch"
        aria-checked={saved.on}
        aria-describedby="stats-switch-note"
        className={`${button} mt-4 inline-flex max-w-full items-center gap-3 text-left`}
        onClick={toggle}
      >
        <span>keep my stats</span>
        <span aria-hidden="true" className="font-medium">
          {saved.on ? 'on' : 'off'}
        </span>
      </button>
      <p id="stats-switch-note" className="mt-2 text-sm text-ink-soft">
        {blocked
          ? "this browser won't keep them (private browsing or blocked site data)."
          : saved.on
            ? 'turning this off forgets them.'
            : 'off: nothing is kept.'}
      </p>

      {saved.on && (
        <>
          <ul className="mt-6 flex flex-col gap-5" aria-label="stats for each game">
            {games.map((game) => {
              const result = summary(saved.stats, game.id);
              return (
                <li key={game.id}>
                  <h3
                    ref={(node) => {
                      if (node) headings.current.set(game.id, node);
                      else headings.current.delete(game.id);
                    }}
                    tabIndex={-1}
                    className="font-medium"
                  >
                    {game.name}
                  </h3>
                  <p className="mt-1">{result.played === 0 ? 'not played yet.' : summaryInWords(result)}</p>
                  {result.played > 0 && (
                    <>
                      <p className="mt-1 text-sm text-ink-soft">{triesInWords(game.id, result.triesCounts)}</p>
                      <button type="button" className={`${button} mt-2`} onClick={() => forgetGame(game.id, game.name)}>
                        forget {game.name}
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {saved.stats.length > 0 && (
            <button type="button" className={`${button} mt-6`} onClick={forgetAll}>
              forget all my stats
            </button>
          )}
        </>
      )}

      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="stats-live">
        {said}
      </p>
    </section>
  );
}
