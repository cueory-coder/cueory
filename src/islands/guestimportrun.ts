/**
 * Brings this browser's guest card progress into one signed-in account.
 *
 * No Supabase dependency: the account page injects a database adapter.
 * The marker is per account and is written only after a confirmed insert.
 * Guest data is left on this device so a failed import is recoverable.
 */
import { importRows, type GuestImportRow, type IdMap } from './guestimport';
import { isEmptyProgress, localDay, readProgress } from '../scripts/progress';
import type { KeyValueStorage } from '../scripts/storage';

export const GUEST_IMPORT_MARKER_PREFIX = 'cueory-guest-imported:';

export interface GuestImportDb {
  /** A confirmed insert returns { error: null }; any error or unexpected response fails closed. */
  insert(table: 'review_state', rows: GuestImportRow[]): Promise<{ error: unknown | null }>;
}

export interface GuestImportOptions {
  storage: KeyValueStorage | undefined;
  db: GuestImportDb;
  /** The authenticated account's ID. Never taken from a form field. */
  userId: string;
  /** Maps deck-local card IDs to the published database item UUIDs. */
  idMap: IdMap;
}

export interface GuestImportOutcome {
  imported: number;
  skipped: number;
  message: string;
}

/**
 * A marker avoids repeating an acknowledged import for the same account in this browser.
 * The database's (user_id, item_id) primary key remains the cross-tab duplicate safeguard.
 */
export async function runGuestImport({
  storage,
  db,
  userId,
  idMap,
}: GuestImportOptions): Promise<GuestImportOutcome> {
  if (typeof userId !== 'string' || !userId.trim()) {
    return { imported: 0, skipped: 0, message: 'sign in before importing saved cards.' };
  }

  const progress = readProgress(storage);
  if (isEmptyProgress(progress)) {
    return { imported: 0, skipped: 0, message: 'no guest progress is saved on this device.' };
  }

  const marker = `${GUEST_IMPORT_MARKER_PREFIX}${userId}`;
  try {
    if (storage?.getItem(marker) !== null) {
      return { imported: 0, skipped: 0, message: 'saved cards were already imported for this account.' };
    }
  } catch {
    // Importing without being able to read the marker could duplicate an earlier import.
    return { imported: 0, skipped: 0, message: 'this browser cannot check whether cards were imported.' };
  }

  let prepared: ReturnType<typeof importRows>;
  try {
    prepared = importRows(progress, idMap, localDay(new Date()));
  } catch {
    return { imported: 0, skipped: 0, message: 'saved cards could not be prepared for import.' };
  }

  const skipped = prepared.skipped.length;
  if (!prepared.rows.length) {
    return {
      imported: 0,
      skipped,
      message: skipped
        ? 'none of the saved cards could be matched yet. they remain on this device.'
        : 'there are no saved cards to import yet. setup answers remain on this device.',
    };
  }

  let inserted: { error: unknown | null };
  try {
    inserted = await db.insert('review_state', prepared.rows);
  } catch {
    return { imported: 0, skipped, message: 'saved cards were not imported. please try again.' };
  }
  if (!inserted || inserted.error !== null) {
    return { imported: 0, skipped, message: 'saved cards were not imported. please try again.' };
  }

  const imported = prepared.rows.length;
  try {
    storage?.setItem(marker, '1');
  } catch {
    // The database write succeeded, but a retry may encounter its unique-key protection.
    return {
      imported,
      skipped,
      message: `${imported} saved ${imported === 1 ? 'card was' : 'cards were'} imported, but this browser could not remember the import.`,
    };
  }

  return {
    imported,
    skipped,
    message: `${imported} saved ${imported === 1 ? 'card was' : 'cards were'} imported.${skipped ? ` ${skipped} could not be matched.` : ''}`,
  };
}
