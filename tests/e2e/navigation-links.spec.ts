import { expect, test } from '@playwright/test';
import { footerLinks, menuLinks, menuSmallLinks } from '../../src/config/site';

// Keyboard theme behavior is already covered by footer-theme.spec.ts. This
// regression adds actual navigation for each configured internal destination.
for (const surface of ['footer', 'menu'] as const) {
  const links = surface === 'footer' ? footerLinks : [...menuLinks, ...menuSmallLinks];
  for (const href of [...new Set(links.map(link => link.href))].filter(href => href.startsWith('/'))) {
    test(`${surface} opens ${href}`, async ({ page }) => {
      await page.addInitScript(() => {
        try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* blocked storage */ }
      });
      await page.goto('/privacy');
      if (surface === 'footer') {
        await page.getByRole('contentinfo').locator('[data-footer-toggle]').click();
      } else {
        await page.getByRole('button', { name: 'open site menu', exact: true }).click();
      }
      const root = surface === 'footer' ? page.getByRole('contentinfo') : page.getByTestId('site-menu');
      const destination = root.locator(`a[href=${JSON.stringify(href)}]`).first();
      await expect(destination).toBeVisible();
      const expected = new URL(href, page.url()).href;
      await destination.click();
      await expect(page).toHaveURL(expected);
      await expect(page.locator('main')).toBeVisible();
    });
  }
}
