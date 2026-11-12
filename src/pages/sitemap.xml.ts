import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { APIRoute } from 'astro';
import { site } from '../config/site';
import { indexablePages } from '../config/routes';
import { generatedRoutes } from '../lessons/catalog';

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

/** Check the Layout prop, not a comment or an unrelated occurrence of "noindex". */
export function sourceDeclaresNoindex(source: string): boolean {
  const markup = source.replace(/^---[\s\S]*?---/, '').replace(/<!--[\s\S]*?-->/g, '');
  const layout = markup.match(/<Layout\b([\s\S]*?)>/)?.[1];
  if (!layout) return false;
  const flag = layout.match(/(?:^|\s)noindex(?:\s*=\s*(\{[^}]*\}|"[^"]*"|'[^']*'))?(?=\s|$)/);
  if (!flag) return false;
  return flag[1] === undefined || !/^(?:\{\s*false\s*\}|"false"|'false')$/.test(flag[1]);
}

/** Resolve an indexable route to the page that renders it, including generated lesson pages. */
export function pageSourcePath(route: string): string | undefined {
  const parts = new URL(route, site.url).pathname.split('/').filter(Boolean);
  // Paths come from our own route catalog, but never let a malformed route read arbitrary files.
  if (!parts.every((part) => /^[a-z0-9-]+$/.test(part))) return undefined;
  const slug = parts.join('/');
  const candidates = parts.length ? [`${slug}.astro`, `${slug}/index.astro`] : ['index.astro'];
  if (parts[0] === 'learn' && parts.length >= 2) {
    const mode = parts.slice(2).join('/') || 'index';
    candidates.push(`learn/[lesson]/${mode}.astro`);
  }
  return candidates.map((candidate) => resolve('src/pages', candidate)).find((candidate) => existsSync(candidate));
}

/** A route is not indexable if its actual Astro page declares Layout noindex. */
export function routeDeclaresNoindex(route: string): boolean {
  const source = pageSourcePath(route);
  return source !== undefined && sourceDeclaresNoindex(readFileSync(source, 'utf8'));
}

export function sitemapXml(pages: readonly string[] = indexablePages): string {
  const urls = pages
    .filter((page) => !routeDeclaresNoindex(page))
    .map((page) => `<url><loc>${escapeXml(new URL(page, site.url).toString())}</loc></url>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

/** The fixed pages plus every page generated from /content (Task 300), each once, excluding noindex pages. */
export async function sitemapPages(): Promise<string[]> {
  // Loaded here, not at the top, so unit tests can import sitemapXml without Astro's content layer.
  const { lessonCatalog } = await import('../lessons/load');
  return [...new Set([...indexablePages, ...generatedRoutes(await lessonCatalog())])]
    .filter((page) => !routeDeclaresNoindex(page));
}

export const GET: APIRoute = async () => new Response(sitemapXml(await sitemapPages()), {
  headers: {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600, s-maxage=86400',
  },
});
