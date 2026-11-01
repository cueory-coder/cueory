import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const missingPage = '/this-page-does-not-exist-task-89';

test('a missing address shows a useful branded 404 page', async ({ page }) => {
  const response = await page.goto(missingPage);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: "that page isn't here." })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');

  const main = page.locator('main');
  const nav = main.getByRole('navigation', { name: 'other places to go' });
  await expect(nav.getByRole('link', { name: 'home' })).toHaveAttribute('href', '/');
  await expect(nav.getByRole('link', { name: 'learn' })).toHaveAttribute('href', '/learn/study-skills');
  await expect(nav.getByRole('link', { name: 'play' })).toHaveAttribute('href', '/play');
  await expect(nav.getByRole('link')).toHaveCount(3);
});

test('the labeled search uses the site index and stays keyboard accessible', async ({ page }) => {
  await page.goto(missingPage);
  const search = page.getByRole('search', { name: 'search cueory' });
  const input = search.getByRole('searchbox', { name: 'search cueory' });
  await expect(input).toBeVisible();
  await input.focus();
  await expect(input).toBeFocused();

  await input.fill('privacy');
  const results = search.getByRole('list', { name: 'search results' });
  const firstResult = results.getByRole('link').first();
  await expect(firstResult).toBeVisible({ timeout: 15000 });
  await input.press('ArrowDown');
  await expect(firstResult).toBeFocused();
  await firstResult.press('ArrowUp');
  await expect(input).toBeFocused();

  await input.fill('zxqvjkpwrmntbfyhlc');
  await expect(search.getByRole('status')).toContainText('no results for', { timeout: 15000 });
  await expect(results).toBeHidden();

  await input.fill('');
  await expect(search.getByRole('status')).toBeEmpty();
});

test('the missing-page experience passes accessibility and layout checks', async ({ page }) => {
  await page.goto(missingPage);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const links = page.locator('main nav[aria-label="other places to go"] a');
  for (const link of await links.all()) {
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
