import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  AUTH_OPTIONS,
  AUTH_STORAGE_KEY,
  makeGetSupabase,
  sessionStateFrom,
  type ClientLoader,
  type SessionReader,
} from '../../src/islands/supabaseclient';

const URL_OK = 'https://abcdefghijklmnopqrst.supabase.co';
const KEY_OK = 'sb_publishable_example_not_a_real_key';

function fakeLoader() {
  const client = { marker: 'client' };
  const createClient = vi.fn(() => client);
  const load = vi.fn(async () => ({ createClient })) as unknown as ClientLoader & ReturnType<typeof vi.fn>;
  return { client, createClient, load };
}

describe('getSupabase', () => {
  it('is null and never loads the package when accounts are off', async () => {
    const { load } = fakeLoader();
    const get = makeGetSupabase({}, load);
    expect(await get()).toBeNull();
    expect(await get()).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('refuses a secret key without loading the package', async () => {
    const { load } = fakeLoader();
    const get = makeGetSupabase({ PUBLIC_SUPABASE_URL: URL_OK, PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_x' }, load);
    expect(await get()).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('creates one client with the PKCE options and reuses it', async () => {
    const { client, createClient, load } = fakeLoader();
    const get = makeGetSupabase({ PUBLIC_SUPABASE_URL: URL_OK, PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY_OK }, load);
    const [a, b] = await Promise.all([get(), get()]);
    expect(a).toBe(client);
    expect(b).toBe(client);
    expect(await get()).toBe(client);
    expect(load).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(URL_OK, KEY_OK, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'cueory-auth',
      },
    });
  });

  it('tries the download again after a failure', async () => {
    const { client, createClient } = fakeLoader();
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ createClient }) as unknown as ClientLoader;
    const get = makeGetSupabase({ PUBLIC_SUPABASE_URL: URL_OK, PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY_OK }, load);
    await expect(get()).rejects.toThrow('offline');
    expect(await get()).toBe(client);
  });

  it('keeps the session under the documented storage key', () => {
    expect(AUTH_STORAGE_KEY).toBe('cueory-auth');
    expect(AUTH_OPTIONS.storageKey).toBe(AUTH_STORAGE_KEY);
    expect(Object.isFrozen(AUTH_OPTIONS)).toBe(true);
  });
});

describe('sessionStateFrom', () => {
  const reader = (result: unknown): SessionReader =>
    ({ auth: { getSession: async () => result } }) as unknown as SessionReader;

  it('is signed out without a client', async () => {
    expect(await sessionStateFrom(null)).toEqual({ signedIn: false });
  });

  it('reads the signed-in user', async () => {
    const r = reader({ data: { session: { user: { id: 'u-1', email: 'a@b.co' } } }, error: null });
    expect(await sessionStateFrom(r)).toEqual({ signedIn: true, userId: 'u-1', email: 'a@b.co' });
  });

  it('treats no session, an error, a missing id or a throw as signed out', async () => {
    expect(await sessionStateFrom(reader({ data: { session: null }, error: null }))).toEqual({ signedIn: false });
    expect(
      await sessionStateFrom(reader({ data: { session: { user: { id: 'u' } } }, error: new Error('x') })),
    ).toEqual({ signedIn: false });
    expect(await sessionStateFrom(reader({ data: { session: { user: { id: '' } } }, error: null }))).toEqual({
      signedIn: false,
    });
    const throwing = { auth: { getSession: async () => { throw new Error('boom'); } } } as unknown as SessionReader;
    expect(await sessionStateFrom(throwing)).toEqual({ signedIn: false });
  });

  it('uses an empty email when the account has none', async () => {
    const r = reader({ data: { session: { user: { id: 'u-2', email: null } } }, error: null });
    expect(await sessionStateFrom(r)).toEqual({ signedIn: true, userId: 'u-2', email: '' });
  });
});

describe('build output', () => {
  const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
  it.skipIf(!existsSync(join(dist, 'index.html')))('home page scripts never include the Supabase client', () => {
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/src="(\/_astro\/[^"]+\.js)"/g)].map((m) => m[1]);
    for (const src of scripts) {
      const code = readFileSync(join(dist, src), 'utf8');
      expect(code, src).not.toMatch(/GoTrueClient|supabase-js/);
    }
  });
});

describe('sessionCheckFrom', () => {
  it('reports a thrown or returned error as a failure, not as signed out', async () => {
    const { sessionCheckFrom } = await import('../../src/islands/supabaseclient');
    expect(await sessionCheckFrom({ auth: { getSession: () => Promise.reject(new Error('x')) } })).toEqual({ error: true });
    expect(await sessionCheckFrom({ auth: { getSession: async () => ({ data: { session: null }, error: new Error('x') }) } })).toEqual({ error: true });
    expect(await sessionCheckFrom({ auth: { getSession: async () => ({ data: { session: null }, error: null }) } })).toEqual({ signedIn: false });
    expect(await sessionCheckFrom(null)).toEqual({ signedIn: false });
  });
});
