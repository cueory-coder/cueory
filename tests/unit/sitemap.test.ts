import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { indexablePages } from '../../src/config/routes';
import { GET, pageSourcePath, routeDeclaresNoindex, sitemapPages, sitemapXml, sourceDeclaresNoindex } from '../../src/pages/sitemap.xml';

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

  it('rejects noindex routes even when someone mistakenly supplies them to the sitemap', () => {
    const xml = sitemapXml(['/', '/signin', '/privacy', '/preview/states']);
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]))
      .toEqual(['https://cueory.app/']);
    expect(routeDeclaresNoindex('/signin')).toBe(true);
    expect(routeDeclaresNoindex('/preview/states')).toBe(true);
    expect(routeDeclaresNoindex('/')).toBe(false);
  });

  it('finds the source for static and generated lesson routes', () => {
    expect(pageSourcePath('/learn/study-skills/label-it')?.replaceAll('\\', '/'))
      .toMatch(/src\/pages\/learn\/study-skills\/label-it\.astro$/);
    expect(pageSourcePath('/learn/study-skills/cards')?.replaceAll('\\', '/'))
      .toMatch(/src\/pages\/learn\/\[lesson\]\/cards\.astro$/);
  });

  it('detects only Layout noindex, including a conditional value', () => {
    expect(sourceDeclaresNoindex('<!-- <Layout noindex /> --><Layout title="public" />')).toBe(false);
    expect(sourceDeclaresNoindex('<Layout title="private" noindex />')).toBe(true);
    expect(sourceDeclaresNoindex('<Layout title="private" noindex={page.noindex} />')).toBe(true);
    expect(sourceDeclaresNoindex('<Layout title="public" noindex={false} />')).toBe(false);
    expect(sourceDeclaresNoindex('<Layout title="public" description="noindex is a word" />')).toBe(false);
  });

  it('ignores > inside attribute values and recognizes a tight noindex/> attribute', () => {
    expect(sourceDeclaresNoindex('<Layout description={a > b ? "yes" : "no"} noindex />')).toBe(true);
    expect(sourceDeclaresNoindex('<Layout description="a > b" noindex/>')).toBe(true);
    expect(sourceDeclaresNoindex('<Layout description={"text with >"} noindex/>')).toBe(true);
    expect(sourceDeclaresNoindex('<Layout title="public" noindex={false}/>')).toBe(false);
    expect(sourceDeclaresNoindex('<Layout description="some noindex words" />')).toBe(false);
    expect(sourceDeclaresNoindex('<Layout description={"some noindex words"} />')).toBe(false);
    expect(sourceDeclaresNoindex('{/* <Layout noindex /> */}<Layout title="public" />')).toBe(false);
    expect(sourceDeclaresNoindex('<Layout title="public" description={a > b} />')).toBe(false);
    expect(sourceDeclaresNoindex('<Layout description={{ text: "noindex" }} title="public" />')).toBe(false);
    expect(sourceDeclaresNoindex('<Layout description={a > b} noindex={page.hidden}/>')).toBe(true);
  });

  it('fails closed when a page source is missing or outside the site', () => {
    expect(pageSourcePath('/this-page-does-not-exist')).toBeUndefined();
    expect(routeDeclaresNoindex('/this-page-does-not-exist')).toBe(true);
    expect(routeDeclaresNoindex('/invalid_%')).toBe(true);
    expect(routeDeclaresNoindex('https://unrelated.example/play')).toBe(true);
    const xml = sitemapXml(['/', '/this-page-does-not-exist', 'https://unrelated.example/play']);
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]))
      .toEqual(['https://cueory.app/']);
  });

  it('excludes noindex pages from sitemapPages as well as sitemapXml', async () => {
    const pages = await sitemapPages();
    expect(pages).toEqual(indexablePages);
    expect(pages.every((page) => !routeDeclaresNoindex(page))).toBe(true);
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
    expect(sitemapXml(['/?term=a&b'])).toContain('term=a&amp;b');
  });
});
