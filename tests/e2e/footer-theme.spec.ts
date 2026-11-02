import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Suppress the promo panel so it doesn't interfere with keyboard focus.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // Storage blocked: panel never shows anyway.
    }
  });
});

test.describe('footer theme picker', () => {
  test('theme switch updates the page and persists across navigation', async ({ page }) => {
    await page.goto('/');

    // The picker is hidden until JS runs; wait for it.
    const picker = page.locator('[data-theme-picker]');
    await expect(picker).toBeVisible();

    // Switch to dark.
    await picker.locator('input[value="dark"]').check({ force: true });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Navigate away and back; the choice should survive.
    await page.goto('/privacy');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // The picker on the new page should reflect the saved choice.
    const picker2 = page.locator('[data-theme-picker]');
    await expect(picker2).toBeVisible();
    const dark = picker2.locator('input[value="dark"]');
    await expect(dark).toBeChecked();

    // Switch back to device and confirm the attribute is removed.
    await picker2.locator('input[value="device"]').check({ force: true });
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  });

  test('keyboard arrows move between theme options', async ({ page }) => {
    await page.goto('/');

    const picker = page.locator('[data-theme-picker]');
    await expect(picker).toBeVisible();

    // Focus the currently-checked radio.
    const lightInput = picker.locator('input[value="light"]');
    const darkInput = picker.locator('input[value="dark"]');
    const deviceInput = picker.locator('input[value="device"]');

    await lightInput.check({ force: true });
    await lightInput.focus();

    // Arrow right selects the next radio.
    await page.keyboard.press('ArrowRight');
    await expect(darkInput).toBeChecked();

    await page.keyboard.press('ArrowRight');
    await expect(deviceInput).toBeChecked();

    // Arrow left goes back.
    await page.keyboard.press('ArrowLeft');
    await expect(darkInput).toBeChecked();
  });

  for (const size of [
    { width: 375, height: 812, label: 'phone' },
    { width: 768, height: 1024, label: 'tablet' },
    { width: 1280, height: 800, label: 'desktop' },
  ]) {
    test(`axe clean in daytime palette at ${size.label} width`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/');

      const picker = page.locator('[data-theme-picker]');
      await expect(picker).toBeVisible();
      // Make sure light (daytime) theme is active.
      await picker.locator('input[value="light"]').check({ force: true });

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });

    test(`axe clean in evening palette at ${size.label} width`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/');

      const picker = page.locator('[data-theme-picker]');
      await expect(picker).toBeVisible();
      await picker.locator('input[value="dark"]').check({ force: true });
      // Allow the theme transition to settle.
      await page.waitForTimeout(50);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }

  test('footer contains the copyright line, contact email, and nav links', async ({ page }) => {
    await page.goto('/');

    const footer = page.locator('footer');
    await expect(footer.getByText(/cueory/i)).toBeVisible();
    await expect(footer.getByText(/study help, not medical advice/i)).toBeVisible();
    await expect(footer.getByRole('link', { name: 'hello@cueory.app' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'privacy' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'terms' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'disclaimer' })).toBeVisible();
    await expect(footer.getByRole('link', { name: /support/i })).toBeVisible();
  });
});
