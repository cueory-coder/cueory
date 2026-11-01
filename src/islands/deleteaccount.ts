/**
 * Delete-my-account confirmation flow (Roadmap Task 4). Pure logic — no network, no page, no database.
 * The actual deletion is handled by the server; this module describes what will go and validates the
 * typed confirmation before the caller fires the request.
 */
import { PROGRESS_STORAGE_KEY } from '../scripts/progress';
import { PROMO_STORAGE_KEY } from '../scripts/promo';
import { THEME_STORAGE_KEY } from '../scripts/theme';
import { STATS_STORAGE_KEY } from './gameresults';
import type { GameStats } from './gamestats';

// ── Data shape (matches Task 19 ExportData from src/islands/exportdata.ts) ────

export interface ExportData {
  profile?: { displayName?: string | null; createdAt?: string | null };
  onboarding?: { course?: string | null; examDate?: string | null; done?: boolean; school?: string | null };
  progress?: readonly { id: string; result: string | boolean; date: string }[];
  reviewState?: readonly { id: string; nextDueDate: string; interval: number }[];
  gameStats?: GameStats;
}

// ── Deletion summary ──────────────────────────────────────────────────────────

/**
 * Returns one plain-lowercase line per section that has data.
 * Sections with no data are omitted so the student sees only what will actually be deleted.
 */
export function deletionSummary(data: ExportData): string[] {
  const lines: string[] = [];

  if (data.profile?.displayName) {
    lines.push('your display name');
  }

  if (data.onboarding) {
    const { course, examDate, done, school } = data.onboarding;
    if (course != null || examDate != null || done != null || school != null) {
      lines.push('your study setup');
    }
  }

  if (Array.isArray(data.progress) && data.progress.length > 0) {
    const n = data.progress.length;
    lines.push(`${n} card${n === 1 ? "'s" : "s'"} progress`);
  }

  if (Array.isArray(data.reviewState) && data.reviewState.length > 0) {
    const n = data.reviewState.length;
    lines.push(`${n} review schedule${n === 1 ? '' : 's'}`);
  }

  if (Array.isArray(data.gameStats) && data.gameStats.length > 0) {
    const n = data.gameStats.length;
    lines.push(`${n} game result${n === 1 ? '' : 's'}`);
  }

  return lines;
}

// ── Confirmation gate ─────────────────────────────────────────────────────────

/**
 * Ready only when the student has typed exactly `delete` (trimmed, any case).
 * Returns `null` when ready; a plain reason string when not.
 */
export function confirmState(typed: string): string | null {
  const trimmed = typed.trim();
  if (trimmed === '') return 'type delete to confirm';
  if (trimmed.toLowerCase() !== 'delete') return 'type the word delete to confirm';
  return null;
}

// ── Browser-storage keys to clear ────────────────────────────────────────────

/**
 * The browser-storage keys this app writes. Read from their canonical exports — never retyped.
 * The delete flow clears all of these after the server confirms deletion.
 */
export function afterDeletion(): string[] {
  return [
    PROGRESS_STORAGE_KEY,
    PROMO_STORAGE_KEY,
    THEME_STORAGE_KEY,
    STATS_STORAGE_KEY,
  ];
}
