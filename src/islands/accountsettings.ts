/**
 * The /account page's logic (Task 59): display name, download my data, delete my account and sign out.
 * No page, no DOM except the download helper, and no client of its own: the island passes in adapters, so tests use
 * fakes. Every permission check happens on the server; row-level security limits each read and write to the
 * signed-in student's own rows.
 *
 * Reuses checkDisplayName (displayname.ts), loadExport/fromSupabase (exportload.ts), exportJsonBlob/exportCsvBlobs
 * (exportdata.ts) and deletionSummary/confirmState/afterDeletion (deleteaccount.ts).
 */
import { afterDeletion, confirmState, deletionSummary } from './deleteaccount';
import { checkDisplayName } from './displayname';
import { exportCsvBlobs, exportJsonBlob, type ExportData } from './exportdata';
import { fromSupabase, loadExport, type ExportReader, type SupabaseExportClient } from './exportload';
import { loadStats } from './gameresults';
import { studentMessage } from './rpcerrors';
import { AUTH_STORAGE_KEY, sessionStateFrom, type SessionReader, type SessionState } from './supabaseclient';
import { migrateLegacyStars } from '../scripts/progress';
import type { KeyValueStorage } from '../scripts/storage';

// ── Messages ──────────────────────────────────────────────────────────────────

export type AccountMessage =
  | 'name-saved' | 'name-failed'
  | 'export-downloading' | 'export-csv-downloading' | 'export-failed'
  | 'summary-failed'
  | 'delete-unavailable' | 'delete-failed' | 'deleted' | 'deleted-not-cleared'
  | 'signout-failed' | 'load-failed';

/** Every outcome on the page, as one plain sentence in the lowercase voice (D-47). */
export function accountMessage(kind: AccountMessage): string {
  const messages: Record<AccountMessage, string> = {
    'name-saved': 'your display name is saved.',
    'name-failed': "we couldn't save your display name. please try again.",
    'export-downloading': 'your data file is downloading.',
    'export-csv-downloading': 'your spreadsheet files are downloading.',
    'export-failed': "we couldn't load all your saved data. please try again.",
    'summary-failed': "we couldn't list what's saved, but deleting your account removes all of it.",
    'delete-unavailable': 'account deletion opens soon.',
    'delete-failed': "we couldn't delete your account. please try again.",
    deleted: 'your account is deleted, and this device no longer keeps your cueory data.',
    'deleted-not-cleared': "your account is deleted, but this browser didn't let cueory clear what it saved, so clear this site's data in your browser settings.",
    'signout-failed': 'sign out did not work. please try again.',
    'load-failed': 'your account could not load. please try again.',
  };
  return messages[kind];
}

// ── Adapters ──────────────────────────────────────────────────────────────────

interface Reply { data: unknown; error: unknown }

/**
 * The few parts of the Supabase client this page uses, so tests can pass a fake. The profile shape comes first so
 * `from('profiles')` picks it over the export reader's.
 */
export type AccountClient = {
  auth: { signOut(options: { scope: 'local' }): PromiseLike<{ error: unknown }> };
  from(table: 'profiles'): {
    select(columns: 'display_name'): { eq(column: 'id', value: string): { maybeSingle(): PromiseLike<Reply> } };
    update(values: { display_name: string }): { eq(column: 'id', value: string): { select(columns: 'display_name'): PromiseLike<Reply> } };
  };
  rpc(name: 'delete_my_account'): PromiseLike<{ error: unknown }>;
} & SupabaseExportClient & SessionReader;

export interface AccountAdapters {
  session(): Promise<SessionState>;
  /** The student's own display name, or null when there is none or it can't be read. */
  readName(userId: string): Promise<string | null>;
  /** True only when the student's own row was updated. */
  writeName(userId: string, name: string): Promise<boolean>;
  reader: ExportReader;
  /** Deletes the signed-in student's account, or rejects with the database error as `cause`. Null while deletion isn't open. */
  deleteAccount: (() => Promise<void>) | null;
  /** Signs out this device only, or rejects. */
  signOut(): Promise<void>;
}

