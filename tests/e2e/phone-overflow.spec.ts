import { expect, test } from '@playwright/test';
import { builtPages } from './built-pages';

const missingPage = '/task-188-phone-page-does-not-exist';
const pages = builtPages(missingPage);

for (const width of [320, 390]) {
  for (const route of pages) {
    test(`${route} fits a ${width}px phone`, async ({ page, browserName }, testInfo) => {
      test.skip(browserName !== 'chromium' || testInfo.project.name !== 'phone', 'Chromium phone sweep');
      await page.setViewportSize({ width, height: 844 });
      const response = await page.goto(route);
      expect(response?.status()).toBe(route === missingPage ? 404 : 200);
      // Include client-only study screens and their fetched sample content.
      await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(() => {
        const root = document.documentElement;
        const elements = [...document.querySelectorAll<HTMLElement>('body, body *')]
          .filter((element) => element.getClientRects().length > 0)
          .map((element) => {
            const bounds = element.getBoundingClientRect();
            return {
              element: element.tagName.toLowerCase() + (element.id ? '#' + element.id : '') +
                [...element.classList].map((name) => '.' + name).join(''),
              width: bounds.width, left: bounds.left, right: bounds.right,
            };
          });
        return {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          widest: elements.sort((a, b) => b.width - a.width)[0] ?? null,
          beyondViewport: elements.filter((element) => element.right > root.clientWidth || element.left < 0)
            .sort((a, b) => b.right - a.right).slice(0, 5),
        };
      });
      expect(result.scrollWidth, `${route} at ${width}px: ${JSON.stringify(result)}`).toBeLessThanOrEqual(result.clientWidth);
    });
  }
}
