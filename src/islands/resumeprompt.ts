import { resumeName, resumePosition, type ResumeSnapshot } from '../scripts/resume';

export type ResumeChoice = 'continue' | 'start-over';
export interface ResumeDecision {
  action: ResumeChoice | null;
  close: boolean;
  error: string;
}

/** Compare only the local page path. The resume parser already rejects redirects. */
export function matchingResumePage(snapshot: ResumeSnapshot | null, page: string): ResumeSnapshot | null {
  return snapshot?.page.split('#', 1)[0] === page.split('#', 1)[0] ? snapshot : null;
}

/** Calendar days, not elapsed 24-hour blocks, so late-night saves show as yesterday. */
export function savedDayWords(savedAt: number, now: number): string {
  if (!Number.isFinite(savedAt) || !Number.isFinite(now)) return 'saved recently';
  const saved = new Date(savedAt);
  const current = new Date(now);
  if (Number.isNaN(saved.getTime()) || Number.isNaN(current.getTime())) return 'saved recently';
  const calendarTime = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((calendarTime(current) - calendarTime(saved)) / 86_400_000);
  if (days <= 0) return 'saved today';
  if (days === 1) return 'saved yesterday';
  return 'saved ' + days + ' days ago';
}

/** Pure words shared by all five study modes. Never reads or exposes saved answers. */
export function resumePromptText(snapshot: ResumeSnapshot, now: number) {
  return {
    heading: 'pick up where you left off?',
    summary: [resumeName(snapshot), resumePosition(snapshot), savedDayWords(snapshot.savedAt, now)].filter(Boolean).join(' · '),
    continueLabel: snapshot.phase === 'results' ? 'continue with results' : 'continue question ' + (snapshot.itemIndex + 1),
    startOverLabel: 'start over',
  };
}

/** Decide what a button does, preserving the existing blocked-storage error behavior. */
export function resumeDecision(choice: ResumeChoice, cleared = true): ResumeDecision {
  if (choice === 'continue') return { action: 'continue', close: true, error: '' };
  if (cleared) return { action: 'start-over', close: true, error: '' };
  return { action: null, close: false, error: 'this browser could not clear the saved place. please try again.' };
}

/** Don't steal focus from a board that already moved it to an activity control. */
export function shouldRecoverResumeFocus(activeIsMeaningful: boolean): boolean {
  return !activeIsMeaningful;
}

/**
 * Restore focus when a chosen resume button is removed by React. A board that
 * already focused the resumed activity wins, so this helper never steals it.
 * The DOM search lives here rather than in the rendering island for real unit testing.
 */
export function restoreResumeChoiceFocus(doc: Document, owner: HTMLElement | null): boolean {
  const active = doc.activeElement;
  const hasBoardFocus = Boolean(active && active.isConnected && active !== doc.body && active !== doc.documentElement);
  if (!shouldRecoverResumeFocus(hasBoardFocus)) return false;

  const main = doc.getElementById('main');
  const selector = '[tabindex="-1"], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href]';
  for (const root of [owner, main]) {
    if (!root?.isConnected) continue;
    for (const target of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
      if (!target.isConnected || target.closest('[inert], [aria-hidden="true"]') ||
          target.getClientRects().length === 0 ||
          doc.defaultView?.getComputedStyle(target).visibility === 'hidden') continue;
      target.focus({ preventScroll: true });
      if (doc.activeElement === target) return true;
    }
  }

  // Completed results can have no usable activity controls. The main landmark
  // gets programmatic focus without adding a stop to normal keyboard tab order.
  if (main?.isConnected) {
    main.tabIndex = -1;
    main.focus({ preventScroll: true });
    return doc.activeElement === main;
  }
  return false;
}
