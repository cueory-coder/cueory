import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The welcome promo takes focus after 5 seconds. Its own spec tests that behavior.
// Keep this page-specific footer and accessibility test independent of the promo timer.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // With storage blocked, the welcome promo does not appear.
    }
  });
});

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
      // The site's footer links are intentionally closed until the visitor opens them.
      const toggle = footer.locator('[data-footer-toggle]');
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
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
