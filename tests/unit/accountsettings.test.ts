import { describe, expect, it, vi } from 'vitest';
import {
  accountMessage, adaptersFor, deleteGate, deleteMyAccount, deletionLines, downloadFiles, gatherExport, offerFile,
  prepareDownload, saveDisplayName, signOutHere, type AccountClient, type AccountMessage, type DownloadDom,
} from '../../src/islands/accountsettings';
import { afterDeletion, SESSION_KEYS_AFTER_DELETION } from '../../src/islands/deleteaccount';
import type { ExportReader } from '../../src/islands/exportload';
import { STATS_STORAGE_KEY } from '../../src/islands/gameresults';
import { AUTH_STORAGE_KEY } from '../../src/islands/supabaseclient';
import { BREAK_STORAGE_KEY } from '../../src/scripts/breakstore';
import { legacyStarsKey, PROGRESS_STORAGE_KEY } from '../../src/scripts/progress';
import { THEME_STORAGE_KEY } from '../../src/scripts/theme';
import type { KeyValueStorage } from '../../src/scripts/storage';

class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const when = '2026-11-01T08:00:00.000Z';
const today = '2026-11-02';
const itemId = '22222222-2222-4222-8222-222222222222';
const versionId = '11111111-1111-4111-8111-111111111111';
const eventId = '44444444-4444-4444-8444-444444444444';

/** A reader with the student's own rows, or one that fails a read. */
function reader({ fails = false, events = [] as unknown[] } = {}): ExportReader {
  const rows: Record<string, unknown[]> = {
    profiles: [{ display_name: 'Sample Student', created_at: when, name_change_window_start: null, name_changes_in_window: 0 }],
    attempts: [],
    exam_plans: [{ id: eventId, course: 'med-surg-1', exam_date: '2026-12-15', created_at: when }],
    review_state: [],
  };
  return {
    select: async (table) => fails && table === 'attempts' ? { data: null, error: { message: 'private detail' } } : { data: rows[table], error: null },
    async *selectPages() { yield { data: events, error: null }; },
    rpc: async () => ({ data: [], error: null }),
  };
}

const event = { id: eventId, item_id: itemId, item_version_id: versionId, kind: 'answered', ms_on_item: 1200, mark: null, at: when, created_at: when };

describe('every outcome is one plain sentence', () => {
  const kinds: AccountMessage[] = [
    'name-saved', 'name-failed', 'export-downloading', 'export-csv-downloading', 'export-failed', 'summary-failed',
    'delete-unavailable', 'delete-failed', 'deleted', 'deleted-not-cleared', 'signout-failed', 'load-failed',
  ];
  it.each(kinds)('%s', (kind) => {
    const text = accountMessage(kind);
    expect(text).toMatch(/^[a-z][^A-Z]*\.$/);
    expect(text).not.toMatch(/\n/);
  });
  it('gives each outcome its own sentence', () => {
    expect(new Set(kinds.map(accountMessage)).size).toBe(kinds.length);
  });
});

describe('saveDisplayName', () => {
  it('saves a trimmed name through update_display_name and shows it as saved', async () => {
    const write = vi.fn(async (name: string) => name);
    expect(await saveDisplayName(write, '  Sample  ')).toEqual({ kind: 'saved', name: 'Sample', message: 'your display name is saved.' });
    expect(write).toHaveBeenCalledWith('Sample');
  });

  it("refuses a bad name with the database's own rule and never writes", async () => {
    const write = vi.fn(async (name: string) => name);
    expect(await saveDisplayName(write, '   ')).toEqual({ kind: 'invalid', message: 'a name is required.' });
    expect(await saveDisplayName(write, 'x'.repeat(51))).toEqual({ kind: 'invalid', message: 'a name can be 1 to 50 characters.' });
    expect(write).not.toHaveBeenCalled();
  });

  it("gives the server's limit and sign-in refusals their own sentence (Codex on #230)", async () => {
    const refusing = (message: string) => async () => { throw new Error('display name not saved', { cause: { message, code: 'P0001' } }); };
    expect(await saveDisplayName(refusing('that is a lot of name changes; please try again later'), 'Sample'))
      .toEqual({ kind: 'failed', message: "you've changed your name a lot this hour. please try again later." });
    expect(await saveDisplayName(refusing('sign in to change your display name'), 'Sample'))
      .toEqual({ kind: 'failed', message: 'please sign in again to change your display name.' });
  });

  it('reports a refused or broken save in one sentence', async () => {
    const failed = { kind: 'failed', message: "we couldn't save your display name. please try again." };
    expect(await saveDisplayName(async () => '', 'Sample')).toEqual(failed);
    expect(await saveDisplayName(async () => { throw new Error('private detail'); }, 'Sample')).toEqual(failed);
    expect(await saveDisplayName(async () => { throw new Error('x', { cause: { message: 'private detail', code: 'XX000' } }); }, 'Sample'))
      .toEqual(failed);
  });
});

