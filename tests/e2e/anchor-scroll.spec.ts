import { expect, test } from '@playwright/test';

const anchors = ['how-it-works', 'ways-to-study', 'daily-games', 'study-features', 'signup'] as const;

test.describe('same-page anchors', () => {
  for (const id of anchors) {
    test(`#${id} clears the sticky header`, async ({ page }) => {
      await page.goto(`/#${id}`);
      const target = page.locator(`#${id}`);
      const header = page.locator('header[data-scroll-header]');

      await expect(target).toBeVisible();
      await expect(header).toBeVisible();

      const measurements = await page.evaluate((targetId) => {
        const element = document.getElementById(targetId);
        const stickyHeader = document.querySelector<HTMLElement>('header[data-scroll-header]');
        if (!element || !stickyHeader) throw new Error('anchor target or sticky header is missing');
        const targetStyle = getComputedStyle(element);
        const targetBox = element.getBoundingClientRect();
        const headerBox = stickyHeader.getBoundingClientRect();
        return {
          scrollMarginTop: targetStyle.scrollMarginTop,
          targetTop: targetBox.top,
          headerBottom: headerBox.bottom,
        };
      }, id);

      expect(measurements.scrollMarginTop, id).not.toBe('0px');
      expect(measurements.targetTop, id).toBeGreaterThanOrEqual(measurements.headerBottom - 1);
    });
  }
});
