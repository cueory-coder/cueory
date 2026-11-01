/**
 * Delete-my-account confirmation flow (Roadmap Task 4). Pure logic — no network, no page, no database.
 * The actual deletion is handled by the server; this module describes what will go and validates the
 * typed confirmation before the caller fires the request.
 */
import { legacyStarsKey, PROGRESS_STORAGE_KEY, type Progress } from '../scripts/progress';
import { PROMO_STORAGE_KEY } from '../scripts/promo';
import { THEME_STORAGE_KEY } from '../scripts/theme';
import type { KeyValueStorage } from '../scripts/storage';
import { STATS_STORAGE_KEY } from './gameresults';
import type { ExportData } from './exportdata';

// Keep the download and confirmation contracts together, including the actual saved Progress record.
export type { ExportData } from './exportdata';

function isGuestProgress(progress: ExportData['progress']): progress is Progress {
  return !!progress && !Array.isArray(progress);
}

function hasSetup(setup: ExportData['onboarding']): boolean {
  return !!(setup?.course || setup?.examDate || setup?.school || setup?.done);
}

// ── Deletion summary ──────────────────────────────────────────────────────────

/**
 * Returns one plain-lowercase line per section that has data.
 * Sections with no data are omitted so the student sees only what will actually be deleted.
 */
export function deletionSummary(data: ExportData): string[] {
  const lines: string[] = [];

  const profile = data.profile;
  if (profile?.displayName && profile.email) lines.push('your display name and email address');
  else if (profile?.email) lines.push('your email address');
  else if (profile?.displayName) lines.push('your display name');
  else if (profile?.createdAt) lines.push('your account details');

  const guest = isGuestProgress(data.progress) ? data.progress : undefined;
  if (hasSetup(data.onboarding) || hasSetup(guest?.onboarding)) lines.push('your study setup');

  // Stars can overlap a pile. Count each card once within its deck; the same local id in another deck is another card.
  const cards = guest
    ? Object.values(guest.decks).reduce((count, deck) => count + new Set([...deck.know, ...deck.learning, ...deck.starred]).size, 0)
    : Array.isArray(data.progress) ? data.progress.length : 0;
  if (cards > 0) {
    const n = cards;
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

  if (data.attempts?.length) lines.push(`${data.attempts.length} question attempt${data.attempts.length === 1 ? '' : 's'}`);
  if (data.examPlans?.length) lines.push(`${data.examPlans.length} exam date${data.examPlans.length === 1 ? '' : 's'}`);
  if (data.reviewRows?.length) lines.push(`${data.reviewRows.length} account review schedule${data.reviewRows.length === 1 ? '' : 's'}`);

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
 * Snapshot the keys to clear, including every legacy stars key, even for retired decks.
 * The caller supplies browser storage and removes these keys after the server confirms deletion.
 * This function reads key names only; it never changes storage. Unlistable storage is an error, not a complete list.
 */
export function afterDeletion(storage: KeyValueStorage | undefined): string[] {
  if (!storage || typeof storage.length !== 'number' || !Number.isSafeInteger(storage.length) || storage.length < 0 || typeof storage.key !== 'function') {
    throw new Error('browser storage must support listing its keys before cleanup.');
  }
  const keys = new Set([
    PROGRESS_STORAGE_KEY,
    PROMO_STORAGE_KEY,
    THEME_STORAGE_KEY,
    STATS_STORAGE_KEY,
  ]);
  const prefix = legacyStarsKey('');
  const length = storage.length;
  for (let index = 0; index < length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.add(key);
  }
  return [...keys];
}