describe('download my data', () => {
  it("adds the signed-in email and this browser's progress and game stats", async () => {
    const local = new MemoryStorage();
    local.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, onboarding: { course: null, examDate: null, done: true }, decks: {} }));
    local.setItem(legacyStarsKey('sample-deck'), JSON.stringify(['card-1']));
    local.setItem(STATS_STORAGE_KEY, JSON.stringify([]));
    const result = await gatherExport(reader(), { email: 'student@example.test', storage: local, today });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.profile).toEqual({
      displayName: 'Sample Student', createdAt: when, nameChangeWindowStart: null, nameChangesInWindow: 0, email: 'student@example.test',
    });
    expect(result.data.progress).toMatchObject({ decks: { 'sample-deck': { starred: ['card-1'] } } });
    expect(result.data.gameStats).toEqual([]);
  });

  it('leaves game stats out when they are off in this browser', async () => {
    const result = await gatherExport(reader(), { email: '', storage: new MemoryStorage(), today });
    expect(result.ok && 'gameStats' in result.data).toBe(false);
    expect(result.ok && result.data.profile?.email).toBeNull();
  });

  it("builds the JSON file and the spreadsheet files from loadExport's pages", async () => {
    const result = await prepareDownload(reader({ events: [event] }), { email: 'student@example.test', storage: undefined, today });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.json.fileName).toBe('cueory-data-2026-11-02.json');
    expect(result.json.blob.type).toBe('application/json');
    const json = JSON.parse(await result.json.blob.text());
    expect(json.profile.email).toBe('student@example.test');
    expect(json.studyEvents).toHaveLength(1);
    expect(result.csv.map(file => file.fileName)).toContain('cueory-data-2026-11-02-studyEvents.csv');
    expect(result.csv.every(file => file.fileName.startsWith('cueory-data-2026-11-02-'))).toBe(true);
    const events = result.csv.find(file => file.fileName.endsWith('studyEvents.csv'))!;
    expect((await events.blob.text()).split('\r\n')[1]).toContain(itemId);
  });

  it("offers no file when any read fails, and never shows the database's error", async () => {
    const result = await prepareDownload(reader({ fails: true }), { email: 'student@example.test', storage: undefined, today });
    expect(result).toEqual({ ok: false, message: "we couldn't load all your saved data. please try again." });
    expect(JSON.stringify(result)).not.toContain('private detail');
  });

  it('offers no file when the files cannot be built', () => {
    expect(downloadFiles({}, 'not a day')).toEqual({ ok: false, message: accountMessage('export-failed') });
  });

  it('offers each file through an object URL and revokes it after the download starts', () => {
    const later: (() => void)[] = [];
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    const fake: DownloadDom = {
      urls: { createObjectURL: vi.fn(() => 'blob:sample'), revokeObjectURL: vi.fn() },
      document: { createElement: vi.fn(() => link), body: { append: vi.fn() } } as unknown as DownloadDom['document'],
      later: (run) => later.push(run),
    };
    const blob = new Blob(['{}']);
    offerFile({ fileName: 'cueory-data-2026-11-02.json', blob }, fake);
    expect(fake.urls.createObjectURL).toHaveBeenCalledWith(blob);
    expect(link).toMatchObject({ href: 'blob:sample', download: 'cueory-data-2026-11-02.json' });
    expect(link.click).toHaveBeenCalledOnce();
    expect(fake.urls.revokeObjectURL).not.toHaveBeenCalled();
    later.forEach(run => run());
    expect(fake.urls.revokeObjectURL).toHaveBeenCalledWith('blob:sample');
  });
});

