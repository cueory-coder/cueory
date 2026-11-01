/**
 * Converts guest progress (D-69) into rows ready to INSERT into the review_state table (D-87).
 * Pure logic; no network, DOM or clock access.
 *
 * Exam plans (onboarding.examDate) are deferred: the table needs a slug course, at most ten plans,
 * and a date within the allowed window; that wiring is a D-87 follow-up.
 */
import type { Progress } from '../scripts/progress';
import { nextReview } from './review';

/** One row a student may insert into review_state (D-87 migration: item_id, level, last_reviewed, next_review). */
export interface GuestImportRow {
  item_id: string;  // uuid resolved via idMap
  level: 0 | 1;
  last_reviewed: string;
  next_review: string;
}

export interface ImportResult {
  rows: GuestImportRow[];
  /** Item uuids the student had starred; the caller stores stars separately (no starred column in review_state). */
  starred: string[];
  /** Card ids in progress that had no uuid in idMap (the deck no longer has them). */
  skipped: string[];
}

function isValidDay(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(`${day}T00:00:00.000Z`);
  return d.toISOString().slice(0, 10) === day;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Non-throwing coercion: returns the string values of an array, dropping non-strings. */
function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string');
}

/**
 * Builds review_state rows from guest progress.
 *
 * - idMap maps each card slug to its database uuid; unmapped ids land in `skipped`.
 * - "Know it" cards: level 1, `last_reviewed = today`, `next_review` from `nextReview` after one 'knew'.
 * - "Still learning" and starred-only cards: level 0, due today (`nextReview` after a 'missed' yesterday).
 * - Stars are returned separately in `starred`; the caller stores them apart from review_state.
 * - `today` must be a real YYYY-MM-DD calendar day; throws on an invalid value.
 * - If the same uuid appears in more than one deck, the higher level wins.
 */
export function importRows(
  progress: Progress,
  idMap: ReadonlyMap<string, string>,
  today: string,
): ImportResult {
  if (!isValidDay(today)) throw new Error(`importRows: invalid today "${today}"`);

  const yesterday = addDays(today, -1);

  // Compute review dates via the public scheduler so we stay in sync with its interval constants.
  const knowNext = nextReview([{ day: today, result: 'knew' }])!;         // today + STEPS[1]
  const learnNext = nextReview([{ day: yesterday, result: 'missed' }])!;  // yesterday + STEPS[0] = today

  const rowsByUuid = new Map<string, GuestImportRow>();
  const starredSet = new Set<string>();
  const skippedSet = new Set<string>();

  function upsertRow(cardId: string, level: 0 | 1, isStarred: boolean): void {
    const uuid = idMap.get(cardId);
    if (uuid === undefined) { skippedSet.add(cardId); return; }
    const existing = rowsByUuid.get(uuid);
    if (existing) {
      if (level > existing.level) {
        existing.level = level;
        existing.last_reviewed = today;
        existing.next_review = knowNext;
      }
    } else {
      rowsByUuid.set(uuid, {
        item_id: uuid,
        level,
        last_reviewed: level === 1 ? today : yesterday,
        next_review: level === 1 ? knowNext : learnNext,
      });
    }
    if (isStarred) starredSet.add(uuid);
  }

  for (const deck of Object.values(progress.decks)) {
    const know = safeStringArray(deck.know);
    const learning = safeStringArray(deck.learning);
    const starSet = new Set(safeStringArray(deck.starred));

    for (const id of know) upsertRow(id, 1, starSet.has(id));
    for (const id of learning) upsertRow(id, 0, starSet.has(id));
    for (const id of starSet) {
      if (!know.includes(id) && !learning.includes(id)) upsertRow(id, 0, true);
    }
  }

  return {
    rows: [...rowsByUuid.values()],
    starred: [...starredSet],
    skipped: [...skippedSet],
  };
}