/**
 * Adapters over the shared client. deleteAccount calls Task 60's `delete_my_account()` (no arguments; it deletes the
 * caller's own auth user). Methods are always called on their objects, because supabase-js relies on the receiver.
 */
export function adaptersFor(client: AccountClient): AccountAdapters {
  return {
    session: () => sessionStateFrom(client),
    async readName(userId) {
      const { data, error } = await client.from('profiles').select('display_name').eq('id', userId).maybeSingle();
      if (error != null || typeof data !== 'object' || data === null) return null;
      const name = (data as { display_name?: unknown }).display_name;
      return typeof name === 'string' ? name : null;
    },
    async writeName(userId, name) {
      const { data, error } = await client.from('profiles').update({ display_name: name }).eq('id', userId).select('display_name');
      return error == null && Array.isArray(data) && data.length === 1;
    },
    reader: fromSupabase(client),
    async deleteAccount() {
      const { error } = await client.rpc('delete_my_account');
      if (error != null) throw new Error('account deletion failed', { cause: error });
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error != null) throw new Error('sign out failed');
    },
  };
}

// ── Display name ──────────────────────────────────────────────────────────────

export type SaveResult =
  | { kind: 'saved'; name: string; message: string }
  | { kind: 'invalid' | 'failed'; message: string };

/** Checks the name with the database's own rules first, then saves it to the student's own profile row. */
export async function saveDisplayName(
  write: AccountAdapters['writeName'], userId: string, input: string,
): Promise<SaveResult> {
  const checked = checkDisplayName(input);
  if (!checked.ok) return { kind: 'invalid', message: checked.message };
  try {
    if (await write(userId, checked.name)) return { kind: 'saved', name: checked.name, message: accountMessage('name-saved') };
  } catch {
    // Never show a database error; it can hold SQL internals.
  }
  return { kind: 'failed', message: accountMessage('name-failed') };
}

// ── Download my data ──────────────────────────────────────────────────────────

export interface GatherOptions {
  /** The signed-in email from the session. profiles doesn't store one. */
  email: string;
  storage: KeyValueStorage | undefined;
  /** Today in the student's own time zone, YYYY-MM-DD. */
  today: string;
}

export type GatherResult = { ok: true; data: ExportData } | { ok: false; message: string };

/**
 * Everything the student has saved: the database's sections (all or nothing, from loadExport), the signed-in email,
 * and this browser's own progress and game stats. A partial load is never returned.
 */
export async function gatherExport(reader: ExportReader, { email, storage, today }: GatherOptions): Promise<GatherResult> {
  const loaded = await loadExport(reader);
  if (!loaded.ok) return { ok: false, message: loaded.message };
  // The same reading /progress uses: older per-deck stars move into the record first, so the file has all of it.
  const progress = migrateLegacyStars(storage);
  const stats = loadStats(storage, today);
  return {
    ok: true,
    data: {
      ...loaded.data,
      profile: { ...loaded.data.profile, email: email || null },
      progress,
      ...(stats.on ? { gameStats: stats.stats } : {}),
    },
  };
}

export interface DownloadFile { fileName: string; blob: Blob }
export type DownloadResult =
  | { ok: true; json: DownloadFile; csv: DownloadFile[] }
  | { ok: false; message: string };

/** The JSON file and the spreadsheet files, built from the pages without joining a long study history into one string. */
export function downloadFiles(data: ExportData, today: string): DownloadResult {
  try {
    const name = `cueory-data-${today}`;
    return {
      ok: true,
      json: { fileName: `${name}.json`, blob: exportJsonBlob(data, today) },
      csv: exportCsvBlobs(data).map(({ fileName, blob }) => ({ fileName: `${name}-${fileName}`, blob })),
    };
  } catch {
    return { ok: false, message: accountMessage('export-failed') };
  }
}

