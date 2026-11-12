import { expect, test } from '@playwright/test';

const missingPage = '/task-401-page-that-does-not-exist';

test.describe('404 page-specific behavior', () => {
  test('shows the page shell, searchable destinations, and working quick links', async ({ page }) => {
    const response = await page.goto(missingPage);
    expect(response?.status()).toBe(404);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText("that page isn't here.");
    await expect(page.locator('main > section')).toHaveCount(1);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');

    const search = page.getByRole('search', { name: 'search cueory' });
    const searchbox = search.getByRole('searchbox', { name: 'search cueory' });
    await expect(searchbox).toHaveAttribute('aria-controls', 'not-found-search-results');
    await expect(searchbox).toHaveAttribute('aria-describedby', 'not-found-search-status');
    await expect(search.getByRole('status')).toHaveAttribute('aria-live', 'polite');

    const links = page.locator('main nav[aria-label="other places to go"] a');
    await expect(links).toHaveCount(4);
    for (const link of await links.all()) {
      const href = await link.getAttribute('href');
      expect(href).toMatch(/^\/(?:learn|play|support)?$/);
      const destination = await page.request.get(href!);
      expect(destination.status(), href!).toBe(200);
    }
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('keeps the recovery links visible', async ({ page }) => {
      const response = await page.goto(missingPage);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('noscript p')).toHaveText('search needs JavaScript. the links below still work.');
      await expect(page.locator('main nav[aria-label="other places to go"] a')).toHaveCount(4);
      await expect(page.locator('[data-404-results]')).toHaveAttribute('hidden', '');
    });
  });
});
