import { useCallback, useEffect, useRef, useState } from 'react';
import { BREAK_STORAGE_KEY, readBreakState, writeBreakState } from '../scripts/breakstore';
import {
  applyMove,
  breakAnnouncement,
  pause,
  nextRefreshMs,
  roundedMinutesLeft,
  resume,
  skipBreak,
  snooze,
  startBreak,
  startBreaks,
  statusInWords,
  tick,
  turnOff,
  turnOn,
  type BreakSettings,
  type BreakState,
  type BreakStatus,
  type BreakMove,
} from './breaks';

interface Props {
  settings?: BreakSettings;
}

type FocusTarget = 'pause-resume' | 'break-choice';

const control = 'min-h-11 min-w-11 rounded-md border border-control bg-page px-4 py-2 text-ink disabled:opacity-50';

/** Optional and deliberately plain: no sound, automatic opening or animated ring. */
export default function BreakTimer({ settings }: Props) {
  const [state, setState] = useState(() => startBreaks(settings));
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const previousAnnouncement = useRef<{ status: BreakStatus; minutes: number }>({ status: 'off', minutes: 0 });
  const storage = useRef<Storage | undefined>(undefined);
  const lastSavedState = useRef<BreakState | null>(null);
  const pauseResumeControl = useRef<HTMLButtonElement>(null);
  const startBreakControl = useRef<HTMLButtonElement>(null);
  const focusAfterMove = useRef<FocusTarget | null>(null);
  const on = state.status !== 'off';
  const canPause = state.status === 'focusing' || state.status === 'on break' || state.status === 'paused';
  const isPaused = state.status === 'paused';
  const minutes = roundedMinutesLeft(state, now);

  // Hydrate from the tab's saved end time. In restrictive browsers, keep the timer in memory.
  useEffect(() => {
    const current = Date.now();
    try {
      const available = window.sessionStorage;
      // Access itself, as well as getItem, can throw when storage is blocked.
      const saved = available.getItem(BREAK_STORAGE_KEY);
      storage.current = available;
      // Preserve the caller's settings when no timer has been saved in this tab.
      // A saved off timer also accepts new explicit settings.
      const restored = saved ? readBreakState(available, current) : startBreaks(settings);
      const initial = settings && restored.status === 'off' ? startBreaks(settings) : restored;
      lastSavedState.current = initial;
      setState(initial);
    } catch {
      setStorageUnavailable(true);
    }
    setNow(current);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || storageUnavailable || state === lastSavedState.current) return;
    lastSavedState.current = state;
    if (!writeBreakState(storage.current, state, Date.now())) setStorageUnavailable(true);
  }, [ready, state, storageUnavailable]);

  // Only changes of phase and occasional meaningful minute marks are announced.
  // The visible text stays readable to screen readers without announcing every second.
  useEffect(() => {
    if (!ready) return;
    const words = breakAnnouncement(previousAnnouncement.current, state, now);
    if (words !== null) setAnnouncement(words);
    previousAnnouncement.current = { status: state.status, minutes };
  }, [ready, state, minutes, now]);

  const refresh = useCallback(() => {
    const current = Date.now();
    // Do not lose keyboard focus when an expired focus period removes the pause control.
    if (
      state.status === 'focusing'
      && state.endsAt !== null
      && current >= state.endsAt
      && document.activeElement === pauseResumeControl.current
    ) focusAfterMove.current = 'break-choice';
    setNow(current);
    setState(value => tick(value, current));
  }, [state.endsAt, state.status]);

  useEffect(() => {
    if (!ready || (state.status !== 'focusing' && state.status !== 'on break')) return;
    // Refresh at the next displayed minute boundary, even after a partial-minute pause/resume.
    const wait = nextRefreshMs(state, Date.now());
    const timer = window.setTimeout(refresh, wait);
    return () => window.clearTimeout(timer);
  }, [ready, now, state.endsAt, state.status, refresh]);

  // Background timers are throttled. Reconcile immediately after a tab/phone wakes up.
  useEffect(() => {
    if (!ready) return;
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [ready, refresh]);

  useEffect(() => {
    const target = focusAfterMove.current;
    if (!target) return;
    focusAfterMove.current = null;
    (target === 'pause-resume' ? pauseResumeControl.current : startBreakControl.current)
      ?.focus({ preventScroll: true });
  });

  const move = (change: BreakMove, focus?: FocusTarget) => {
    const current = Date.now();
    focusAfterMove.current = focus ?? null;
    if (
      state.status === 'focusing'
      && state.endsAt !== null
      && current >= state.endsAt
      && document.activeElement === pauseResumeControl.current
    ) focusAfterMove.current = 'break-choice';
    setNow(current);
    setState(value => applyMove(change, value, current));
  };

  return (
    <section aria-label="break timer" className="max-w-full rounded-md border border-line p-4 text-ink" data-testid="break-timer">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">break timer</h2>
        <button
          type="button"
          className={control}
          aria-pressed={on}
          disabled={!ready}
          onClick={() => move(on ? turnOff : turnOn)}
        >
          {on ? 'turn off' : 'turn on'}
        </button>
      </div>

      {on && <>
        <p role="timer" aria-live="off" className="mt-3 text-sm text-ink-soft" data-testid="break-status">
          {statusInWords(state, now)}
        </p>
        <div className="mt-3 flex max-w-full flex-wrap gap-2">
          {canPause &&
            <button
              ref={pauseResumeControl}
              key="pause-resume"
              type="button"
              className={control}
              onClick={() => move(isPaused ? resume : pause)}
            >
              {isPaused ? 'resume' : 'pause'}
            </button>}
          {state.status === 'break due' && <>
            <button
              ref={startBreakControl}
              key="start-break"
              type="button"
              className={control}
              onClick={() => move(startBreak, 'pause-resume')}
            >
              start break
            </button>
            <button
              key="skip"
              type="button"
              className={control}
              onClick={() => move(skipBreak, 'pause-resume')}
            >
              skip
            </button>
            <button
              key="snooze"
              type="button"
              className={control}
              onClick={() => move(snooze, 'pause-resume')}
            >
              5 more minutes
            </button>
          </>}
        </div>
      </>}

      {storageUnavailable && <p role="status" className="mt-3 text-sm text-ink-soft" data-testid="break-storage-warning">
        progress won't be saved because browser storage is unavailable. the timer still works for this visit.
      </p>}
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="break-live">{announcement}</p>
    </section>
  );
}
