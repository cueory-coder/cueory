/** Pure, truthful card counts for the progress dashboard. No module or question completion is recorded. */
import { deckProgress, emptyProgress, isEmptyProgress, isExamDate, migrateLegacyStars, PROGRESS_STORAGE_KEY, PROGRESS_VERSION, type Progress } from '../scripts/progress';
import { readResume } from '../scripts/resume';
import type { KeyValueStorage } from '../scripts/storage';
import type { Catalog } from '../lessons/catalog';

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

/** Check the stored structure; the storage parser still owns repairing individual values. */
function readableRecord(raw: string | null): boolean {
  if (raw === null) return true;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!record(value) || value.version !== PROGRESS_VERSION) return false;
  if (value.onboarding !== undefined && !record(value.onboarding)) return false;
  if (value.decks !== undefined) {
    if (!record(value.decks)) return false;
    for (const deck of Object.values(value.decks)) {
      if (!record(deck)) return false;
      for (const field of ['know', 'learning', 'starred']) {
        if (deck[field] !== undefined && !Array.isArray(deck[field])) return false;
      }
    }
  }
  return true;
}

/** Pure decision for new, ready, resume-only, old-plus-new, or unreadable data. */
export function progressScreenState({ progress, raw, hasResume, canReadStorage }: ProgressStateInput): ProgressScreenState {
  if (!canReadStorage || !readableRecord(raw)) return 'unreadable';
  return isEmptyProgress(progress) && !hasResume ? 'empty' : 'ready';
}

/** Check readability before migrating old stars, so a corrupt record is never silently replaced. */
export function readDeviceProgress(storage: KeyValueStorage | undefined): { progress: Progress; state: ProgressScreenState } {
  const unreadable = { progress: emptyProgress(), state: 'unreadable' as const };
  if (!storage) return unreadable;
  try {
    const raw = storage.getItem(PROGRESS_STORAGE_KEY);
    if (progressScreenState({ raw, progress: emptyProgress(), hasResume: false, canReadStorage: true }) === 'unreadable') {
      return unreadable;
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

/**
 * Data allowed into the progress island's page props. A catalog lesson exists only when its lesson is visible;
 * its cards companion exists only when that companion is also visible. Hidden content is never serialized.
 */
export function visibleProgressDecks(
  catalog: Pick<Catalog, 'lessons'>,
  allCards: readonly { id: string; data: { title: string; cards: readonly { id: string }[] } }[],
): DeckDefinition[] {
  const cardsById = new Map(allCards.map((deck) => [deck.id, deck]));
  return catalog.lessons.flatMap((lesson) => {
    const deck = lesson.cards ? cardsById.get(lesson.cards.id) : undefined;
    return deck ? [{
      id: deck.id,
      title: deck.data.title,
      cardIds: deck.data.cards.map((card) => card.id),
    }] : [];
  }).sort((a, b) => a.id.localeCompare(b.id));
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
