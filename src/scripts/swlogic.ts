/**
 * What the offline service worker may do with a request or a response (ROADMAP Task 5). Pure decisions, no I/O, so
 * they are unit tested; src/pages/sw.js.ts glues this file, offlineplan.ts and sw.ts into the one /sw.js the browser
 * runs. Keep this file free of syntax the build can't strip (no enums, no namespaces, no parameter properties).
 */
import { cacheable, cacheName } from './offlineplan';

export type Strategy = 'network-first' | 'cache-first';

/** The few fields of a Request that matter here. */
export interface RequestLike {
  method: string;
  url: string;
}

/** The few fields of a Response that matter here. */
export interface ResponseLike {
  ok: boolean;
  status: number;
  type: string;
  redirected: boolean;
  headers: { get(name: string): string | null };
}

/**
 * How to answer a request from the cache, or null to leave it alone (the browser then handles it as if there were no
 * service worker). Only GET, only what `cacheable()` allows, and no query string at all: nothing on the allow-list of
 * query strings is needed today, so the list is empty. Hashed build files (`/_astro/`) never change, so they come from
 * the cache first; pages, fonts and brand files may change, so they ask the network first and use the cache only when
 * the network fails. `/play` is the page only: `cacheable()` refuses anything under it, so puzzle data is never kept.
 */
export function strategyFor(request: RequestLike, origin: string): Strategy | null {
  if (request.method !== 'GET') return null;
  if (!cacheable(request.url, origin)) return null;
  const url = new URL(request.url, origin);
  if (url.search) return null;
  return url.pathname.startsWith('/_astro/') ? 'cache-first' : 'network-first';
}

/**
 * Whether a response may be kept: a complete, successful answer from this site that was not a redirect (a sign-in page
 * from a locked preview arrives as one) and did not say it must not be stored.
 */
export function storable(response: ResponseLike): boolean {
  if (!response.ok || response.status !== 200 || response.type !== 'basic' || response.redirected) return false;
  const control = (response.headers.get('cache-control') ?? '').toLowerCase();
  return !/(^|[\s,])(no-store|private)([\s,=]|$)/.test(control);
}

/** The caches to delete: ours from an earlier build. Another script's caches on this origin are never touched. */
export function staleCaches(names: readonly string[], currentVersion: string): string[] {
  const current = cacheName(currentVersion);
  const prefix = cacheName('x').slice(0, -1);
  return names.filter((name) => name.startsWith(prefix) && name !== current);
}
