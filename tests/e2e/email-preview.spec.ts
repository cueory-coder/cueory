import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('review-reminder preview is sample-only, keyboard-accessible and unindexed', async ({ page }) => {
  const response = await page.goto('/preview/email');
  expect(response?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');

  await expect(page.getByRole('heading', { level: 1, name: 'review reminder preview' })).toBeVisible();
  await expect(page.getByText('sample only. this page does not send an email or collect an address.')).toBeVisible();

  const card = page.getByTestId('review-email-card');
  await expect(card.getByRole('heading', { level: 2, name: '6 cards are ready' })).toBeVisible();
  await expect(card.getByText('module 1 · about 8 minutes')).toBeVisible();
  const review = card.getByRole('link', { name: 'review now' });
  await expect(review).toHaveAttribute('href', '/learn/study-skills/cards');
  await expect(card.getByRole('link', { name: 'unsubscribe from reminders' })).toHaveAttribute('href', '#preview-unsubscribe');
  await expect(card.getByText('verified physical mailing address required before sending.')).toBeVisible();

  const alternative = page.getByText('plain-text version', { exact: true });
  await alternative.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('review now: (sample study link)', { exact: false })).toBeVisible();

  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(audit.violations.map((v) => v.id + ': ' + v.help)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