/** Loads, adds this browser's data and builds the files. Any failure offers no file at all. */
export async function prepareDownload(reader: ExportReader, options: GatherOptions): Promise<DownloadResult> {
  const gathered = await gatherExport(reader, options);
  return gathered.ok ? downloadFiles(gathered.data, options.today) : gathered;
}

export interface DownloadDom {
  urls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  document: Pick<Document, 'createElement' | 'body'>;
  later(run: () => void, ms: number): unknown;
}

/** Offers one file through a temporary object URL, and revokes the URL once the download has started. */
export function offerFile(file: DownloadFile, dom: DownloadDom): void {
  const url = dom.urls.createObjectURL(file.blob);
  try {
    const link = dom.document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    dom.document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // The browser reads the Blob after the click returns, so the URL lives a moment longer.
    dom.later(() => dom.urls.revokeObjectURL(url), 1000);
  }
}

// ── Delete my account ─────────────────────────────────────────────────────────

/** Summary lines for the confirmation, from the same data the download uses. */
export async function deletionLines(reader: ExportReader, options: GatherOptions): Promise<{ ok: true; lines: string[] } | { ok: false; message: string }> {
  const gathered = await gatherExport(reader, options);
  return gathered.ok ? { ok: true, lines: deletionSummary(gathered.data) } : { ok: false, message: accountMessage('summary-failed') };
}

/** The delete button stays disabled until the typed confirmation matches. `hint` is empty until something is typed. */
export function deleteGate(typed: string): { ready: boolean; hint: string } {
  const reason = confirmState(typed);
  return { ready: reason === null, hint: reason !== null && typed.trim() !== '' ? reason : '' };
}

/** A known refusal from delete_my_account() gets its own sentence (rpcerrors.ts); anything else gets ours. */
function deleteFailure(cause: unknown): string {
  const said = studentMessage('delete_my_account', cause);
  return said === studentMessage('delete_my_account', {}) ? accountMessage('delete-failed') : said;
}

export type DeleteResult =
  | { kind: 'deleted'; message: string; next: '/' }
  | { kind: 'not-confirmed' | 'unavailable' | 'failed'; message: string };

export interface DeleteOptions {
  typed: string;
  deleteAccount: AccountAdapters['deleteAccount'];
  signOut: AccountAdapters['signOut'];
  local: KeyValueStorage | undefined;
  session: KeyValueStorage | undefined;
}

/**
 * Deletes the account, then clears this browser: sign out of this device, remove the sign-in key even when signing
 * out fails (the account is already gone), then remove every key afterDeletion lists. The account is deleted first,
 * so a failed deletion leaves the student signed in with everything in place.
 */
export async function deleteMyAccount({ typed, deleteAccount, signOut, local, session }: DeleteOptions): Promise<DeleteResult> {
  const reason = confirmState(typed);
  if (reason !== null) return { kind: 'not-confirmed', message: reason };
  if (!deleteAccount) return { kind: 'unavailable', message: accountMessage('delete-unavailable') };
  try {
    await deleteAccount();
  } catch (error) {
    return { kind: 'failed', message: deleteFailure(error instanceof Error ? error.cause : undefined) };
  }
  try {
    await signOut();
  } catch {
    // The account no longer exists; the sign-in key is removed below either way.
  }
  let cleared = true;
  try {
    local?.removeItem(AUTH_STORAGE_KEY);
  } catch {
    cleared = false;
  }
  if (local) {
    try {
      const keys = afterDeletion(local);
      for (const key of keys) local.removeItem(key);
      for (const key of keys.sessionKeys ?? []) session?.removeItem(key);
    } catch {
      cleared = false;
    }
  }
  return { kind: 'deleted', message: accountMessage(cleared ? 'deleted' : 'deleted-not-cleared'), next: '/' };
}

// ── Sign out ──────────────────────────────────────────────────────────────────

export async function signOutHere(signOut: AccountAdapters['signOut']): Promise<{ ok: true; next: '/' } | { ok: false; message: string }> {
  try {
    await signOut();
    return { ok: true, next: '/' };
  } catch {
    return { ok: false, message: accountMessage('signout-failed') };
  }
}
