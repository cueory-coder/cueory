import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dailyGames, retiredGameNames, statGame } from '../config/games';
import { browserStorage } from '../scripts/storage';
import {
  deleteStats,
  forgetHeldRounds,
  GAME_RESULT_EVENT,
  heldRounds,
  loadStats,
  localDay,
  saveStats,
  STATS_STORAGE_KEY,
  triesInWords,
  type SavedStats,
} from './gameresults';
import { forget, forgetAllGames, gameSummaryInWords, recordResult, summary, type GameId, type GameStats } from './gamestats';

const button = 'min-h-11 rounded-pill border border-control bg-page px-5 py-2.5 text-ink';

/** What this browser keeps right now. Another open tab may have turned stats on or off, or added a game. */
const latest = (): SavedStats => loadStats(browserStorage(), localDay(new Date()));

/**
 * Private stats for the daily games (D-76). Off until the student turns them on; then this browser keeps each finished
 * round (the day, solved or not, and its small progress fields) and shows a summary per game. Nothing is sent
 * to us. Only stat has a streak (consecutive days played). Turning stats off or "forget" deletes the records.
 * Results older than 400 days are deleted when the page opens. Rendered only in the browser (client:only).
 *
 * Every change starts from what storage holds at that moment, not from what this tab last showed, so turning stats off
 * in one tab holds in every other open tab too. Rounds not kept yet wait in ./gameresults, which drops them whenever
 * another tab changes the stats.
 */
interface Props {
  /** The games in the order the page shows them. */
  games: readonly GameId[];
  /** Stat samples are shown only on staging and previews until reviewed content is approved. */
  showStat?: boolean;
}

