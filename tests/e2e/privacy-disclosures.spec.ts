import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('privacy data disclosures remain readable and accessible', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cueory-promo-seen', String(Date.now())));
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'privacy, in plain language' })).toBeVisible();
  await expect(page.locator('code').filter({ hasText: /^cueory-sudoku-settings$/ })).toBeVisible();
  await expect(page.locator('code').filter({ hasText: /^cueory-finals-survey-dismissed$/ })).toBeVisible();
  for (const table of ['profiles', 'exam_plans', 'attempts', 'review_state', 'study_events', 'concepts', 'items', 'item_versions', 'item_choices']) {
    await expect(page.locator(`[data-privacy-table="${table}"]`)).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.locator('a[href="#main"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  await page.keyboard.press('Tab');
  await expect(page.locator('#main a').first()).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
