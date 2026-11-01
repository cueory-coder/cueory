/**
 * Guest progress (D-69): one small, versioned record in the browser's local storage, kept on the student's device and
 * never sent to us. It holds only the onboarding answers (course and exam date) and, for each card deck, the "know it"
 * and "still learning" piles and the starred cards (CLAUDE.md rule 2). Accounts (ROADMAP Task 2) will import it.
 *
 * Pure functions on a plain object, so every rule is unit tested (tests/unit/progress.test.ts). Reading never throws:
 * anything unreadable is dropped, field by field, and blocked storage simply means nothing is remembered.
 *
 * The review scheduler (Task 8) reads progress through `readProgress` and `deckProgress` only.
 */
import type { KeyValueStorage } from './storage';

export const PROGRESS_STORAGE_KEY = 'cueory-progress';
export const PROGRESS_VERSION = 1;

/** Where stars were kept before D-69, one key per deck. Read once, moved into the progress record, then removed. */
export const legacyStarsKey = (deckId: string) => `cueory-stars-${deckId}`;

export const COURSES = [
  { id: 'fundamentals', label: 'fundamentals' },
  { id: 'med-surg-1', label: 'med-surg i' },
  { id: 'both', label: 'both' },
] as const;
export type CourseId = (typeof COURSES)[number]['id'];

export type Pile = 'know' | 'learning';

export interface DeckProgress {
  /** Card ids, sorted, each in at most one pile. */
  know: string[];
  learning: string[];
  starred: string[];
}

export interface Onboarding {
  course: CourseId | null;
  /** A calendar day, YYYY-MM-DD, or null. */
  examDate: string | null;
  /** True once the student saved or skipped the questions, so we don't ask again. */
  done: boolean;
}

export interface Progress {
  version: typeof PROGRESS_VERSION;
  onboarding: Onboarding;
  decks: Record<string, DeckProgress>;
}

const ID = /^[a-z0-9-]{1,64}$/;
const MAX_DECKS = 500;
const MAX_CARDS = 2000;

export function emptyProgress(): Progress {
  return { version: PROGRESS_VERSION, onboarding: { course: null, examDate: null, done: false }, decks: {} };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isCourse = (value: unknown): value is CourseId => COURSES.some((course) => course.id === value);

/** A real calendar day written YYYY-MM-DD, from 2000 to 2100. */
export function isExamDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  if (year < 2000 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function idList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && ID.test(id)))].sort().slice(0, MAX_CARDS);
}

function cleanDeck(value: unknown): DeckProgress {
  const deck = isRecord(value) ? value : {};
  const know = idList(deck.know);
  // A card in both piles counts as "still learning": the safer side for review.
  const learning = idList(deck.learning);
  return { know: know.filter((id) => !learning.includes(id)), learning, starred: idList(deck.starred) };
}

const isEmptyDeck = (deck: DeckProgress) => !deck.know.length && !deck.learning.length && !deck.starred.length;

/** The progress record from its stored text. Anything missing, unknown or invalid is dropped, never guessed. */
export function parseProgress(text: string | null | undefined): Progress {
  const progress = emptyProgress();
  if (!text) return progress;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return progress;
  }
  if (!isRecord(data) || data.version !== PROGRESS_VERSION) return progress;
  if (isRecord(data.onboarding)) {
    const { course, examDate, done } = data.onboarding;
    progress.onboarding = {
      course: isCourse(course) ? course : null,
      examDate: isExamDate(examDate) ? examDate : null,
      done: done === true,
    };
  }
  if (isRecord(data.decks)) {
    for (const [deckId, deck] of Object.entries(data.decks).slice(0, MAX_DECKS)) {
      if (!ID.test(deckId)) continue;
      const clean = cleanDeck(deck);
      if (!isEmptyDeck(clean)) progress.decks[deckId] = clean;
    }
  }
  return progress;
}

/** What this browser has saved. Missing or blocked storage gives an empty record. */
export function readProgress(storage: KeyValueStorage | undefined): Progress {
  try {
    return parseProgress(storage?.getItem(PROGRESS_STORAGE_KEY));
  } catch {
    return emptyProgress();
  }
}

/** Saves the record (removing it when there is nothing in it). False when the browser won't keep it. */
export function saveProgress(storage: KeyValueStorage | undefined, progress: Progress): boolean {
  if (!storage) return false;
  try {
    if (isEmptyProgress(progress)) storage.removeItem(PROGRESS_STORAGE_KEY);
    else storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function isEmptyProgress(progress: Progress): boolean {
  const { course, examDate, done } = progress.onboarding;
  return !course && !examDate && !done && Object.keys(progress.decks).length === 0;
}

/**
 * Removes everything this store keeps on the device, including stars saved before D-69 for the decks named. The theme
 * pick and the promo panel's date are not progress and stay. False when the browser refused.
 */
export function forgetProgress(storage: KeyValueStorage | undefined, deckIds: readonly string[]): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(PROGRESS_STORAGE_KEY);
    for (const deckId of deckIds) storage.removeItem(legacyStarsKey(deckId));
    return true;
  } catch {
    return false;
  }
}

