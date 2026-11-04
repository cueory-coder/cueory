import { describe, expect, it } from 'vitest';
import { indexablePages } from '../../src/config/routes';
import { sitemapXml } from '../../src/pages/sitemap.xml';

const noindexPages = ['/auth/callback', '/reset-password', '/signin', '/signup', '/start', '/subscribed', '/progress', '/breaks', '/account/two-factor'];

describe('sitemap', () => {
  it('lists every indexable page and no noindex page', () => {
    const xml = sitemapXml();
    const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

    expect(listed).toEqual(indexablePages.map((page) => `https://cueory.app${page}`));
    for (const page of noindexPages) expect(listed).not.toContain(`https://cueory.app${page}`);
  });

  it('escapes XML values in the generated loc', () => {
    expect(sitemapXml(['/search?term=a&b'])).toContain('term=a&amp;b');
  });
});
