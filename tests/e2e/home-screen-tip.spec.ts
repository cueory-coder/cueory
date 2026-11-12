import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const KEY = 'cueory-home-screen-tip';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // storage blocked
    }
  });
});

test('no tip before puzzles were finished on 3 different days', async ({ page }) => {
  await page.goto('/play');
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ days: ['2026-11-01', '2026-11-02'], dismissed: false })), KEY);
  await page.reload();
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByTestId('home-screen-tip')).toHaveCount(0);
});

test('tip shows after 3 days, passes axe, and stays hidden once dismissed by keyboard', async ({ page }) => {
  await page.goto('/play');
  await page.evaluate(
    (key) => localStorage.setItem(key, JSON.stringify({ days: ['2026-11-01', '2026-11-02', '2026-11-03'], dismissed: false })),
    KEY,
  );
  await page.reload();
  const tip = page.getByTestId('home-screen-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('iPhone');
  await expect(tip).toContainText('Android');
  const results = await new AxeBuilder({ page }).include('[data-testid="home-screen-tip"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
  const hide = page.getByTestId('home-screen-tip-dismiss');
  const box = await hide.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await hide.focus();
  await page.keyboard.press('Enter');
  await expect(tip).toHaveCount(0);
  await page.reload();
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByTestId('home-screen-tip')).toHaveCount(0);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').dismissed, KEY)).toBe(true);
});

test('tip dismisses by tap', async ({ page }) => {
  await page.goto('/play');
  await page.evaluate(
    (key) => localStorage.setItem(key, JSON.stringify({ days: ['2026-11-01', '2026-11-02', '2026-11-03'], dismissed: false })),
    KEY,
  );
  await page.reload();
  await page.getByTestId('home-screen-tip-dismiss').click();
  await expect(page.getByTestId('home-screen-tip')).toHaveCount(0);
});
