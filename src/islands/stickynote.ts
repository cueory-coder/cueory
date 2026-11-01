/**
 * When a glove note may appear (Christian's pop-up request, D-94; Task 50). Pure decisions: no timers, no DOM, no
 * storage calls inside `decideNote`. The page script measures the visit and asks; this file answers. Internal names
 * still say "sticky note" (the request started as one); every visible word says "glove note".
 *
 * The rules, in short:
 * - Welcome notes: marketing pages only, at most one per visit, never in the first 5 seconds, then after 8 seconds on
 *   screen or halfway down the page. What they say rotates between visits: the launch list (skipped once the visitor
 *   has joined or has an account), supporting our mission, a break idea; never the same as last visit's.
 * - Break notes: study pages only, at a pause (3 seconds without interaction, or the end of a question set or step),
 *   never mid-answer. With the break timer off: one after 25 minutes of active study, once per visit. With it on: when
 *   the timer says a break is due (its own snooze and skip decide the rest, #67).
 * - Never on `/start`, the signup thank-you page, `/admin` or `/privacy` (page kind `never`), and never while the
 *   visitor is typing, dragging, mid-question, or has the ☰ panel, a preview or the account menu open.
 * - One note on screen at a time; a break note may replace a welcome note, never the other way round. Once a note of
 *   a kind was shown (and so closed or left), no other note of that kind appears that visit, apart from the timer's.
 * - Each note uses the next glove photo (0 to 4), never the same one twice in a row.
 * - A browser that can't remember (session storage missing or blocked) gets at most one note per page load.
 */
import type { KeyValueStorage } from '../scripts/storage';

export type NoteKind = 'welcome' | 'break';
export type WelcomeContent = 'launch-list' | 'mission' | 'break-idea';
export type PageKind = 'marketing' | 'study' | 'never';

/** The five glove photos (five colors, five angles). */
export const PHOTO_COUNT = 5;
/** No welcome note before this many seconds on screen. */
export const WELCOME_EARLIEST_SECONDS = 5;
/** A welcome note may appear after this many seconds on screen... */
export const WELCOME_AFTER_SECONDS = 8;
/** ...or once the visitor is this far down the page (0 at the top, 1 at the bottom). */
export const WELCOME_SCROLL = 0.5;
/** With the break timer off, the one break note comes after this many minutes of active study in the visit. */
export const BREAK_AFTER_MINUTES = 25;
/** A pause: this many seconds without interaction. */
export const PAUSE_IDLE_SECONDS = 3;
/** The order welcome notes rotate in between visits. */
export const WELCOME_ROTATION: readonly WelcomeContent[] = ['launch-list', 'mission', 'break-idea'];

/** Session storage key for this visit's memory. It stays in the visitor's browser and is never sent to us. */
export const VISIT_STORAGE_KEY = 'cueory-glove-note';
/**
 * Local storage key for what the last visit's welcome note said, so the next visit says something else. It stays in
 * the visitor's browser; `/privacy` must list it before the notes are switched on.
 */
export const LAST_WELCOME_STORAGE_KEY = 'cueory-glove-note-welcome';

/** What this visit remembers. */
export interface Visit {
  /** The kinds of note already shown this visit (a shown note counts whether it was closed or left). */
  shown: NoteKind[];
  /** The last glove photo used, 0 to 4, or null before the first note. */
  lastPhoto: number | null;
}

export interface Busy {
  typing: boolean;
  dragging: boolean;
  midQuestion: boolean;
  menuOpen: boolean;
  previewOpen: boolean;
  accountMenuOpen: boolean;
}

export interface NoteInput {
  visit: Visit;
  /** False when this browser can't keep the visit's memory; then `visit` covers this page load only. */
  remembered: boolean;
  page: PageKind;
  secondsOnScreen: number;
  /** How far down the page, 0 to 1. */
  scrollFraction: number;
  /** Minutes of study this visit while the tab was visible. */
  activeStudyMinutes: number;
  secondsIdle: number;
  /** At the end of a question set or a step. */
  atStepEnd: boolean;
  busy: Busy;
  timerOn: boolean;
  /** The break timer's own "a break is due" (only read when the timer is on). */
  timerBreakDue: boolean;
  /** The note on screen now, if any. */
  noteOnScreen: NoteKind | null;
  joinedLaunchList: boolean;
  hasAccount: boolean;
  /** What the last visit's welcome note said, if anything. */
  lastWelcome: WelcomeContent | null;
  /** A number from 0 (inclusive) to 1 (exclusive), like Math.random; tests pass a fixed one. */
  random: () => number;
}

export type NoteDecision =
  | { show: false }
  | { show: true; kind: 'welcome'; photoIndex: number; content: WelcomeContent }
  | { show: true; kind: 'break'; photoIndex: number };

const NOTHING: NoteDecision = { show: false };

function isBusy(busy: Busy): boolean {
  return busy.typing || busy.dragging || busy.midQuestion || busy.menuOpen || busy.previewOpen || busy.accountMenuOpen;
}

function validPhoto(index: unknown): index is number {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < PHOTO_COUNT;
}

/** A random index from 0 to `count - 1`, safe against a `random` that returns something outside 0..1. */
function pick(count: number, random: () => number): number {
  const value = random();
  const unit = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1 - Number.EPSILON) : 0;
  return Math.floor(unit * count);
}

