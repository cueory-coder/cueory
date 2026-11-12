import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const colorScheme of ['light', 'dark'] as const) {
  test(`unavailable lesson system cannot highlight a fallback structure (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto('/preview/anatomy-lab?fixture&system=missing-system&structure=FIX001');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    const target = page.getByRole('button', { name: 'fixture cube A', exact: true });
    await expect(target).toBeEnabled({ timeout: 20_000 });
    await expect(target).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('selected fixture cube A', { exact: true })).toHaveCount(0);
  });

  test(`matching lesson system selects its own loaded structure once (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto('/preview/anatomy-lab?fixture&system=fixture&structure=FIX001');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    const target = page.getByRole('button', { name: 'fixture cube A', exact: true });
    await expect(target).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
    await page.getByRole('button', { name: 'fixture cube B', exact: true }).click();
    await expect(target).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'fixture cube B', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations).toEqual([]);
  });
}
