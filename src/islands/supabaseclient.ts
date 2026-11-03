/**
 * The one Supabase client for the browser (Task 55, D-73, D-95).
 *
 * - Accounts off (no project address or key in this build, or a refused key): `getSupabase()` is `null` and the
 *   `@supabase/supabase-js` package is never downloaded.
 * - Accounts on: the package is loaded on first use (a dynamic import, so pages that never ask for it never ship
 *   it) and one client is kept for the page.
 *
 * Sign-in uses the PKCE flow. The callback page (`/auth/callback`, Task 57) exchanges the code itself, so the client
 * does not read sessions from the address bar on every page (`detectSessionInUrl: false`).
 *
 * The session lives in the browser's local storage under `cueory-auth` (listed on /privacy, Task 72).
 * `getSessionState()` reads that local session for display only (initials, menus). Every permission check happens
 * on the server: row-level security and the database functions verify the signed token themselves.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseSettings } from './supabaseenv';

/** Where the session is kept in local storage. */
export const AUTH_STORAGE_KEY = 'cueory-auth';

/**
 * The PKCE sign-in's one-time verifier, kept in local storage while a sign-in is in progress. Names from the installed
 * @supabase/auth-js 2.118.0 (`lib/helpers.js`, `storePKCEVerifier`): every sign-in writes the fixed key
 * `<storageKey>-code-verifier`, its own slot `<storageKey>-flow-<flow id>-code-verifier`, and the list of pending
 * slots `<storageKey>-flows-code-verifier`. Signing out removes all of them (`removeAllPKCEVerifiers`).
 */
export const PKCE_VERIFIER_STORAGE_KEY = `${AUTH_STORAGE_KEY}-code-verifier`;
export const PKCE_FLOW_LIST_STORAGE_KEY = `${AUTH_STORAGE_KEY}-flows-code-verifier`;
export const pkceFlowStorageKey = (flowId: string) => `${AUTH_STORAGE_KEY}-flow-${flowId}-code-verifier`;

/** True for any of the PKCE verifier keys above, including one left behind by an abandoned sign-in. */
export function isPkceVerifierKey(key: string): boolean {
  return key.startsWith(`${AUTH_STORAGE_KEY}-`) && key.endsWith('-code-verifier');
}

/** Exactly the auth options every client is created with. */
export const AUTH_OPTIONS = Object.freeze({
  flowType: 'pkce',
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: false,
  storageKey: AUTH_STORAGE_KEY,
} as const);

type CreateClient = (url: string, key: string, options: { auth: typeof AUTH_OPTIONS }) => SupabaseClient;
export type ClientLoader = () => Promise<{ createClient: CreateClient }>;
export interface PublicEnv {
  PUBLIC_SUPABASE_URL?: string;
  PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
}

/**
 * Builds a `getSupabase` for the given build settings and package loader. Exported for tests; pages use
 * `getSupabase` below. A failed download is not cached, so the next call tries again.
 */
export function makeGetSupabase(env: PublicEnv, load: ClientLoader): () => Promise<SupabaseClient | null> {
  let cached: Promise<SupabaseClient | null> | null = null;
  return () => {
    if (cached) return cached;
    const settings = supabaseSettings(env);
    if (!settings.enabled) {
      cached = Promise.resolve(null);
      return cached;
    }
    cached = load().then(
      ({ createClient }) => createClient(settings.url, settings.key, { auth: AUTH_OPTIONS }),
      (error: unknown) => {
        cached = null;
        throw error;
      },
    );
    return cached;
  };
}

/** The page's Supabase client, or `null` when accounts are off in this build. */
export const getSupabase = makeGetSupabase(
  {
    PUBLIC_SUPABASE_URL: import.meta.env.PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  },
  () => import('@supabase/supabase-js') as Promise<{ createClient: CreateClient }>,
);

export type SessionState = { signedIn: false } | { signedIn: true; userId: string; email: string };

/** The minimum of the client that `sessionStateFrom` needs, so it can be tested without the package. */
export interface SessionReader {
  auth: {
    getSession(): Promise<{
      data: { session: { user: { id: string; email?: string | null } } | null };
      error: unknown;
    }>;
  };
}

/** Who is signed in on this browser, for display only. Any error reads as signed out. */
export async function sessionStateFrom(client: SessionReader | null): Promise<SessionState> {
  if (!client) return { signedIn: false };
  try {
    const { data, error } = await client.auth.getSession();
    const user = data?.session?.user;
    if (error || !user || typeof user.id !== 'string' || user.id === '') return { signedIn: false };
    return { signedIn: true, userId: user.id, email: typeof user.email === 'string' ? user.email : '' };
  } catch {
    return { signedIn: false };
  }
}

/** Who is signed in, using the page's client. */
export async function getSessionState(): Promise<SessionState> {
  return sessionStateFrom((await getSupabase()) as unknown as SessionReader | null);
}
