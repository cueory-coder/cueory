import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { site } from '../../src/config/site';

// Playwright projects cover 390, 820 and 1440 px. Run both palettes in each viewport.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`message shell: accessibility and layout in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });

    const response = await page.goto('/message');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'tell us what to fix.' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'coming soon' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'flag or comment on a page' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.locator('[data-placeholder="CHRISTIAN-TEXT"]')).toHaveText('[Christian writes this]');

    // The common footer has its own flag/report control. This page must not add a form of its own.
    await expect(page.locator('main form, main input, main select, main textarea, main button')).toHaveCount(0);
    const emailLink = page.locator('main a[href^="mailto:"]');
    await expect(emailLink).toHaveCount(1);
    await expect(emailLink).toHaveAttribute('href', `mailto:${site.contactEmail}`);
    await expect(emailLink).toBeVisible();
    const bounds = await emailLink.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);

    await emailLink.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(emailLink).toBeFocused();
    await expect(emailLink).toHaveCSS('outline-style', 'solid');

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);

    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  });
}
