/** The home-page date is local to the visitor, never frozen at build time (W01-2). */
import { dayLabel } from './daily';

export const MIDNIGHT_MESSAGE = 'new puzzles arrive at midnight on your device.';
const UNAVAILABLE_MESSAGE = "your device's date is unavailable. " + MIDNIGHT_MESSAGE;
const RETRY_MS = 60_000;

/** Pure text formatter. Never present an invented date if the device clock is unavailable. */
export function dailyLine(date: Date | null): string {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return UNAVAILABLE_MESSAGE;
  try {
    return "today's set: " + dayLabel(date) + '. ' + MIDNIGHT_MESSAGE;
  } catch {
    return UNAVAILABLE_MESSAGE;
  }
}

/** Allows blocked or invalid clocks to fall back without breaking the page. */
export function dailyLineFromClock(clock: () => Date): string {
  try {
    return dailyLine(clock());
  } catch {
    return UNAVAILABLE_MESSAGE;
  }
}

/** The local Date constructor accounts for 23-hour and 25-hour DST days. */
export function msUntilLocalMidnight(date: Date | null): number | null {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  try {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    const remaining = next.getTime() - date.getTime();
    return Number.isFinite(remaining) && remaining > 0 ? remaining : null;
  } catch {
    return null;
  }
}

/** Browser-only mounting. The matching Astro component renders a no-JS fallback first. */
function mountDailyLine(): void {
  const target = document.querySelector<HTMLElement>('[data-daily-games-date]');
  if (!target) return;
  let timeout: number | undefined;

  const refresh = () => {
    if (timeout !== undefined) window.clearTimeout(timeout);
    let now: Date | null = null;
    try { now = new Date(); } catch { /* A blocked clock must not break the homepage. */ }
    target.textContent = dailyLine(now);
    timeout = window.setTimeout(refresh, msUntilLocalMidnight(now) ?? RETRY_MS);
  };

  refresh();
  // Hidden tabs may have throttled timers, so update immediately when the student returns.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountDailyLine, { once: true });
  } else {
    mountDailyLine();
  }
}
