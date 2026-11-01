/** URL policy for a future GET-only offline cache; this module performs no I/O. */
const CACHE_PREFIX = 'cueory-offline-';
const PRIVATE_PARAMETERS = new Set([
  'token', 'code', 'key', 'access_token', 'refresh_token', 'id_token', 'token_hash', 'api_key',
]);

/**
 * Call only after checking that a request's method is GET. A URL cannot tell us
 * its request method. `origin` must be the site's origin, such as location.origin.
 * Relative URLs resolve against that origin, never against the current page.
 */
export function cacheable(url: string, origin: string): boolean {
  if (typeof url !== 'string' || typeof origin !== 'string') return false;
  try {
    const site = new URL(origin);
    if (!['https:', 'http:'].includes(site.protocol) || site.username || site.password
      || site.pathname !== '/' || site.search || site.hash) return false;

    // WHATWG URL parsing normalizes some whitespace and backslashes. Refuse
    // those ambiguous spellings rather than making them part of the allowlist.
    if (!url || /[\s\\\u0000-\u001f\u007f]/u.test(url)) return false;
    const target = new URL(url, site.origin);
    if (target.origin !== site.origin || target.username || target.password || target.hash) return false;

    // Encoded separators can be interpreted differently by a router or proxy.
    // Refuse nested escapes too, rather than relying on a particular decode count.
    const path = target.pathname;
    if (/%(?:2f|5c|25)/i.test(path)) return false;
    if (/%(?![\da-f]{2})/i.test(path)) return false;
    for (const name of target.searchParams.keys()) {
      if (PRIVATE_PARAMETERS.has(name.toLowerCase())) return false;
    }

    return path === '/' || path === '/play' || path === '/play/'
      || ['/learn/', '/_astro/', '/brand/', '/fonts/'].some(prefix => path.startsWith(prefix));
  } catch {
    return false;
  }
}

/** Pass a unique build version (for example its commit SHA), not a fixed label. */
export function cacheName(version: string): string {
  if (typeof version !== 'string' || !version.trim()) throw new Error('A build version is required.');
  return `${CACHE_PREFIX}${version}`;
}
