import { expect, test, type Page } from '@playwright/test';
import { indexablePages } from '../../src/config/routes';

const noindexPages = ['/breaks', '/progress', '/signin', '/signup', '/start', '/subscribed'];
const routes = [...new Set([...indexablePages, ...noindexPages])];

async function waitForPageInitialization(page: Page, route: string): Promise<void> {
  try {
    await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0, undefined, {
      timeout: 10_000,
    });
  } catch {
    throw new Error(`${route}: islands did not finish loading within 10 s`);
  }
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
    throw new Error(`${route}: network requests did not settle within 10 s`);
  });
}

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
      await waitForPageInitialization(page, route);
      expect(response?.status(), route).toBe(200);
      expect(errors, `${route}: page errors`).toEqual([]);
    });
  }
});
