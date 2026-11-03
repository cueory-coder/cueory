/**
 * The /account page's logic (Task 59): display name, download my data, delete my account and sign out.
 * No page, no DOM except the download helper, and no client of its own: the island passes in adapters, so tests use
 * fakes. Every permission check happens on the server; row-level security limits each read and write to the
 * signed-in student's own rows.
 *
 * Reuses checkDisplayName (displayname.ts), loadExport/fromSupabase (exportload.ts), exportJsonBlob/exportCsvBlobs
 * (exportdata.ts) and deletionSummary/confirmState/afterDeletion (deleteaccount.ts).
 */
import { afterDeletion, confirmState, deletionSummary, SESSION_KEYS_AFTER_DELETION } from './deleteaccount';
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
    'deleted-not-cleared': "your account is deleted, but cueory couldn't confirm this browser cleared what it saved, so clear this site's data in your browser settings.",
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
  };
  rpc(name: 'delete_my_account'): PromiseLike<{ error: unknown }>;
  rpc(name: 'update_display_name', args: { new_name: string }): PromiseLike<Reply>;
} & SupabaseExportClient & SessionReader;

export interface AccountAdapters {
  session(): Promise<SessionState>;
  /** The student's own display name, or null when there is none or it can't be read. */
  readName(userId: string): Promise<string | null>;
  /** Saves the signed-in student's own display name and resolves with it as saved, or rejects with the database error as `cause`. */
  writeName(name: string): Promise<string>;
  reader: ExportReader;
  /** The signed-in session's `user.user_metadata` (the sign-in provider's profile details), for the download. */
  signInDetails?(): Promise<unknown>;
  /** Deletes the signed-in student's account, or rejects with the database error as `cause`. Null while deletion isn't open. */
  deleteAccount: (() => Promise<void>) | null;
  /** Signs out this device only, or rejects. */
  signOut(): Promise<void>;
}

/**
 * Adapters over the shared client. writeName calls `update_display_name(new_name)` (20261102140000_update_display_name.sql),
 * the only way to change the name: it changes the caller's own row and limits how often. deleteAccount calls Task 60's
 * `delete_my_account()` (no arguments; it deletes the caller's own auth user). Methods are always called on their
 * objects, because supabase-js relies on the receiver.
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
    async writeName(name) {
      const { data, error } = await client.rpc('update_display_name', { new_name: name });
      if (error != null) throw new Error('display name not saved', { cause: error });
      if (typeof data !== 'string') throw new Error('display name not saved');
      return data;
    },
    reader: fromSupabase(client),
    async signInDetails() {
      // https://supabase.com/docs/reference/javascript/auth-getsession: the session's user carries user_metadata.
      const { data, error } = await client.auth.getSession();
      if (error != null) throw new Error('sign-in details not read');
      const user: unknown = data?.session?.user;
      return typeof user === 'object' && user !== null ? (user as { user_metadata?: unknown }).user_metadata : undefined;
    },
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

/** A known refusal from update_display_name() gets its own sentence (rpcerrors.ts); anything else gets ours. */
function nameFailure(cause: unknown): string {
  const said = studentMessage('update_display_name', cause);
  return said === studentMessage('update_display_name', {}) ? accountMessage('name-failed') : said;
}

/** Checks the name with the database's own rules first, then saves it through update_display_name. */
export async function saveDisplayName(write: AccountAdapters['writeName'], input: string): Promise<SaveResult> {
  const checked = checkDisplayName(input);
  if (!checked.ok) return { kind: 'invalid', message: checked.message };
  try {
    const saved = await write(checked.name);
    // Show the name exactly as the database saved it; anything that isn't a valid name is a failed save.
    const shown = checkDisplayName(saved);
    if (shown.ok && shown.name === saved) return { kind: 'saved', name: saved, message: accountMessage('name-saved') };
  } catch (error) {
    // Never show a database error; it can hold SQL internals. Known refusals have their own sentence.
    return { kind: 'failed', message: nameFailure(error instanceof Error ? error.cause : undefined) };
  }
  return { kind: 'failed', message: accountMessage('name-failed') };
}

// ── Download my data ──────────────────────────────────────────────────────────

export interface GatherOptions {
  /** The signed-in email from the session. profiles doesn't store one. */
  email: string;
  /** The session's `user.user_metadata`, as `AccountAdapters.signInDetails` reads it. Left out, the section is empty. */
  signInDetails?: unknown;
  storage: KeyValueStorage | undefined;
  /** Today in the student's own time zone, YYYY-MM-DD. */
  today: string;
}

export type GatherResult = { ok: true; data: ExportData } | { ok: false; message: string };

/**
 * Everything the student has saved: the database's sections (all or nothing, from loadExport), the signed-in email,
 * the sign-in provider's profile details from the session, and this browser's own progress and game stats. A partial
 * load is never returned.
 */
export async function gatherExport(reader: ExportReader, { email, signInDetails, storage, today }: GatherOptions): Promise<GatherResult> {
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
      signInDetails: detailRows(signInDetails),
      progress,
      ...(stats.on ? { gameStats: stats.stats } : {}),
    },
  };
}

/**
 * One row per top-level field of `user_metadata`, in name order. Only own data properties are read, so a getter never
 * runs; exportdata.ts checks each value and drops anything that isn't plain.
 */
function detailRows(details: unknown): { name: string; value: unknown }[] {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return [];
  return Object.keys(details).sort().map(name => {
    const descriptor = Object.getOwnPropertyDescriptor(details, name);
    return { name, value: descriptor && 'value' in descriptor ? descriptor.value : undefined };
  });
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

/** Removes each key, trying every one even after a failure. True only when every removal went through. */
function removeAll(storage: KeyValueStorage | undefined, keys: Iterable<string>): boolean {
  if (!storage) return false;
  let ok = true;
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {
      ok = false;
    }
  }
  return ok;
}

/** The sign-in key first, then every key afterDeletion lists. False when any of it can't be confirmed. */
function clearLocal(local: KeyValueStorage | undefined): boolean {
  if (!local) return false;
  const signIn = removeAll(local, [AUTH_STORAGE_KEY]);
  let listed: string[];
  try {
    listed = [...afterDeletion(local)];
  } catch {
    return false;
  }
  return removeAll(local, listed) && signIn;
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
  // Each storage area is cleared on its own, so one that is missing or refuses never stops the other. Anything that
  // can't be confirmed (an area this browser won't open, or a removal that throws) is reported, never called clear.
  const localCleared = clearLocal(local);
  const sessionCleared = removeAll(session, SESSION_KEYS_AFTER_DELETION);
  const cleared = localCleared && sessionCleared;
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