/** One deck's piles and stars (empty lists when nothing is saved). */
export function deckProgress(progress: Progress, deckId: string): DeckProgress {
  const deck = progress.decks[deckId];
  return deck ? { know: [...deck.know], learning: [...deck.learning], starred: [...deck.starred] } : { know: [], learning: [], starred: [] };
}

function withDeck(progress: Progress, deckId: string, deck: DeckProgress): Progress {
  if (!ID.test(deckId)) return progress;
  const decks = { ...progress.decks };
  const clean = cleanDeck(deck);
  if (isEmptyDeck(clean)) delete decks[deckId];
  else decks[deckId] = clean;
  return { ...progress, decks };
}

export function pileOf(progress: Progress, deckId: string, cardId: string): Pile | null {
  const deck = progress.decks[deckId];
  if (deck?.know.includes(cardId)) return 'know';
  if (deck?.learning.includes(cardId)) return 'learning';
  return null;
}

/** Puts a card in a pile (null takes it out of both). The latest sort wins. */
export function withPile(progress: Progress, deckId: string, cardId: string, pile: Pile | null): Progress {
  const deck = deckProgress(progress, deckId);
  const know = deck.know.filter((id) => id !== cardId);
  const learning = deck.learning.filter((id) => id !== cardId);
  if (pile === 'know') know.push(cardId);
  if (pile === 'learning') learning.push(cardId);
  return withDeck(progress, deckId, { ...deck, know, learning });
}

export function withStars(progress: Progress, deckId: string, starred: Iterable<string>): Progress {
  return withDeck(progress, deckId, { ...deckProgress(progress, deckId), starred: [...starred] });
}

/** Saves the onboarding answers. Invalid values are stored as "not answered"; either way the questions count as done. */
export function withOnboarding(progress: Progress, answers: { course: unknown; examDate: unknown }): Progress {
  return {
    ...progress,
    onboarding: {
      course: isCourse(answers.course) ? answers.course : null,
      examDate: isExamDate(answers.examDate) ? answers.examDate : null,
      done: true,
    },
  };
}

/**
 * Stars for a deck, reading the record first and the pre-D-69 key as a fallback. Only ids still in the deck count.
 */
export function loadDeckStars(storage: KeyValueStorage | undefined, deckId: string, cardIds: readonly string[]): Set<string> {
  const known = new Set(cardIds);
  let starred = deckProgress(readProgress(storage), deckId).starred;
  if (starred.length === 0) {
    try {
      starred = idList(JSON.parse(storage?.getItem(legacyStarsKey(deckId)) ?? '[]'));
    } catch {
      starred = [];
    }
  }
  return new Set(starred.filter((id) => known.has(id)));
}

/** Saves a deck's stars in the record and removes the deck's pre-D-69 key, so it's in one place from now on. */
export function saveDeckStars(storage: KeyValueStorage | undefined, deckId: string, starred: Iterable<string>): boolean {
  const saved = saveProgress(storage, withStars(readProgress(storage), deckId, starred));
  if (saved) {
    try {
      storage?.removeItem(legacyStarsKey(deckId));
    } catch {
      // The old key stays; the record wins when both exist.
    }
  }
  return saved;
}

/** Records a "know it" or "still learning" sort and saves it. Returns the card's previous pile, for "Back". */
export function saveSort(storage: KeyValueStorage | undefined, deckId: string, cardId: string, pile: Pile | null): Pile | null {
  const progress = readProgress(storage);
  const previous = pileOf(progress, deckId, cardId);
  saveProgress(storage, withPile(progress, deckId, cardId, pile));
  return previous;
}

/** The file "download my progress" gives the student: readable JSON with a short note of what it is. */
export function exportProgress(progress: Progress, today: string): string {
  return `${JSON.stringify(
    {
      about: 'your cueory progress, saved in this browser only. nothing here was sent to cueory.',
      exportedOn: today,
      ...progress,
    },
    null,
    2,
  )}\n`;
}

/** Today's local calendar day as YYYY-MM-DD. */
export function localDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "may 12, 2027" for an exam date, in the lowercase voice (D-47). */
export function examDateWords(examDate: string): string {
  const [year, month, day] = examDate.split('-').map(Number) as [number, number, number];
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  return `${months[month - 1]} ${day}, ${year}`;
}
