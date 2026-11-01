/**
 * Converts guest progress (D-69) into rows ready to INSERT into the review_state table (D-87).
 * Pure logic; no network, DOM or clock access.
 */
import type { Progress } from '../scripts/progress';

/** One row a student may insert into review_state (D-87 migration: item_id, level, last_reviewed, next_review). */
export interface GuestImportRow {
  item_id: string;
  /** 1 for a known card (first known interval), 0 for a learning or starred card (due today). */
  level: 0 | 1;
  last_reviewed: string;
  next_review: string;
  /** True when the card was starred in guest progress; the caller stores this separately. */
  starred: boolean;
}

export interface ImportResult {
  rows: GuestImportRow[];
  /** Card ids in progress that are not in knownIds; the deck no longer has them. */
  skipped: string[];
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Builds review_state rows from guest progress.
 * - "Know it" cards: level 1, last_reviewed = today, next_review = today + 3 (STEPS[1], the first known interval).
 * - "Still learning" and starred-only cards: level 0, last_reviewed = today − 1, next_review = today (due today).
 * - Stars carry over as a flag in the row; the caller handles them separately (no starred column in review_state).
 * - Cards not in knownIds are placed in skipped.
 */
export function importRows(
  progress: Progress,
  knownIds: ReadonlySet<string>,
  today: string,
): ImportResult {
  const yesterday = addDays(today, -1);
  const nextKnown = addDays(today, 3); // review.ts STEPS[1] = 3 — the first "knew" interval

  const rows: GuestImportRow[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const deck of Object.values(progress.decks)) {
    const starSet = new Set(deck.starred);

    for (const id of deck.know) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (!knownIds.has(id)) { skipped.push(id); continue; }
      rows.push({ item_id: id, level: 1, last_reviewed: today, next_review: nextKnown, starred: starSet.has(id) });
    }

    for (const id of deck.learning) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (!knownIds.has(id)) { skipped.push(id); continue; }
      rows.push({ item_id: id, level: 0, last_reviewed: yesterday, next_review: today, starred: starSet.has(id) });
    }

    // Starred cards in neither pile carry over as level-0 entries due today.
    for (const id of deck.starred) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (!knownIds.has(id)) { skipped.push(id); continue; }
      rows.push({ item_id: id, level: 0, last_reviewed: yesterday, next_review: today, starred: true });
    }
  }

  return { rows, skipped };
}
