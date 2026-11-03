import { expect, test } from '@playwright/test';
import { indexablePages } from '../../src/config/routes';

const noindexPages = ['/breaks', '/progress', '/signin', '/signup', '/start', '/subscribed'];
const routes = [...new Set([...indexablePages, ...noindexPages])];

test.describe('pages with blocked browser storage', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('storage is blocked', 'SecurityError');
        },
      });
    });
  });

  for (const route of routes) {
    test(`${route} renders without a storage exception`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      expect(errors, `${route}: page errors`).toEqual([]);
    });
  }
});
