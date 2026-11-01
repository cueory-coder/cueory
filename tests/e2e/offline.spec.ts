import { expect, test, type Page } from '@playwright/test';

// The offline service worker (ROADMAP Task 5). Every other test runs with service workers blocked (playwright.config.ts),
// because a worker answers requests before a test's page.route() would see them.
test.use({ serviceWorkers: 'allow' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // Storage is blocked: the panel never shows then anyway.
    }
  });
});

/** Every address the worker has kept, across its caches. */
const kept = (page: Page) =>
  page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) urls.push(new URL(request.url).pathname + new URL(request.url).search);
    }
    return urls;
  });

/** Loads the lesson until the worker controls the page and has kept it (the first load happens before it is ready). */
async function visitLesson(page: Page) {
  await page.goto('/learn/study-skills');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => kept(page)).toContain('/learn/study-skills');
}

test('a lesson visited once opens again with no connection', async ({ page, context }) => {
  await visitLesson(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('main')).toContainText('study');
  await context.setOffline(false);
});

test('it keeps only pages and built files from this site, never a query string or a private page', async ({ page }) => {
  await visitLesson(page);
  await page.evaluate(async () => {
    for (const path of ['/learn/study-skills?token=abc', '/learn/study-skills?x=1', '/progress', '/start', '/admin']) {
      await fetch(path).catch(() => undefined);
    }
  });
  const urls = await kept(page);
  expect(urls).toContain('/learn/study-skills');
  expect(urls.some((url) => url.startsWith('/_astro/'))).toBe(true);
  for (const url of urls) {
    expect(url, url).not.toContain('?');
    expect(url, url).toMatch(/^\/($|learn\/|play$|_astro\/|brand\/|fonts\/)/);
  }
  expect(await page.evaluate(() => caches.keys())).toEqual([expect.stringMatching(/^cueory-offline-[A-Za-z0-9-]+$/)]);
});

test('a page that was never visited fails the way it would without a worker', async ({ page, context }) => {
  await visitLesson(page);
  await context.setOffline(true);
  const failed = await page.evaluate(() => fetch('/learn/study-skills/matching').then(() => false, () => true));
  expect(failed).toBe(true);
  await context.setOffline(false);
});

test('the privacy page says pages may be kept on the device', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.locator('main')).toContainText('copies of the pages you visit');
});
