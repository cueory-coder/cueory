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

/** One visit, no reload: the page saves itself and the files it loaded before the worker could (the first visit). */
async function visitLesson(page: Page) {
  await page.goto('/learn/study-skills');
  await expect.poll(() => kept(page), { timeout: 15_000 }).toContain('/learn/study-skills');
}

test('the very first visit to a lesson is saved, so it opens again with no connection, styles included', async ({ page, context }) => {
  await visitLesson(page);
  await expect.poll(async () => (await kept(page)).some((url) => url.endsWith('.css'))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('main')).toContainText('study');
  // The styles came back too: the page is not the browser's bare unstyled document.
  expect(await page.evaluate(() => document.styleSheets.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).display)).toBe('flex');
  await context.setOffline(false);
});

test('the registration is an external file, never an inline script', async ({ page }) => {
  await page.goto('/learn/study-skills');
  expect(await page.locator('script[src="/register-sw.js"]').count()).toBe(1);
  expect(await page.evaluate(() => [...document.scripts].filter((script) => !script.src && /serviceWorker/.test(script.textContent ?? '')).length)).toBe(0);
  const file = await page.request.get('/register-sw.js');
  expect(file.headers()['content-type']).toContain('javascript');
  expect(await file.text()).toContain('/sw.js');
});

test('the play page is never kept, because today\'s puzzles are inside it', async ({ page }) => {
  await visitLesson(page);
  await page.goto('/play');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // A controller was already present before reload; that alone cannot prove its cache writes settled.
  // Explicitly fetch /play again, then use a new cacheable lesson as the worker's observable write barrier.
  await page.evaluate(async () => {
    const response = await fetch('/play');
    if (!response.ok) throw new Error('The refreshed play page must load successfully.');
    await response.text();
    const lesson = await fetch('/learn/study-skills/cards');
    if (!lesson.ok) throw new Error('The cacheable lesson must load successfully.');
    await lesson.text();
  });
  await expect.poll(() => kept(page), { timeout: 15_000 }).toContain('/learn/study-skills/cards');
  await page.waitForLoadState('networkidle');
  const urls = await kept(page);
  expect(urls.filter((url) => url.startsWith('/play'))).toEqual([]);
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
    expect(url, url).toMatch(/^\/($|learn\/|_astro\/|brand\/|fonts\/)/);
    if (url.startsWith('/learn/')) expect(url, url).not.toContain('.');
    else if (url !== '/') expect(url, url).toMatch(/\.(js|css|woff2?|svg|png|jpe?g|webp|avif|gif|ico)$/);
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
  const paragraph = page.locator('p', { hasText: 'copies of the pages you visit' });
  await expect(paragraph).toContainText('lessons and the home page');
  await expect(paragraph).toContainText('daily games are never kept');
  await expect(paragraph).not.toContainText('lessons, daily games');
});
