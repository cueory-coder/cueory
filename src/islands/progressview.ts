/** Pure, truthful card counts for the progress dashboard. No module or question completion is recorded. */
import { deckProgress, emptyProgress, isCourse, isEmptyProgress, isExamDate, legacyStarsKey, migrateLegacyStars, PROGRESS_STORAGE_KEY, PROGRESS_VERSION, parseProgress, withStars, type Progress } from '../scripts/progress';
import { readResume } from '../scripts/resume';
import type { KeyValueStorage } from '../scripts/storage';

export interface DeckDefinition {
  id: string;
  title: string;
  /** Null only for saved decks removed from the catalog: their total is not known. */
  cardIds: readonly string[] | null;
}

export interface DeckCounts {
  id: string;
  title: string;
  know: number;
  learning: number;
  notStarted: number | null;
  starred: number;
  total: number | null;
  retired: boolean;
}

export interface ProgressView {
  decks: DeckCounts[];
  /** Only active decks have a known denominator. */
  overall: { know: number; learning: number; notStarted: number; total: number };
  hasSavedDecks: boolean;
}


/** Device-only progress states: unreadable saved work must not be mistaken for an empty record. */
export type ProgressScreenState = 'empty' | 'ready' | 'unreadable';

export interface ProgressStateInput {
  progress: Progress;
  /** Captured before legacy-star migration, so invalid records cannot be overwritten. */
  raw: string | null;
  hasResume: boolean;
  canReadStorage: boolean;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Check everything the canonical parser might silently discard before migrating old stars. */
const savedId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value);
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

function readableRecord(raw: string | null): boolean {
  if (raw === null) return true;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!record(value) || value.version !== PROGRESS_VERSION ||
    !onlyKeys(value, ['version', 'onboarding', 'decks'])) return false;
  if (value.onboarding !== undefined) {
    if (!record(value.onboarding) ||
      !onlyKeys(value.onboarding, ['course', 'examDate', 'done'])) return false;
    const { course, examDate, done } = value.onboarding;
    if (course !== undefined && course !== null && !isCourse(course)) return false;
    if (examDate !== undefined && examDate !== null && !isExamDate(examDate)) return false;
    if (done !== undefined && typeof done !== 'boolean') return false;
  }
  if (value.decks !== undefined) {
    if (!record(value.decks) || Object.keys(value.decks).length > 500) return false;
    for (const [deckId, deck] of Object.entries(value.decks)) {
      if (!savedId(deckId) || !record(deck) ||
        !onlyKeys(deck, ['know', 'learning', 'starred'])) return false;
      for (const field of ['know', 'learning', 'starred']) {
        const ids = deck[field];
        if (ids === undefined) continue;
        if (!Array.isArray(ids) || ids.length > 2000) return false;
        // Use the canonical sanitizer's ID rules and limits, without writing its result.
        const accepted = new Set(withStars(emptyProgress(), 'validation', ids).decks.validation?.starred ?? []);
        if (ids.some((id) => typeof id !== 'string' || !accepted.has(id))) return false;
      }
    }
  }
  return true;
}

/**
 * The legacy migration removes every old key, including invalid ones.
 * Refuse the write path unless every listed key can be read and migrated safely.
 * An unreadable state keeps both original records and the Forget control hidden.
 */
