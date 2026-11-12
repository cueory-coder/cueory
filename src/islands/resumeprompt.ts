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
