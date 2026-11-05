import type { APIRoute } from 'astro';
import { site } from '../config/site';
import { indexablePages } from '../config/routes';
import { generatedRoutes } from '../lessons/catalog';

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function sitemapXml(pages: readonly string[] = indexablePages): string {
  const urls = pages.map((page) => `<url><loc>${escapeXml(new URL(page, site.url).toString())}</loc></url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

/** The fixed pages plus every page generated from /content (Task 300), each once. */
export async function sitemapPages(): Promise<string[]> {
  // Loaded here, not at the top, so unit tests can import sitemapXml without Astro's content layer.
  const { lessonCatalog } = await import('../lessons/load');
  return [...new Set([...indexablePages, ...generatedRoutes(await lessonCatalog())])];
}

export const GET: APIRoute = async () => new Response(sitemapXml(await sitemapPages()), {
  headers: {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600, s-maxage=86400',
  },
});
