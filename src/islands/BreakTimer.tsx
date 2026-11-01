import { useEffect, useRef, useState } from 'react';
import {
  pause,
  remainingMs,
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
} from './breaks';

interface Props {
  settings?: BreakSettings;
}

type Move = (state: BreakState, now: number) => BreakState;

const control = 'min-h-11 min-w-11 rounded-md border border-control bg-page px-4 py-2 text-ink disabled:opacity-50';

/** Optional and deliberately plain: no storage, sound, automatic opening or motion. */
export default function BreakTimer({ settings }: Props) {
  const [state, setState] = useState(() => startBreaks(settings));
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState('');
  const previousStatus = useRef(state.status);
  const on = state.status !== 'off';

  useEffect(() => {
    if (previousStatus.current === state.status) return;
    previousStatus.current = state.status;
    setAnnouncement(statusInWords(state, Date.now()));
  }, [state.status]);

  useEffect(() => {
    if (state.status !== 'focusing' && state.status !== 'on break') return;
    const current = Date.now();
    // Refresh at most once a minute, but use a shorter final wait so a resumed partial minute ends on time.
    const wait = Math.min(60_000, remainingMs(state, current));
    const timer = window.setTimeout(() => {
      const current = Date.now();
      setNow(current);
      setState((value) => tick(value, current));
    }, wait);
    return () => window.clearTimeout(timer);
  }, [now, state.endsAt, state.status]);

  const move = (change: Move) => {
    const current = Date.now();
    setNow(current);
    setState((value) => change(value, current));
  };

  return (
    <section aria-label="break timer" className="max-w-full rounded-md border border-line p-4 text-ink" data-testid="break-timer">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">break timer</h2>
        <button
          type="button"
          className={control}
          aria-pressed={on}
          onClick={() => move(on ? turnOff : turnOn)}
        >
          {on ? 'turn off' : 'turn on'}
        </button>
      </div>

      {on && <>
        <p className="mt-3 text-sm text-ink-soft" data-testid="break-status">{statusInWords(state, now)}</p>
        <div className="mt-3 flex max-w-full flex-wrap gap-2">
          {(state.status === 'focusing' || state.status === 'on break') &&
            <button type="button" className={control} onClick={() => move(pause)}>pause</button>}
          {state.status === 'paused' &&
            <button type="button" className={control} onClick={() => move(resume)}>resume</button>}
          {state.status === 'break due' && <>
            <button type="button" className={control} onClick={() => move(startBreak)}>start break</button>
            <button type="button" className={control} onClick={() => move(skipBreak)}>skip</button>
            <button type="button" className={control} onClick={() => move(snooze)}>5 more minutes</button>
          </>}
        </div>
      </>}

      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="break-live">{announcement}</p>
    </section>
  );
}
