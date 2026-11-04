import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { expect, test } from '@playwright/test';

const dist = resolve('dist');
const missing = '/no-javascript-route-does-not-exist';

/** Use the built output, so newly added routes cannot silently miss the no-JS check. */
function builtRoutes(directory = dist): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '_astro' || entry.name === 'pagefind') return [];
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return builtRoutes(file);
    if (!entry.isFile() || !entry.name.endsWith('.html')) return [];
    const name = relative(dist, file).split(sep).join('/');
    if (name === '404.html') return [missing];
    if (name === 'index.html') return ['/'];
    return ['/' + name.replace(/(?:\/index)?\.html$/, '')];
  });
}

const routes = [...new Set(builtRoutes())].sort();

// These are optional enhancements, not primary page content. The remaining
// client-only islands must explain what can be done when JavaScript is off.
const optionalIslands = new Set(['ContinueBar', 'GameStatsPanel', 'GuestImportOffer']);

test.describe('Task 231: all built routes without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  // Reuse each JavaScript-disabled browser page for a small group of routes.
  // This preserves the all-route checks without adding a new browser context
  // for every page, which can make CI exceed its 15-minute job limit.
  const batchSize = 20;
  for (let start = 0; start < routes.length; start += batchSize) {
    const batch = routes.slice(start, start + batchSize);
    test(`routes ${start + 1}–${start + batch.length} keep content and fallbacks`, async ({ page }, testInfo) => {
      test.skip(!['phone', 'desktop'].includes(testInfo.project.name), 'Phone and desktop Chromium coverage');
      test.setTimeout(120_000);

      for (const route of batch) {
        await test.step(route, async () => {
          const response = await page.goto(route);
          expect(response?.status(), route).toBe(route === missing ? 404 : 200);

          const main = page.getByRole('main');
          await expect(main).toBeVisible();
          expect((await main.innerText()).trim().length, route + ': main must not be blank').toBeGreaterThan(0);

          for (const island of await main.locator('astro-island[client="only"]').all()) {
            const options = JSON.parse((await island.getAttribute('opts')) ?? '{}') as { name?: string };
            const name = options.name ?? 'unnamed client-only island';
            if (optionalIslands.has(name)) continue;

            // Require a local fallback: either next to the island or next to a
            // wrapper containing exactly one island. Never accept a fallback
            // shared by multiple islands or a generic page-level message.
            const directFallback = island.locator('xpath=following-sibling::*[1][self::noscript]');
            const wrapperFallback = island.locator(
              'xpath=parent::*[count(./astro-island[@client="only"])=1]/following-sibling::*[1][self::noscript]',
            );
            const fallback = await directFallback.count() === 1 ? directFallback : wrapperFallback;
            await expect(fallback, route + ': ' + name + ' needs a local no-JavaScript fallback').toHaveCount(1);

            // Playwright text queries intentionally exclude <noscript>. Inspect
            // its parsed child markup directly while JavaScript is disabled.
            const content = fallback.locator(':scope > *').first();
            await expect(content, route + ': ' + name + ' fallback must be visible').toBeVisible();
            expect((await content.textContent() ?? '').trim().length, route + ': ' + name + ' fallback must explain something')
              .toBeGreaterThan(0);
          }
        });
      }
    });
  }
});
