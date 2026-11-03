import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

for (const viewport of viewports) {
  test.describe(`/disclaimer at ${viewport.name} size`, () => {
    test(`shows its disclaimer heading, placeholder, and legal links`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const response = await page.goto('/disclaimer');
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle('disclaimer · cueory');
      await expect(page.getByRole('heading', { level: 1, name: 'disclaimer' })).toBeVisible();
      await expect(page.getByText('Placeholder: Disclaimer text')).toBeVisible();
      await expect(page.getByText('Christian: paste your disclaimer here.')).toBeVisible();

      const footer = page.getByRole('contentinfo');
      for (const link of [
        { name: 'privacy', href: '/privacy' },
        { name: 'terms', href: '/terms' },
        { name: 'disclaimer', href: '/disclaimer' },
        { name: 'support cueory', href: '/support' },
      ]) {
        await expect(footer.getByRole('link', { name: link.name, exact: true })).toHaveAttribute('href', link.href);
      }

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    test('passes the page accessibility check', async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/disclaimer');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
    });
  });
}
