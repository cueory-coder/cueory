/** Route-level guard for Cueory's static site search (Pagefind).
 *
 * The sitemap's Layout `noindex` rule is the single source of truth. This
 * module does not duplicate that parser or the list of published lesson slugs.
 * All paths must refer to real files in the current source tree.
 */
import { routeDeclaresNoindex } from '../pages/sitemap.xml';
import { site } from './site';

const PRIVATE_SECTIONS: ReadonlySet<string> = new Set(['preview', 'account', 'admin', 'auth']);

/** Normalize an HTML build address into the matching extensionless Astro route. */
export function searchRoute(path: string): string | undefined {
  let url: URL;
  try { url = new URL(path, site.url); }
  catch { return undefined; }
  if (url.origin !== new URL(site.url).origin) return undefined;
  let route = url.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  route = route.replace(/\/$/, '') || '/';
  return route;
}

/** No unknown, restricted or `Layout noindex` route may enter the site search. */
export function isSearchableRoute(path: string): boolean {
  const route = searchRoute(path);
  if (route === undefined) return false;
  if (PRIVATE_SECTIONS.has(route.split('/')[1] ?? '')) return false;
  // routeDeclaresNoindex also returns true for missing / malformed routes (W18).
  return !routeDeclaresNoindex(route);
}
