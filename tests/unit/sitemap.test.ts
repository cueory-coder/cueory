import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { indexablePages } from '../../src/config/routes';
import { GET, sitemapXml } from '../../src/pages/sitemap.xml';

// Keep this response test independent of Astro's live content collection.
vi.mock('../../src/lessons/load', () => ({ lessonCatalog: async () => ({ lessons: [], problems: [] }) }));

const noindexPages = [
  '/auth/callback', '/reset-password', '/signin', '/signup', '/start', '/subscribed',
  '/progress', '/breaks', '/play/hello-cards', '/play/stat', '/account/two-factor',
  '/privacy', '/terms', '/disclaimer',
];

describe('sitemap', () => {
  it('lists every indexable page and no noindex page', () => {
    const xml = sitemapXml();
    const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

    expect(listed).toEqual(indexablePages.map((page) => `https://cueory.app${page}`));
    for (const page of noindexPages) expect(listed).not.toContain(`https://cueory.app${page}`);
  });

  it('returns a public sitemap with the documented browser and edge cache limits', async () => {
    const response = await GET({} as Parameters<typeof GET>[0]);
    expect(response.headers.get('Content-Type')).toBe('application/xml; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600, s-maxage=86400');
    expect(await response.text()).toContain('<urlset');
  });

  it('configures real Cloudflare static-asset cache headers for /sitemap.xml', () => {
    const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
    expect(headers).toMatch(/^\/sitemap\.xml\r?\n[ \t]+Cache-Control: public, max-age=3600, s-maxage=86400(?:\r?\n|$)/m);
  });

  it('escapes XML values in the generated loc', () => {
    expect(sitemapXml(['/search?term=a&b'])).toContain('term=a&amp;b');
  });
});