export default function GameStatsPanel({ games: order, showStat = false }: Props) {
  const [saved, setSaved] = useState(latest);
  const [said, setSaid] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [confirmingAll, setConfirmingAll] = useState(false);
  /** Latest confirmation state for the storage/pageshow listeners installed once. */
  const confirmingAllRef = useRef(confirmingAll);
  confirmingAllRef.current = confirmingAll;
  /** What this tab shows, for the listeners, which are set up once. */
  const shown = useRef(saved);
  shown.current = saved;
  const toggleButton = useRef<HTMLButtonElement>(null);
  const forgetAllTrigger = useRef<HTMLButtonElement>(null);
  const cancelAllButton = useRef<HTMLButtonElement>(null);
  const headings = useRef(new Map<GameId, HTMLHeadingElement>());
  /** Restore focus after a destructive action or when the confirmation buttons disappear. */
  const focusNext = useRef<GameId | 'switch' | 'forget-all-trigger' | 'forget-all-cancel' | undefined>(undefined);

  useLayoutEffect(() => {
    const target = focusNext.current;
    if (target === undefined) return;
    focusNext.current = undefined;
    if (target === 'switch') toggleButton.current?.focus();
    else if (target === 'forget-all-trigger') forgetAllTrigger.current?.focus();
    else if (target === 'forget-all-cancel') cancelAllButton.current?.focus();
    else headings.current.get(target)?.focus();
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
    // Results from before the last 400 days are deleted now, so nothing older stays in this browser.
    const now = latest();
    if (now.on) saveStats(browserStorage(), now.stats);
    setSaved(now);

    // Keeps the rounds waiting in ./gameresults when stats are on. While they're off, the rounds keep waiting, so
    // turning stats on right after a game still counts it.
    const keepWaiting = () => {
      const waiting = heldRounds();
      if (waiting.length === 0) return;
      const now = latest();
      if (!now.on) {
        if (shown.current.on) setSaid("stats are off now, so this game wasn't kept.");
        setSaved(now);
        return;
      }
      let stats = now.stats;
      let message = '';
      for (const result of waiting) {
        const name = result.game === 'stat' ? statGame.name
          : result.game === 'sudoku' ? dailyGames.find((game) => game.id === 'triage')?.name ?? ''
          : result.game === 'triage' ? retiredGameNames.triage
          : dailyGames.find((game) => game.id === result.game)?.name ?? '';
        const next = recordResult(stats, result);
        // The first result of each game and day counts; a replay changes nothing.
        if (name) message = next === stats ? `${name}: today's first game is already in your stats.` : `${name} added to your stats.`;
        stats = next;
      }
      if (stats === now.stats) {
        forgetHeldRounds();
        setSaved(now);
        setSaid(message);
        return;
      }
      if (keep(stats, message)) {
        forgetHeldRounds();
        // A new result changed what the student originally agreed to erase.
        // Require fresh confirmation, but only if saving the result succeeded.
        if (confirmingAllRef.current) {
          confirmingAllRef.current = false;
          focusNext.current = 'switch';
          setConfirmingAll(false);
          setSaid('your saved stats changed. review them before forgetting anything.');
        }
      }
    };
    // Another tab changed the stats, or this page came back from the back/forward cache. ./gameresults has already
    // dropped any waiting rounds; this shows what storage holds now.
    const dismissStaleConfirmation = (message: string) => {
      // Another tab may have cleared or replaced the results we were about to delete.
      // Close the stale confirmation and send keyboard focus to a control that still exists.
      if (!confirmingAllRef.current) return;
      focusNext.current = 'switch';
      setConfirmingAll(false);
      setSaid(message);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STATS_STORAGE_KEY) {
        dismissStaleConfirmation('stats changed in another tab. review them before forgetting anything.');
        setSaved(latest());
      }
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        dismissStaleConfirmation('your saved stats may have changed. review them before continuing.');
        setSaved(latest());
      }
    };
    // Rounds finished before this panel loaded are kept now, then each one as it ends.
    keepWaiting();
    window.addEventListener(GAME_RESULT_EVENT, keepWaiting);
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener(GAME_RESULT_EVENT, keepWaiting);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  const toggle = () => {
    if (saved.on) {
      setConfirmingAll(false);
      if (!deleteStats(browserStorage())) {
        setSaid("this browser didn't let us delete your stats. clearing this site's data in your browser removes them.");
        return;
      }
      forgetHeldRounds();
      setSaved({ on: false, stats: [] });
      setSaid('stats are off, and what was kept is forgotten.');
      return;
    }
    const now = latest();
    const stats = heldRounds().reduce<GameStats>((all, result) => recordResult(all, result), now.stats);
    if (keep(stats, 'stats are on. they stay in this browser.')) forgetHeldRounds();
  };

  /** What storage holds now, or undefined (and the switch shows off) when stats were turned off meanwhile. */
  const stillOn = (): GameStats | undefined => {
    const now = latest();
    if (now.on) return now.stats;
    focusNext.current = 'switch';
    setSaved(now);
    setSaid('stats are off now, so nothing is kept.');
    return undefined;
  };

  // A forgotten game's rounds that are still waiting to be kept are forgotten too.
  const forgetGame = (game: GameId, name: string) => {
    const stats = stillOn();
    if (!stats) return;
    forgetHeldRounds(game);
    // A retired sort row disappears when its last record is forgotten, so there is no heading to focus.
    focusNext.current = game === 'triage' ? 'switch' : game;
    keep(forget(stats, game), `${name} stats forgotten.`);
  };

  const requestForgetAll = () => {
    focusNext.current = 'forget-all-cancel';
    setConfirmingAll(true);
    setSaid('choose cancel or yes, forget all.');
  };

  const cancelForgetAll = () => {
    focusNext.current = 'forget-all-trigger';
    setConfirmingAll(false);
    setSaid('nothing was forgotten.');
  };

  const confirmForgetAll = () => {
    // Read current storage, not this tab's last snapshot, in case another tab has changed it.
    const stats = stillOn();
    if (!stats) {
      setConfirmingAll(false);
      return;
    }
    // Do not drop held rounds or change the panel if storage refuses to save the cleared record.
    const savedClear = keep(forgetAllGames(stats), 'all your stats are forgotten. stats stay on.');
    if (savedClear) forgetHeldRounds();
    focusNext.current = savedClear ? 'switch' : 'forget-all-trigger';
    setConfirmingAll(false);
  };

  const games: { id: GameId; name: string }[] = order.flatMap((id) =>
    dailyGames.filter((game) => game.id === id && game.ready)
      .map((game) => ({ id: game.id === 'triage' ? 'sudoku' : game.id, name: game.name })),
  );
  if (showStat) games.push({ id: 'stat', name: statGame.name });
  // The old game is listed only when a student has previous sort results.
  if (summary(saved.stats, 'triage').played > 0) games.push({ id: 'triage', name: retiredGameNames.triage });

  return (
    <section className="mt-16" aria-labelledby="stats-heading" data-testid="game-stats">
      <h2 id="stats-heading" className="text-2xl font-medium">
        your stats
      </h2>
      <p className="mt-2 text-ink-soft">
        only if you want them. they stay in this browser, on this device, and never reach us. stat's streak counts days played in a row.
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
              const displayName = game.name;
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
                    {displayName}
                  </h3>
                  <p className="mt-1">{gameSummaryInWords(saved.stats, game.id)}</p>
                  {result.played > 0 && (
                    <>
                      {game.id !== 'stat' && game.id !== 'sudoku' &&
                        <p className="mt-1 text-sm text-ink-soft">{triesInWords(game.id, result.triesCounts)}</p>}
                      <button type="button" className={`${button} mt-2`} onClick={() => forgetGame(game.id, displayName)}>
                        forget {displayName}
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {saved.stats.length > 0 && (confirmingAll ? (
            <div
              role="group"
              aria-labelledby="forget-all-question"
              aria-describedby="forget-all-description"
              data-testid="forget-all-confirmation"
              className="mt-6 rounded-lg border border-line bg-page p-5"
            >
              <p id="forget-all-question" className="font-medium">forget every game's stats?</p>
              <p id="forget-all-description" className="mt-2 text-sm text-ink-soft">
                this removes every saved game result on this device. you can't undo it. stats will stay on.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button ref={cancelAllButton} type="button" className={button} onClick={cancelForgetAll}>
                  cancel
                </button>
                <button type="button" className={button} onClick={confirmForgetAll}>
                  yes, forget all
                </button>
              </div>
            </div>
          ) : (
            <button ref={forgetAllTrigger} type="button" className={`${button} mt-6`} onClick={requestForgetAll}>
              forget all my stats
            </button>
          ))}
        </>
      )}

      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="stats-live">
        {said}
      </p>
    </section>
  );
}