function readableLegacyStars(storage: KeyValueStorage): boolean {
  try {
    const length = storage.length;
    if (typeof length !== 'number' || !Number.isSafeInteger(length) ||
      length < 0 || typeof storage.key !== 'function') return false;
    const prefix = legacyStarsKey('');
    for (let index = 0; index < length; index++) {
      const key = storage.key(index);
      if (key === null) return false;
      if (!key.startsWith(prefix)) continue;
      const deckId = key.slice(prefix.length);
      if (!savedId(deckId)) return false;
      const raw = storage.getItem(key);
      if (raw === null) return false;
      let stars: unknown;
      try {
        stars = JSON.parse(raw);
      } catch {
        return false;
      }
      if (!Array.isArray(stars) || stars.length > 2000 ||
        !stars.every(savedId)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Pure decision for new, ready, resume-only, old-plus-new, or unreadable data. */
export function progressScreenState({ progress, raw, hasResume, canReadStorage }: ProgressStateInput): ProgressScreenState {
  if (!canReadStorage || !readableRecord(raw)) return 'unreadable';
  return isEmptyProgress(progress) && !hasResume ? 'empty' : 'ready';
}

/** A recovered view never writes over the original malformed record automatically. */
export interface DeviceProgressSnapshot {
  progress: Progress;
  state: ProgressScreenState;
  recovered?: true;
}

/** Run the canonical legacy merge on a private copy, never on the student's storage. */
function recoveredCopy(storage: KeyValueStorage, raw: string | null): Progress {
  const values = new Map<string, string>();
  if (raw !== null) values.set(PROGRESS_STORAGE_KEY, raw);
  const sourceStars: [string, readonly string[]][] = Object.entries(parseProgress(raw).decks)
    .map(([id, deck]) => [id, deck.starred]);
  const prefix = legacyStarsKey('');
  const length = storage.length ?? 0;
  for (let index = 0; index < length; index++) {
    const key = storage.key?.(index);
    if (!key?.startsWith(prefix)) continue;
    const value = storage.getItem(key);
    if (value !== null) {
      values.set(key, value);
      sourceStars.push([key.slice(prefix.length), JSON.parse(value)]);
    }
  }
  const merged = migrateLegacyStars({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
  });
  // Individually valid sources can exceed the combined star/deck limits. Check the
  // private result before allowing real writes, preserving stars from BOTH sources.
  for (const [id, stars] of sourceStars) {
    const combined = new Set(merged.decks[id]?.starred ?? []);
    if (!stars.every((star) => combined.has(star))) throw new Error('saved stars exceed export limits');
  }
  const serialized = JSON.stringify(merged);
  if (JSON.stringify(parseProgress(serialized)) !== serialized) {
    throw new Error('saved progress exceeds export limits');
  }
  return merged;
}

/** Check the stored record before any legacy migration or other storage writes. */
export function readDeviceProgress(storage: KeyValueStorage | undefined): DeviceProgressSnapshot {
  const unreadable = { progress: emptyProgress(), state: 'unreadable' as const };
  if (!storage) return unreadable;
  try {
    const raw = storage.getItem(PROGRESS_STORAGE_KEY);
    // A malformed old-star key cannot safely be included in a recovery download.
    // Do not migrate or offer a partial backup that could be followed by Forget.
    if (!readableLegacyStars(storage)) return unreadable;
    const merged = recoveredCopy(storage, raw);
    if (!readableRecord(raw)) {
      // The canonical parser may still recover valid piles from a partly damaged record.
      // Display those fields read-only, preserving the original bytes and legacy star keys.
      const recovered = parseProgress(raw);
      return isEmptyProgress(recovered)
        ? unreadable
        : { progress: merged, state: 'ready', recovered: true };
    }
    const progress = migrateLegacyStars(storage);
    return {
      progress,
      state: progressScreenState({ raw, progress, hasResume: readResume(storage) !== null, canReadStorage: true }),
    };
  } catch {
    return unreadable;
  }
}

function countDeck(progress: Progress, deck: DeckDefinition): DeckCounts {
  const saved = deckProgress(progress, deck.id);
  const known = deck.cardIds === null ? null : new Set(deck.cardIds);
  const inDeck = (id: string) => known === null || known.has(id);
  // A card in both piles counts as still learning, just as parseProgress does.
  const learningIds = new Set(saved.learning.filter(inDeck));
  const knowIds = new Set(saved.know.filter((id) => inDeck(id) && !learningIds.has(id)));
  const starredIds = new Set(saved.starred.filter(inDeck));
  const total = known === null ? null : known.size;
  return {
    id: deck.id,
    title: deck.title,
    know: knowIds.size,
    learning: learningIds.size,
    notStarted: total === null ? null : Math.max(0, total - knowIds.size - learningIds.size),
    starred: starredIds.size,
    total,
    retired: known === null,
  };
}

export function progressView(progress: Progress, available: readonly DeckDefinition[]): ProgressView {
  const currentIds = new Set(available.map((deck) => deck.id));
  const current = available.map((deck) => countDeck(progress, deck));
  // Keep saved retired decks visible, without inventing how many cards they used to contain.
  const retired = Object.keys(progress.decks)
    .filter((id) => !currentIds.has(id))
    .map((id) => countDeck(progress, { id, title: 'a deck no longer on the site (' + id + ')', cardIds: null }));
  const overall = current.reduce(
    (acc, deck) => ({
      know: acc.know + deck.know,
      learning: acc.learning + deck.learning,
      notStarted: acc.notStarted + (deck.notStarted ?? 0),
      total: acc.total + (deck.total ?? 0),
    }),
    { know: 0, learning: 0, notStarted: 0, total: 0 },
  );
  const decks = [...current, ...retired];
  return {
    decks,
    overall,
    hasSavedDecks: decks.some((deck) => deck.know > 0 || deck.learning > 0 || deck.starred > 0),
  };
}

/** Calendar-day difference, not a prediction. UTC dates avoid daylight-saving errors. */
export function examCountdown(examDate: string | null, today: string): string | null {
  if (examDate === null || !isExamDate(examDate) || !isExamDate(today)) return null;
  const utcDay = (date: string) => {
    const [year, month, day] = date.split('-').map(Number) as [number, number, number];
    return Date.UTC(year, month - 1, day);
  };
  const days = Math.round((utcDay(examDate) - utcDay(today)) / 86_400_000);
  if (days === 0) return 'your exam is today.';
  if (days > 0) return days + (days === 1 ? ' day until your exam.' : ' days until your exam.');
  const elapsed = -days;
  return 'that exam date was ' + elapsed + (elapsed === 1 ? ' day ago.' : ' days ago.');
}
