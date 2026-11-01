import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// "Tip" became "supporting our mission" (Christian, D-94). His two mission lines appear exactly, and no visible text
// on the page calls it a tip any more.

const missionLines = [
  'to make studying for nursing school simpler.',
  'to give nursing students the materials they need to succeed and become great nurses at an affordable price.',
];

test.describe('supporting our mission (/support)', () => {
  test('shows the mission in Christian\'s words, with a button that says it opens a new tab', async ({ page }) => {
    // Nothing leaves the test machine.
    await page.context().route(/ko-fi\.com/, (route) => route.abort());
    await page.goto('/support');

    await expect(page.getByRole('heading', { level: 1, name: 'supporting our mission' })).toBeVisible();
    await expect(page).toHaveTitle(/supporting our mission/);
    const lines = page.locator('[data-mission] li');
    await expect(lines).toHaveText(missionLines);

    const button = page.getByRole('link', { name: 'support our mission (opens in a new tab)' });
    await expect(button).toHaveAttribute('href', 'https://ko-fi.com/cueory');
    await expect(button).toHaveAttribute('target', '_blank');
    await expect(button).toHaveAttribute('rel', 'noopener noreferrer');

    const words = await page.locator('main').innerText();
    expect(words).not.toMatch(/\btips?\b/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('passes the accessibility checks', async ({ page }) => {
    await page.goto('/support');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
