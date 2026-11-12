import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // Blocked storage must not break the organizer itself.
    }
  });
});

const sizes = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

for (const size of sizes) {
  for (const theme of ['light', 'dark'] as const) {
    test(`organizer retry, focus and accessibility: ${size.name} ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto('/learn/study-skills/organizer');

      // Explicitly select the desired palette rather than relying on device defaults.
      await page.getByRole('button', { name: 'show footer links', exact: true }).click();
      await page.getByRole('radio', { name: theme, exact: true }).check();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

      const board = page.getByTestId('organizer');
      const feedback = board.getByTestId('organizer-live');
      const apple = board.getByRole('button', { name: /^apple(?:\s|$)/ });
      const check = board.getByRole('button', { name: 'check', exact: true });

      // Wrong keyboard placement should return to tray and focus the result words.
      await apple.focus();
      await page.keyboard.press('2');
      await expect(board.getByRole('list', { name: 'vegetable' }).getByRole('button', { name: /^apple/ })).toBeVisible();
      await check.focus();
      await page.keyboard.press('Enter');
      await expect(feedback).toHaveText('0 right, 1 back in the tray to try again.');
      await expect(feedback).toBeFocused();
      await expect(board.getByRole('list', { name: 'tray' }).getByRole('button', { name: /^apple/ })).toBeVisible();

      // The returned item can be corrected and checked again.
      await apple.focus();
      await page.keyboard.press('1');
      await expect(board.getByRole('list', { name: 'fruit' }).getByRole('button', { name: /^apple/ })).toBeVisible();
      await check.focus();
      await page.keyboard.press('Enter');
      await expect(feedback).toHaveText('1 right, 0 back in the tray to try again.');
      await expect(feedback).toBeFocused();
      await expect(board.getByRole('progressbar', { name: 'organizer progress' })).toHaveAttribute('aria-valuenow', '1');

      // Touch users have the same retry path as keyboard users.
      const pear = board.getByRole('button', { name: /^pear(?:\s|$)/ });
      const fruit = board.getByRole('button', { name: '1. fruit', exact: true });
      if (testInfo.project.use.hasTouch) {
        await pear.tap();
        await fruit.tap();
        await check.tap();
      } else {
        await pear.click();
        await fruit.click();
        await check.click();
      }
      await expect(feedback).toHaveText('1 right, 0 back in the tray to try again.');
      await expect(feedback).toBeFocused();
      await expect(board.getByRole('progressbar', { name: 'organizer progress' })).toHaveAttribute('aria-valuenow', '2');

      const buttonBox = await check.boundingBox();
      expect(buttonBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(buttonBox?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const report = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(report.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
}
