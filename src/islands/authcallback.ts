/**
 * Reads the one-time PKCE callback without exposing its code in rendered UI.
 * All redirects are restricted to a path on the current site's origin.
 */
export type CallbackResult =
  | { kind: 'code'; code: string; next: string }
  | { kind: 'error'; message: string }
  | { kind: 'nothing' };

const DEFAULT_NEXT = '/progress';
const GENERIC_ERROR = "we couldn't finish signing you in. please try again.";

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

/** Read Supabase's `code` or provider error, but never guess when the URL is invalid. */
export function readCallback(raw: URL | string): CallbackResult {
  const url = urlFor(raw);
  if (!url) return { kind: 'nothing' };

  if (url.searchParams.has('error') || url.searchParams.has('error_description')) {
    const rawMessage = url.searchParams.get('error_description') ?? '';
    const plain = [...rawMessage.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim()].slice(0, 200).join('');
    return { kind: 'error', message: plain || GENERIC_ERROR };
  }

  const code = url.searchParams.get('code')?.trim();
  if (!code) return { kind: 'nothing' };
  // Unreasonably long codes are not passed through to the auth client.
  if (code.length > 2048) return { kind: 'error', message: GENERIC_ERROR };
  return { kind: 'code', code, next: safeNext(url.searchParams.get('next'), url.origin) };
}

/** Absolute, same-origin URL for history.replaceState. It contains no code, query or fragment. */
export function cleanCallbackUrl(raw: URL | string): string {
  const url = urlFor(raw);
  if (!url) return '/auth/callback';
  return `${url.origin}${url.pathname}`;
}
