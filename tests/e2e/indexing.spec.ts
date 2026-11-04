import { expect, test, type Page } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { indexablePages } from '../../src/config/routes';

/**
 * Task 127: which pages search engines may index. `Layout.astro` writes
 * `<meta name="robots" content="noindex, nofollow">` for pages that pass `noindex`, and every other page has no robots
 * meta at all (so it is indexable). `public/robots.txt` allows everything, so this meta is the only switch.
 */

// Every preview page is noindex. Read them from the build so a new preview is covered automatically.
const previewDir = resolve('dist/preview');
const previewPages = existsSync(previewDir)
  ? readdirSync(previewDir)
      .filter((name) => name.endsWith('.html') || existsSync(resolve(previewDir, name, 'index.html')))
      .map((name) => `/preview/${name.replace(/\.html$/, '')}`)
      .sort()
  : [];

const noindexPages = [
  ...previewPages,
  '/auth/callback',
  '/reset-password',
  '/signin',
  '/signup',
  '/start',
  '/subscribed',
  '/progress',
  '/learn/video-sample',
  '/breaks', // until Christian approves its sample ideas
];

// Known gaps: pages that should be noindex but aren't yet. Listed on issue #11 for their owners; never fixed here.
const knownGaps: Record<string, string> = {
};

const robots = (page: Page) => page.locator('head meta[name="robots"]');

test.describe('Task 127: indexing', () => {
  test('the build has preview pages to check', () => {
    // A missing build or an empty preview folder should fail loudly instead of silently checking nothing.
    expect(previewPages.length).toBeGreaterThan(0);
  });

  for (const path of noindexPages) {
    test(`${path} tells search engines not to index it`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(robots(page)).toHaveCount(1);
      await expect(robots(page)).toHaveAttribute('content', /\bnoindex\b/);
    });
  }

  for (const [path, why] of Object.entries(knownGaps)) {
    test(`${path} tells search engines not to index it`, async ({ page }) => {
      test.fixme(true, why);
      await page.goto(path);
      await expect(robots(page)).toHaveAttribute('content', /\bnoindex\b/);
    });
  }

  for (const path of indexablePages) {
    test(`${path} can be indexed`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      // No robots meta means indexable; if one is ever added, it must not say noindex.
      const metas = await robots(page).evaluateAll((els) => els.map((el) => el.getAttribute('content') ?? ''));
      expect(metas.filter((content) => /\bnoindex\b/i.test(content))).toEqual([]);
    });
  }

  test('robots.txt does not block the site', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toMatch(/^\s*Disallow:\s*\/\s*$/im);
  });

  test('if a sitemap is built, no noindex page is in it', async ({ request }) => {
    const candidates = ['/sitemap-index.xml', '/sitemap.xml', '/sitemap-0.xml'];
    const found: string[] = [];
    for (const path of candidates) {
      const response = await request.get(path);
      if (response.status() === 200 && /xml/.test(response.headers()['content-type'] ?? '')) {
        found.push(await response.text());
      }
    }
    test.skip(found.length === 0, 'no sitemap is built today');
    const listed = found.join('\n');
    for (const path of [...noindexPages, ...Object.keys(knownGaps)]) {
      expect(listed, `${path} must not be in the sitemap`).not.toMatch(
        new RegExp(`<loc>[^<]*${path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/?</loc>`),
      );
    }
  });
});
