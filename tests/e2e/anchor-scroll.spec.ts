import { expect, test } from '@playwright/test';

const anchors = ['how-it-works', 'ways-to-study', 'daily-games', 'study-features', 'signup'] as const;

test.describe('same-page anchors', () => {
  for (const id of anchors) {
    test(`#${id} reaches its home section without overlay obstruction`, async ({ page }) => {
      await page.goto(`/#${id}`);
      const target = page.locator(`#${id}`);

      await expect(target).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));

      // The home header is an absolute hero overlay, NOT the sticky header used on other routes.
      await expect(page.locator('header[data-scroll-header]')).toHaveCount(0);
      const measurements = await target.evaluate((element) => {
        const targetBox = element.getBoundingClientRect();
        const headerBox = document.querySelector('header')?.getBoundingClientRect();
        return {
          top: targetBox.top,
          bottom: targetBox.bottom,
          viewportHeight: window.innerHeight,
          overlayBottom: headerBox?.bottom ?? 0,
        };
      });

      // The fragment's section must intersect the viewport. If the hero overlay remains
      // in view, it must not cover the section's beginning.
      expect(measurements.bottom, id).toBeGreaterThan(0);
      expect(measurements.top, id).toBeLessThan(measurements.viewportHeight);
      if (measurements.overlayBottom > 0) {
        expect(measurements.top, id).toBeGreaterThanOrEqual(measurements.overlayBottom - 1);
      }
    });
  }
});