/** A client whose delete_my_account() refuses exactly as Task 60's migration does. */
function refusingClient() {
  const client = {
    rpc: async () => ({ data: null, error: { message: 'sign in to delete your account', code: '28000' } }),
    auth: { signOut: async () => ({ error: null }) },
  };
  return { client: client as unknown as AccountClient };
}
const pick = ({ deleteAccount, signOut }: ReturnType<typeof adaptersFor>) => ({ deleteAccount, signOut });

describe('delete my account', () => {
  const seeded = () => {
    const local = new MemoryStorage();
    for (const key of [AUTH_STORAGE_KEY, PROGRESS_STORAGE_KEY, THEME_STORAGE_KEY, legacyStarsKey('old-deck')]) local.setItem(key, '1');
    local.setItem('not-cueory', 'kept');
    const session = new MemoryStorage();
    session.setItem(BREAK_STORAGE_KEY, '1');
    return { local, session };
  };

  it('stays disabled until the typed confirmation matches', () => {
    expect(deleteGate('')).toEqual({ ready: false, hint: '' });
    expect(deleteGate('delet')).toEqual({ ready: false, hint: 'type the word delete to confirm' });
    expect(deleteGate(' DELETE ')).toEqual({ ready: true, hint: '' });
  });

  it('never calls the server before the confirmation matches', async () => {
    const deleteAccount = vi.fn(async () => {});
    const result = await deleteMyAccount({ typed: 'delet', deleteAccount, signOut: async () => {}, ...seeded() });
    expect(result).toEqual({ kind: 'not-confirmed', message: 'type the word delete to confirm' });
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('says deletion opens soon when no delete callback is provided', async () => {
    expect(await deleteMyAccount({ typed: 'delete', deleteAccount: null, signOut: async () => {}, ...seeded() }))
      .toEqual({ kind: 'unavailable', message: 'account deletion opens soon.' });
  });

  it('keeps everything and stays signed in when the server refuses', async () => {
    const storage = seeded();
    const signOut = vi.fn(async () => {});
    const result = await deleteMyAccount({ typed: 'delete', deleteAccount: async () => { throw new Error('private'); }, signOut, ...storage });
    expect(result).toEqual({ kind: 'failed', message: "we couldn't delete your account. please try again." });
    expect(signOut).not.toHaveBeenCalled();
    expect(storage.local.getItem(AUTH_STORAGE_KEY)).toBe('1');
  });

  it('signs out, then clears this device, then goes home', async () => {
    const storage = seeded();
    const order: string[] = [];
    const result = await deleteMyAccount({
      typed: 'delete', deleteAccount: async () => { order.push('delete'); },
      signOut: async () => { order.push('signout'); }, ...storage,
    });
    expect(order).toEqual(['delete', 'signout']);
    expect(result).toEqual({ kind: 'deleted', next: '/', message: 'your account is deleted, and this device no longer keeps your cueory data.' });
    expect([...storage.local.values.keys()]).toEqual(['not-cueory']);
    expect(storage.session.getItem(BREAK_STORAGE_KEY)).toBeNull();
  });

  it('maps the signed-out refusal to a plain sentence and keeps everything', async () => {
    const storage = seeded();
    const { client } = refusingClient();
    const result = await deleteMyAccount({ typed: 'delete', ...pick(adaptersFor(client)), ...storage });
    expect(result).toEqual({ kind: 'failed', message: 'please sign in again to delete your account.' });
    expect(storage.local.getItem(AUTH_STORAGE_KEY)).toBe('1');
  });

  it('gives any other server error our own sentence, never its text', async () => {
    const result = await deleteMyAccount({
      typed: 'delete', signOut: async () => {}, ...seeded(),
      deleteAccount: async () => { throw new Error('account deletion failed', { cause: { message: 'private detail', code: 'XX000' } }); },
    });
    expect(result).toEqual({ kind: 'failed', message: "we couldn't delete your account. please try again." });
  });

  it('removes the sign-in key and still lands home when sign-out rejects', async () => {
    const storage = seeded();
    const result = await deleteMyAccount({
      typed: 'delete', deleteAccount: async () => {}, signOut: async () => { throw new Error('user not found'); }, ...storage,
    });
    expect(storage.local.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(result).toEqual({ kind: 'deleted', next: '/', message: accountMessage('deleted') });
  });

  it('removes every key afterDeletion lists', async () => {
    const storage = seeded();
    const planned = afterDeletion(storage.local);
    await deleteMyAccount({ typed: 'delete', deleteAccount: async () => {}, signOut: async () => {}, ...storage });
    for (const key of planned) expect(storage.local.getItem(key)).toBeNull();
    for (const key of planned.sessionKeys) expect(storage.session.getItem(key)).toBeNull();
  });

  it("says so when the browser won't let it clear the device", async () => {
    const storage = seeded();
    const stubborn = Object.assign(storage.local, { removeItem: () => { throw new Error('blocked'); } });
    const result = await deleteMyAccount({ typed: 'delete', deleteAccount: async () => {}, signOut: async () => {}, local: stubborn, session: storage.session });
    expect(result).toEqual({ kind: 'deleted', next: '/', message: accountMessage('deleted-not-cleared') });
  });

  it('clears session storage even when local storage is missing, and never calls that clear (Codex on #230)', async () => {
    const { session } = seeded();
    for (const key of SESSION_KEYS_AFTER_DELETION) session.setItem(key, '1');
    const result = await deleteMyAccount({ typed: 'delete', deleteAccount: async () => {}, signOut: async () => {}, local: undefined, session });
    for (const key of SESSION_KEYS_AFTER_DELETION) expect(session.getItem(key)).toBeNull();
    expect(result).toEqual({ kind: 'deleted', next: '/', message: accountMessage('deleted-not-cleared') });
  });

  it('clears session storage when local storage throws, and still clears the rest of local storage', async () => {
    const storage = seeded();
    const removeItem = storage.local.removeItem.bind(storage.local);
    // Only the sign-in key refuses; every other local key and the session keys still go.
    storage.local.removeItem = (key: string) => { if (key === AUTH_STORAGE_KEY) throw new Error('blocked'); removeItem(key); };
    const result = await deleteMyAccount({ typed: 'delete', deleteAccount: async () => {}, signOut: async () => {}, ...storage });
    expect([...storage.local.values.keys()].sort()).toEqual([AUTH_STORAGE_KEY, 'not-cueory']);
    expect(storage.session.getItem(BREAK_STORAGE_KEY)).toBeNull();
    expect(result.message).toBe(accountMessage('deleted-not-cleared'));
  });

  it('clears session storage when local storage cannot be listed', async () => {
    const storage = seeded();
    const unlistable = Object.assign(storage.local, { key: undefined }) as unknown as KeyValueStorage;
    const result = await deleteMyAccount({ typed: 'delete', deleteAccount: async () => {}, signOut: async () => {}, local: unlistable, session: storage.session });
    expect(storage.local.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(storage.session.getItem(BREAK_STORAGE_KEY)).toBeNull();
    expect(result.message).toBe(accountMessage('deleted-not-cleared'));
  });

  it('reports cleanup it cannot confirm when session storage is missing or refuses', async () => {
    for (const session of [undefined, Object.assign(new MemoryStorage(), { removeItem: () => { throw new Error('blocked'); } })]) {
      const { local } = seeded();
      const result = await deleteMyAccount({ typed: 'delete', deleteAccount: async () => {}, signOut: async () => {}, local, session });
      expect([...local.values.keys()]).toEqual(['not-cueory']);
      expect(result.message).toBe(accountMessage('deleted-not-cleared'));
    }
  });

  it("lists what will go, or says it couldn't", async () => {
    expect(await deletionLines(reader(), { email: 'student@example.test', storage: undefined, today }))
      .toEqual({ ok: true, lines: ['your display name and email address', '1 exam date'] });
    expect(await deletionLines(reader({ fails: true }), { email: '', storage: undefined, today }))
      .toEqual({ ok: false, message: "we couldn't list what's saved, but deleting your account removes all of it." });
  });
});

describe('sign out', () => {
  it("goes home after signing out, or says it didn't work", async () => {
    expect(await signOutHere(async () => {})).toEqual({ ok: true, next: '/' });
    expect(await signOutHere(async () => { throw new Error('x'); })).toEqual({ ok: false, message: 'sign out did not work. please try again.' });
  });
});

describe('adaptersFor', () => {
  function fakeClient({ error = null as unknown, saved = null as unknown } = {}) {
    const calls: unknown[][] = [];
    const client = {
      auth: {
        async getSession() { return { data: { session: { user: { id: 'user-1', email: 'student@example.test' } } }, error: null }; },
        signOut(this: unknown, options: unknown) {
          if (this !== client.auth) throw new Error('auth receiver was lost');
          calls.push(['signOut', options]);
          return Promise.resolve({ error });
        },
      },
      from(table: string) {
        return {
          select: (columns: string) => ({ eq: (column: string, value: string) => ({
            maybeSingle: async () => { calls.push(['read', table, columns, column, value]); return { data: error ? null : { display_name: 'Sample' }, error }; },
          }) }),
        };
      },
      rpc(this: unknown, name: string, args?: unknown) {
        if (this !== client) throw new Error('client receiver was lost');
        calls.push(args === undefined ? ['rpc', name] : ['rpc', name, args]);
        return Promise.resolve({ data: error ? null : saved, error });
      },
    };
    return { client: client as unknown as AccountClient, calls };
  }

  it("reads the session and the student's own name", async () => {
    const { client, calls } = fakeClient();
    const adapters = adaptersFor(client);
    expect(await adapters.session()).toEqual({ signedIn: true, userId: 'user-1', email: 'student@example.test' });
    expect(await adapters.readName('user-1')).toBe('Sample');
    expect(calls).toEqual([['read', 'profiles', 'display_name', 'id', 'user-1']]);
  });

  it('saves the name only through update_display_name, never a direct table update (Codex on #230)', async () => {
    const { client, calls } = fakeClient({ saved: 'Sample' });
    expect(await adaptersFor(client).writeName('Sample')).toBe('Sample');
    expect(calls).toEqual([['rpc', 'update_display_name', { new_name: 'Sample' }]]);
    await expect(adaptersFor(fakeClient({ saved: null }).client).writeName('Sample')).rejects.toThrow();
    const refusal = { code: '54000', message: 'that is a lot of name changes; please try again later' };
    await expect(adaptersFor(fakeClient({ error: refusal }).client).writeName('Sample')).rejects.toMatchObject({ cause: refusal });
  });

  it('deletes through delete_my_account() with no arguments and signs out this device only', async () => {
    const { client, calls } = fakeClient();
    const adapters = adaptersFor(client);
    await adapters.deleteAccount!();
    await adapters.signOut();
    expect(calls).toEqual([['rpc', 'delete_my_account'], ['signOut', { scope: 'local' }]]);
  });

  it('rejects when the server returns an error', async () => {
    const adapters = adaptersFor(fakeClient({ error: { message: 'private' } }).client);
    await expect(adapters.deleteAccount!()).rejects.toThrow('account deletion failed');
    await expect(adapters.signOut()).rejects.toThrow('sign out failed');
    expect(await adapters.readName('user-1')).toBeNull();
  });
});
