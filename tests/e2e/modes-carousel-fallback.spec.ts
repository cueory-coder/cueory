import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Prevent the one-time welcome panel from taking focus during a carousel test.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // Storage may be unavailable. The carousel must still use the plain links.
    }
  });
});

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

for (const viewport of viewports) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`no showModal: ${viewport.name}, ${colorScheme}, links remain usable by keyboard and tap`, async ({ page }, testInfo) => {
      await page.addInitScript(() => {
        Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
          configurable: true,
          value: undefined,
        });
      });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');

      const section = page.locator('#ways-to-study');
      await section.scrollIntoViewIfNeeded();
      await expect(section).not.toHaveAttribute('data-ring', '');
      await expect(section.locator('[data-modes-controls]')).toHaveClass(/invisible/);
      await expect(section.locator('[data-mode-open]:visible')).toHaveCount(0);

      const link = section.getByRole('link', { name: 'try the cards' });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', '/learn/study-skills/cards');
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      const audit = await new AxeBuilder({ page })
        .include('#ways-to-study')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(audit.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);

      // The track is keyboard-focusable in the plain carousel; the first available link follows it.
      await section.locator('[data-modes-track]').focus();
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      expect(await link.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/learn\/study-skills\/cards\/?$/);

      // Re-enter the fallback carousel and confirm pointer/touch navigation too.
      await page.goto('/');
      const again = page.locator('#ways-to-study').getByRole('link', { name: 'try the cards' });
      await expect(again).toBeVisible();
      if (testInfo.project.use.hasTouch) await again.tap();
      else await again.click();
      await expect(page).toHaveURL(/\/learn\/study-skills\/cards\/?$/);
    });
  }
}

test('with native preview support, the original ring and its modal still work', async ({ page }) => {
  await page.goto('/');
  const section = page.locator('#ways-to-study');
  await section.scrollIntoViewIfNeeded();
  await expect(section).toHaveAttribute('data-ring', '');
  await expect(section.locator('[data-modes-controls]')).not.toHaveClass(/invisible/);
  const opening = section.locator('#mode-video [data-mode-open]');
  await expect(opening).toBeVisible();
  await opening.click();
  await expect(page.getByRole('dialog', { name: 'video' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#mode-preview')).toBeHidden();
});

test('without Web Animations, the ordinary study links stay visible', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: undefined });
  });
  await page.goto('/');
  const section = page.locator('#ways-to-study');
  await expect(section).not.toHaveAttribute('data-ring', '');
  await expect(section.getByRole('link', { name: 'try the cards' })).toBeVisible();
});
