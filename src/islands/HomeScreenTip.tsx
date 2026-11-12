import { useEffect, useId, useState } from 'react';
import { browserStorage } from '../scripts/storage';
import { GAME_RESULT_EVENT, localDay } from './gameresults';
import { dismissTip, loadTipState, recordFinishDay, shouldShowTip, updateTipState } from './homescreentip';

/** Sudoku reports its finish with its own event. */
const SUDOKU_SOLVED_EVENT = 'cueory:sudoku-solved';

function isStandalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

/** Renders only: the show rule and storage live in ./homescreentip. */
export default function HomeScreenTip() {
  const [visible, setVisible] = useState(false);
  const headingId = useId();

  useEffect(() => {
    const storage = browserStorage();
    // Decided once, on page load, so the tip never pops up while someone is playing.
    setVisible(shouldShowTip(loadTipState(storage), { standalone: isStandalone() }));
    const countToday = () => {
      updateTipState(storage, (state) => recordFinishDay(state, localDay(new Date())));
    };
    window.addEventListener(GAME_RESULT_EVENT, countToday);
    window.addEventListener(SUDOKU_SOLVED_EVENT, countToday);
    return () => {
      window.removeEventListener(GAME_RESULT_EVENT, countToday);
      window.removeEventListener(SUDOKU_SOLVED_EVENT, countToday);
    };
  }, []);

  if (!visible) return null;

  const hide = () => {
    updateTipState(browserStorage(), dismissTip);
    setVisible(false);
  };

  return (
    <aside
      className="mt-6 rounded-lg border border-line bg-surface p-4 text-ink sm:p-5"
      aria-labelledby={headingId}
      data-testid="home-screen-tip"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={headingId} className="min-w-0 break-words text-base font-semibold">
          add cueory to your home screen
        </h2>
        <button
          type="button"
          onClick={hide}
          className="min-h-11 min-w-11 max-w-full px-2 text-sm text-ink-soft hover:text-ink"
          data-testid="home-screen-tip-dismiss"
        >
          hide this tip
        </button>
      </div>
      <p className="mt-2 text-sm text-ink-soft">open the daily games in one tap.</p>
      <p className="mt-3 text-sm font-medium">on iPhone (Safari)</p>
      <ol className="mt-1 list-decimal pl-5 text-sm">
        <li>tap the Share button.</li>
        <li>tap Add to Home Screen.</li>
      </ol>
      <p className="mt-3 text-sm font-medium">on Android (Chrome)</p>
      <ol className="mt-1 list-decimal pl-5 text-sm">
        <li>tap the menu (three dots).</li>
        <li>tap Add to Home screen or Install app.</li>
      </ol>
    </aside>
  );
}