/** The next glove photo: any of the five, never the one used last. */
export function nextPhoto(lastPhoto: number | null, random: () => number): number {
  if (!validPhoto(lastPhoto)) return pick(PHOTO_COUNT, random);
  const others = Array.from({ length: PHOTO_COUNT }, (_, index) => index).filter((index) => index !== lastPhoto);
  return others[pick(others.length, random)]!;
}

/**
 * What this visit's welcome note says: the next one in the rotation after last visit's, skipping the launch list once
 * the visitor has joined it or has an account. Never the same as last visit's.
 */
export function nextWelcome(
  lastWelcome: WelcomeContent | null,
  joinedLaunchList: boolean,
  hasAccount: boolean,
): WelcomeContent {
  const launchListOpen = !joinedLaunchList && !hasAccount;
  const available = WELCOME_ROTATION.filter((content) => content !== 'launch-list' || launchListOpen);
  const start = lastWelcome === null ? -1 : WELCOME_ROTATION.indexOf(lastWelcome);
  for (let step = 1; step <= WELCOME_ROTATION.length; step += 1) {
    const candidate = WELCOME_ROTATION[(start + step) % WELCOME_ROTATION.length]!;
    if (available.includes(candidate) && candidate !== lastWelcome) return candidate;
  }
  return available[0]!;
}

function atPause(input: NoteInput): boolean {
  return input.atStepEnd || input.secondsIdle >= PAUSE_IDLE_SECONDS;
}

function breakDue(input: NoteInput): boolean {
  if (input.page !== 'study' || input.noteOnScreen === 'break') return false;
  if (!atPause(input)) return false;
  if (input.timerOn) return input.timerBreakDue;
  return input.activeStudyMinutes >= BREAK_AFTER_MINUTES && !input.visit.shown.includes('break');
}

function welcomeDue(input: NoteInput): boolean {
  if (input.page !== 'marketing' || input.noteOnScreen !== null) return false;
  if (input.visit.shown.includes('welcome')) return false;
  if (input.secondsOnScreen < WELCOME_EARLIEST_SECONDS) return false;
  return input.secondsOnScreen >= WELCOME_AFTER_SECONDS || input.scrollFraction >= WELCOME_SCROLL;
}

/** Whether a glove note should appear now, and which. */
export function decideNote(input: NoteInput): NoteDecision {
  if (input.page === 'never' || isBusy(input.busy)) return NOTHING;
  // A browser that can't remember gets at most one note per page load.
  if (!input.remembered && input.visit.shown.length > 0) return NOTHING;
  if (breakDue(input)) return { show: true, kind: 'break', photoIndex: nextPhoto(input.visit.lastPhoto, input.random) };
  if (welcomeDue(input)) {
    return {
      show: true,
      kind: 'welcome',
      photoIndex: nextPhoto(input.visit.lastPhoto, input.random),
      content: nextWelcome(input.lastWelcome, input.joinedLaunchList, input.hasAccount),
    };
  }
  return NOTHING;
}

/** The visit's memory after a note was shown. */
export function recordShown(visit: Visit, decision: NoteDecision): Visit {
  if (!decision.show) return visit;
  return {
    shown: visit.shown.includes(decision.kind) ? [...visit.shown] : [...visit.shown, decision.kind],
    lastPhoto: decision.photoIndex,
  };
}

/** A visit with nothing shown yet. */
export function emptyVisit(): Visit {
  return { shown: [], lastPhoto: null };
}

/** Reads the visit's memory strictly; anything unreadable or malformed is a fresh visit. */
export function readVisit(storage: KeyValueStorage | undefined): Visit {
  if (!storage) return emptyVisit();
  let raw: string | null;
  try {
    raw = storage.getItem(VISIT_STORAGE_KEY);
  } catch {
    return emptyVisit();
  }
  if (raw === null) return emptyVisit();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyVisit();
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return emptyVisit();
  const { shown, lastPhoto } = data as { shown?: unknown; lastPhoto?: unknown };
  if (!Array.isArray(shown) || shown.some((kind) => kind !== 'welcome' && kind !== 'break')) return emptyVisit();
  if (lastPhoto !== null && !validPhoto(lastPhoto)) return emptyVisit();
  return { shown: [...new Set(shown as NoteKind[])], lastPhoto: lastPhoto as number | null };
}

/** Saves the visit's memory. Returns false when this browser can't remember it. */
export function writeVisit(storage: KeyValueStorage | undefined, visit: Visit): boolean {
  if (!storage) return false;
  try {
    storage.setItem(VISIT_STORAGE_KEY, JSON.stringify({ shown: visit.shown, lastPhoto: visit.lastPhoto }));
    return true;
  } catch {
    return false;
  }
}

/** What the last visit's welcome note said, or null if nothing (or nothing readable) is saved. */
export function readLastWelcome(storage: KeyValueStorage | undefined): WelcomeContent | null {
  if (!storage) return null;
  try {
    const saved = storage.getItem(LAST_WELCOME_STORAGE_KEY);
    return WELCOME_ROTATION.includes(saved as WelcomeContent) ? (saved as WelcomeContent) : null;
  } catch {
    return null;
  }
}

/** Saves what this visit's welcome note said. Returns false when this browser can't remember it. */
export function writeLastWelcome(storage: KeyValueStorage | undefined, content: WelcomeContent): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LAST_WELCOME_STORAGE_KEY, content);
    return true;
  } catch {
    return false;
  }
}
