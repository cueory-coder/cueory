/**
 * Delete-my-account confirmation flow (Roadmap Task 4). Pure logic — no network, no page, no database.
 * The actual deletion is handled by the server; this module describes what will go and validates the
 * typed confirmation before the caller fires the request.
 */
import { BREAK_STORAGE_KEY } from '../scripts/breakstore';
import { NOTE_SOUND_STORAGE_KEY } from '../scripts/notesound';
import { legacyStarsKey, PROGRESS_STORAGE_KEY, type Progress } from '../scripts/progress';
import { PROMO_STORAGE_KEY } from '../scripts/promo';
import { THEME_STORAGE_KEY } from '../scripts/theme';
import type { KeyValueStorage } from '../scripts/storage';
import { STATS_STORAGE_KEY } from './gameresults';
import { GUEST_IMPORT_MARKER_PREFIX } from './guestimportrun';
import { LAST_WELCOME_STORAGE_KEY, VISIT_STORAGE_KEY } from './stickynote';
import { RESUME_STORAGE_KEY } from '../scripts/resume';
import type { ExportData } from './exportdata';
import { isPkceVerifierKey, PKCE_FLOW_LIST_STORAGE_KEY, PKCE_VERIFIER_STORAGE_KEY } from './supabaseclient';
import { DELETE_REAUTH, DELETE_REAUTH_CODE, DELETE_SIGNED_OUT, studentMessage } from './rpcerrors';

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
  if (data.reports?.length) lines.push(`${data.reports.length} report${data.reports.length === 1 ? '' : 's'}`);
  // loadExport supplies the history as pages, which know their count; a short list can also be passed as rows.
  const events = data.studyEvents;
  const eventCount = events === undefined ? 0 : 'count' in events ? events.count : events.length;
  if (eventCount) lines.push(`${eventCount} study history entr${eventCount === 1 ? 'y' : 'ies'}`);

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

/** Iterable localStorage key names with separate keys for this tab's sessionStorage. */
export type DeletionStorageKeys = string[] & { readonly sessionKeys: readonly string[] };

/**
 * Plan cleanup only after the server confirms account deletion. This reads key names, never removes data.
 * Include every legacy stars key, even for retired decks, all account-specific guest-import markers, and every PKCE
 * sign-in verifier key (sign-out removes those too, but one left by an abandoned sign-in should not outlive the account).
 * The caller signs out and removes the auth key separately. Unlistable localStorage is an error.
 * The offline copies (Cache Storage, `cueory-offline-*`) stay: they hold only public pages and site files.
 */
export function afterDeletion(storage: KeyValueStorage | undefined): DeletionStorageKeys {
  if (!storage || typeof storage.length !== 'number' || !Number.isSafeInteger(storage.length) || storage.length < 0 || typeof storage.key !== 'function') {
    throw new Error('browser storage must support listing its keys before cleanup.');
  }
  const keys = new Set([
    PROGRESS_STORAGE_KEY,
    PROMO_STORAGE_KEY,
    THEME_STORAGE_KEY,
    STATS_STORAGE_KEY,
    RESUME_STORAGE_KEY,
    LAST_WELCOME_STORAGE_KEY,
    NOTE_SOUND_STORAGE_KEY,
    PKCE_VERIFIER_STORAGE_KEY,
    PKCE_FLOW_LIST_STORAGE_KEY,
  ]);
  const prefix = legacyStarsKey('');
  const length = storage.length;
  for (let index = 0; index < length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(prefix) || key?.startsWith(GUEST_IMPORT_MARKER_PREFIX) || (key && isPkceVerifierKey(key))) {
      keys.add(key);
    }
  }
  return Object.assign([...keys], { sessionKeys: [VISIT_STORAGE_KEY, BREAK_STORAGE_KEY] });
}

// ── A recent sign-in before deleting (Task 302) ──────────────────────────────

/**
 * delete_my_account refuses a token issued more than 10 minutes ago (iat), so a copied or shared-device token can't
 * delete the account (supabase/migrations/20261102160000_fresh_sign_in_and_name_rules.sql). The page checks first, so a
 * student with an older sign-in goes straight to sign-in instead of seeing a refusal, and then comes back here.
 */
export const DELETE_MAX_SIGN_IN_AGE_SECONDS = 600;
/** Where sign-in sends the student back to: the account page, at the delete step. */
export const DELETE_RETURN_PATH = '/account#delete';

/** The sign-in page, set to return to the delete step. `/signin` keeps `next` through safeNext (signin.ts). */
export function reauthHref(returnTo: string = DELETE_RETURN_PATH): string {
  return `/signin?next=${encodeURIComponent(returnTo)}`;
}

/**
 * The access token's `iat` (when it was issued, in seconds), read from its payload. For the page's own check only:
 * the database checks the signed token itself. Anything that isn't a well-formed token gives undefined.
 */
export function tokenIssuedAt(accessToken: unknown): number | undefined {
  if (typeof accessToken !== 'string' || accessToken.length > 16_384) return undefined;
  const parts = accessToken.split('.');
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1]!)) return undefined;
  try {
    const base64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const payload: unknown = JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')));
    if (typeof payload !== 'object' || payload === null) return undefined;
    const iat = (payload as { iat?: unknown }).iat;
    return typeof iat === 'number' && Number.isFinite(iat) && iat > 0 ? iat : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True when the token is recent enough to delete with. It keeps a margin (a minute by default) below the database's
 * 10 minutes, so a student who taps delete just before the limit isn't refused halfway through.
 */
export function freshForDeletion(accessToken: unknown, nowMs: number, marginSeconds = 60): boolean {
  const iat = tokenIssuedAt(accessToken);
  if (iat === undefined || !Number.isFinite(nowMs)) return false;
  return nowMs / 1000 - iat <= DELETE_MAX_SIGN_IN_AGE_SECONDS - marginSeconds;
}

export type DeleteOutcome =
  | { kind: 'deleted' }
  /** Signed in too long ago, or signed out: send the student to `href` (sign-in, then back to the delete step). */
  | { kind: 'sign-in'; href: string; message: string }
  | { kind: 'failed'; message: string };

/** What the page does after calling delete_my_account, from the call's error (null or undefined: it worked). */
export function deleteOutcome(error: unknown): DeleteOutcome {
  if (error === null || error === undefined) return { kind: 'deleted' };
  const { code, message } = typeof error === 'object' ? error as { code?: unknown; message?: unknown } : {};
  if (message === DELETE_REAUTH || code === DELETE_REAUTH_CODE || message === DELETE_SIGNED_OUT) {
    return { kind: 'sign-in', href: reauthHref(), message: studentMessage('delete_my_account', error) };
  }
  return { kind: 'failed', message: studentMessage('delete_my_account', error) };
}

