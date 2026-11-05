import { expect, test } from '@playwright/test';

// Regression for static Astro output paths such as /index.html and /privacy.html.
// Cloudflare serves these pages under extensionless public URLs.
test('public pages expose extensionless canonical URLs', async ({ page }) => {
  for (const route of ['/', '/privacy', '/support', '/learn/study-skills']) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
      'href',
      new URL(route, 'https://cueory.app').href,
    );
  }
});
