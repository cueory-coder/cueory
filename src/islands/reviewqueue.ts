/**
 * Converts the student's review_state rows (D-87) into the list of items due today,
 * ready to pass to the review session (D-83). Pure logic; no network, DOM or clock access.
 */
import type { Review } from './review';

export interface ReviewStateRow {
  item_id: string;
  level: 0 | 1 | 2 | 3;
  last_reviewed: string;
  next_review: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDay(day: unknown): day is string {
  if (typeof day !== 'string' || !DAY_RE.test(day)) return false;
  const d = new Date(`${day}T00:00:00.000Z`);
  return d.toISOString().slice(0, 10) === day;
}

function validateRow(row: ReviewStateRow, index: number): void {
  if (!row || typeof row !== 'object') throw new Error(`Row ${index}: must be an object.`);
  if (typeof row.item_id !== 'string' || !row.item_id) throw new Error(`Row ${index}: item_id must be a nonempty string.`);
  if (row.level !== 0 && row.level !== 1 && row.level !== 2 && row.level !== 3) {
    throw new Error(`Row ${index}: level must be 0, 1, 2 or 3.`);
  }
  if (!isValidDay(row.last_reviewed)) throw new Error(`Row ${index}: last_reviewed must be a real calendar day YYYY-MM-DD.`);
  if (!isValidDay(row.next_review)) throw new Error(`Row ${index}: next_review must be a real calendar day YYYY-MM-DD.`);
  if (row.next_review <= row.last_reviewed) throw new Error(`Row ${index}: next_review must be after last_reviewed.`);
}

/**
 * Returns item_ids whose next_review is on or before today, sorted by next_review ascending then item_id.
 * The database has already computed next_review, so this is a direct comparison — no history needed.
 */
export function dueItems(rows: readonly ReviewStateRow[], today: string): string[] {
  if (!Array.isArray(rows)) throw new Error('Rows must be an array.');
  if (!isValidDay(today)) throw new Error(`today must be a real calendar day YYYY-MM-DD, got "${today}".`);

  const seen = new Set<string>();
  const due: { item_id: string; next_review: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    validateRow(row, i);
    if (seen.has(row.item_id)) throw new Error(`Duplicate item_id at row ${i}: "${row.item_id}".`);
    seen.add(row.item_id);
    if (row.next_review <= today) {
      due.push({ item_id: row.item_id, next_review: row.next_review });
    }
  }

  return due
    .sort((a, b) => a.next_review < b.next_review ? -1 : a.next_review > b.next_review ? 1 : a.item_id < b.item_id ? -1 : 1)
    .map((d) => d.item_id);
}

/**
 * Builds a minimal Review history from a row so reviewsession.ts can use it.
 * Produces a history of `level` consecutive 'knew' results (or one 'missed' for level 0),
 * all on last_reviewed. Note: if the stored next_review was shortened by an exam plan,
 * nextReview(syntheticHistory(row)) will return the unshortened interval — use the stored
 * next_review from the row when you need the exact scheduled date.
 */
export function syntheticHistory(row: ReviewStateRow): Review[] {
  validateRow(row, 0);
  if (row.level === 0) return [{ day: row.last_reviewed, result: 'missed' }];
  return Array.from({ length: row.level }, () => ({ day: row.last_reviewed, result: 'knew' as const }));
}
