/**
 * Reads the one-time PKCE callback without exposing its code in rendered UI, and finishes it through an injected auth
 * client (the shared one from supabaseclient.ts on the real page, a fake in tests).
 * All redirects are restricted to a path on the current site's origin.
 */
export type CallbackResult =
  | { kind: 'code'; code: string; next: string }
  | { kind: 'error' }
  | { kind: 'nothing' };

const DEFAULT_NEXT = '/progress';

/** The one sentence any failed sign-in shows. Provider error text is never read or shown (Task 164). */
export const CALLBACK_ERROR = "sign-in didn't finish. please try again.";

/** Refuse URL-looking, ambiguous or oversized destinations before resolving. */
export function safeNext(raw: string | null | undefined, origin: string): string {
  if (!raw || raw.length > 1024 || !raw.startsWith('/') || raw.startsWith('//')
    || /[\\\s\u0000-\u001f\u007f]/u.test(raw)) return DEFAULT_NEXT;

  try {
    const site = new URL(origin);
    if (!['https:', 'http:'].includes(site.protocol) || site.username || site.password) return DEFAULT_NEXT;
    const target = new URL(raw, site.origin);
    if (target.origin !== site.origin || target.username || target.password || target.pathname.startsWith('//')) {
      return DEFAULT_NEXT;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return DEFAULT_NEXT;
  }
}

function urlFor(raw: URL | string): URL | null {
  try {
    // Relative input is accepted for simple unit tests. The browser passes an absolute URL.
    return new URL(String(raw), 'https://cueory.app');
  } catch {
    return null;
  }
}

/** Read Supabase's `code`, or note that the provider sent an error (its text is ignored). Never guess. */
export function readCallback(raw: URL | string): CallbackResult {
  const url = urlFor(raw);
  if (!url) return { kind: 'nothing' };

  if (url.searchParams.has('error') || url.searchParams.has('error_description')) return { kind: 'error' };

  const code = url.searchParams.get('code')?.trim();
  if (!code) return { kind: 'nothing' };
  // Unreasonably long codes are not passed through to the auth client.
  if (code.length > 2048) return { kind: 'error' };
  return { kind: 'code', code, next: safeNext(url.searchParams.get('next'), url.origin) };
}

/** Absolute, same-origin URL for history.replaceState. It contains no code, query or fragment. */
export function cleanCallbackUrl(raw: URL | string): string {
  const url = urlFor(raw);
  if (!url) return '/auth/callback';
  return `${url.origin}${url.pathname}`;
}

/**
 * The part of supabase-js's auth client used here (`exchangeCodeForSession`, @supabase/auth-js 2.118). `data` is read
 * defensively: only a session with a user id counts as success.
 */
export interface CodeExchangeAuth {
  exchangeCodeForSession(code: string): Promise<{ data: unknown; error: unknown }>;
}
export type AuthLoader<T> = () => Promise<T | null>;

/** The signed-in user's id from an exchange result, or null when there is no session. */
export function exchangedUserId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const { session, user } = data as { session?: unknown; user?: unknown };
  if (!session || typeof session !== 'object') return null;
  const id = user && typeof user === 'object' ? (user as { id?: unknown }).id : undefined;
  return typeof id === 'string' && id !== '' ? id : null;
}

export type CallbackOutcome = { kind: 'redirect'; next: string } | { kind: 'error' } | { kind: 'unavailable' };

/**
 * Finishes the sign-in on /auth/callback. The client is loaded only when the address has a code, so error and empty
 * callbacks never download it. A null client means accounts are off in this build.
 */
export async function finishCallback(load: AuthLoader<CodeExchangeAuth>, href: string): Promise<CallbackOutcome> {
  const callback = readCallback(href);
  if (callback.kind !== 'code') return { kind: 'error' };
  try {
    const auth = await load();
    if (!auth) return { kind: 'unavailable' };
    const { data, error } = await auth.exchangeCodeForSession(callback.code);
    return error || !exchangedUserId(data) ? { kind: 'error' } : { kind: 'redirect', next: callback.next };
  } catch {
    return { kind: 'error' };
  }
}
