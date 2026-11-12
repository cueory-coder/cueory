import { useEffect, useState } from 'react';
import { nextPuzzleAt, puzzleCountdown } from './puzzlecountdown';

/** Text only: no motion, storage, network requests or per-second live announcements. */
export default function NextPuzzleCountdown() {
  const [target] = useState(() => nextPuzzleAt(new Date()));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => {
      const current = Date.now();
      setNow(current);
      if (current >= target) window.clearInterval(timer);
    };
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [target]);

  const remaining = puzzleCountdown(target, now);
  return remaining.seconds === 0 ? (
    <p className="mt-4 text-sm text-ink-soft" data-testid="next-puzzle-ready">the next puzzle day has started. refresh to play.</p>
  ) : (
    <p role="timer" aria-live="off" aria-label={`next puzzle in ${remaining.spoken}, at midnight in your time zone`} className="mt-4 text-sm text-ink-soft" data-testid="next-puzzle-countdown">
      next puzzle in <time dateTime={`PT${remaining.seconds}S`}>{remaining.text}</time>
      <span className="sr-only">, at midnight in your time zone</span>
    </p>
  );
}
