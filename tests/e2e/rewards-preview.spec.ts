import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const previewRoute = '/preview/rewards';

test.describe('W02-2 rewards preview', () => {
  test('shows a fixed, noindex, sample-only page with model-derived words', async ({ page }) => {
    const response = await page.goto(previewRoute);
    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.getByRole('heading', { level: 1, name: 'rewards preview' })).toHaveCount(1);
    await expect(page.getByText('fixed sample day: 2026-11-11.')).toBeVisible();
    await expect(page.getByTestId('rewards-summary-row')).toHaveCount(7);
    await expect(page.getByTestId('rewards-event')).toHaveCount(5);
    await expect(page.getByTestId('rewards-list')).toContainText('45 points earned.');
    await expect(page.getByTestId('rewards-list')).toContainText('3 days in the current streak.');
    await expect(page.getByTestId('rewards-list')).toContainText('first study session');
    await expect(page.getByTestId('rewards-unavailable')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('cueory-game-stats'))).toBeNull();
  });

  test('is usable with keyboard and tap, including a visible focus indication', async ({ page }, testInfo) => {
    await page.goto(previewRoute);
    const back = page.getByRole('link', { name: 'back to daily games' });
    const box = await back.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await back.focus();
    await expect(back).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/play\/?$/);
    await page.goto(previewRoute);
    if (testInfo.project.use.hasTouch) await back.tap();
    else await back.click();
    await expect(page).toHaveURL(/\/play\/?$/);
  });

  test('is accessible and never overflows at phone, tablet or desktop widths in both palettes', async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.goto(previewRoute);
        await expect(page.getByTestId('rewards-list')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const results = await new AxeBuilder({ page })
          .include('[data-testid="rewards-preview-page"]')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations.map((issue) => `${issue.id}: ${issue.help}`)).toEqual([]);
      }
    }
  });
});

test.describe('W02-2 rewards preview without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('renders words and the working back link on the server', async ({ page }) => {
    await page.goto(previewRoute);
    await expect(page.getByTestId('rewards-list')).toContainText('45 points earned.');
    const back = page.getByRole('link', { name: 'back to daily games' });
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/play\/?$/);
  });
});
