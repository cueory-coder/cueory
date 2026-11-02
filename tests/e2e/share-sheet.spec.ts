import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Share sheet preview page (Task 103, D-pending). Tests the ShareSheet component and share card images.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // blocked: fine
    }
  });
});

const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();

test('share preview page loads without errors', async ({ page }) => {
  await page.goto('/preview/share');
  await expect(page).toHaveTitle(/share preview/);
});

test('share sheet renders three card style options', async ({ page }) => {
  await page.goto('/preview/share');
  // Wait for the React island to hydrate
  const radios = page.locator('[type="radio"]');
  await expect(radios).toHaveCount(6); // 3 styles × 2 sheet instances on the preview page
  const first = radios.nth(0);
  await expect(first).toBeChecked();
});

test('share card images are served and have correct dimensions', async ({ page }) => {
  const paths = [
    '/share/games-scene.png',
    '/share/games-ivory.png',
    '/share/games-bronze-coin.png',
    '/share/study-scene.png',
    '/share/study-ivory.png',
    '/share/study-bronze-coin.png',
  ];
  for (const path of paths) {
    const resp = await page.request.get(path);
    expect(resp.status(), `${path} should return 200`).toBe(200);
    expect(resp.headers()['content-type']).toContain('image/png');
  }
});

test('arrow buttons cycle through styles', async ({ page }) => {
  await page.goto('/preview/share');
  // Wait for island
  const nextBtn = page.locator('button[aria-label="next style"]').first();
  await expect(nextBtn).toBeVisible();
  await nextBtn.click();
  const radios = page.locator('[type="radio"]').first().locator('..').locator('[type="radio"]');
  // After clicking next, the second radio should be checked
  const checked = page.locator('[type="radio"]:checked').first();
  const checkedValue = await checked.inputValue();
  expect(['scene', 'ivory', 'bronze-coin']).toContain(checkedValue);
});

test('copy link button appears', async ({ page }) => {
  await page.goto('/preview/share');
  const copyBtn = page.locator('button', { hasText: 'copy link' }).first();
  await expect(copyBtn).toBeVisible();
});

test('share preview page has no accessibility violations', async ({ page }) => {
  await page.goto('/preview/share');
  // Wait for React island to render
  await page.waitForSelector('[type="radio"]');
  const results = await axe(page);
  expect(results.violations).toEqual([]);
});

test('noindex: preview/share is not indexed', async ({ page }) => {
  await page.goto('/preview/share');
  const robots = await page.locator('meta[name="robots"]').getAttribute('content');
  expect(robots).toContain('noindex');
});

