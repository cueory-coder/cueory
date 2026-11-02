import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { site } from '../../src/config/site';

// D-94: preserve Christian's approved wording, including punctuation, in the new page layout.
const missionLines = [
  'to make studying for nursing school simpler.',
  'to give nursing students the materials they need to succeed and become great nurses at an affordable price.',
];

test.describe('supporting our mission (/support)', () => {
  test('shows the mission in Christian\'s words, with a button that says it opens a new tab', async ({ page }) => {
    // Nothing leaves the test machine.
    await page.context().route('https://ko-fi.com/**', (route) => route.abort());
    await page.goto('/support');

    await expect(page.getByRole('heading', { level: 1, name: 'supporting our mission' })).toBeVisible();
    await expect(page).toHaveTitle(/supporting our mission/);
    const lines = page.locator('[data-mission] li');
    await expect(lines).toHaveText(missionLines);

    const button = page.getByRole('link', { name: 'support our mission (opens in a new tab)' });
    await expect(button).toHaveAttribute('href', site.tipPageUrl);
    await expect(button).toHaveAttribute('target', '_blank');
    await expect(button).toHaveAttribute('rel', 'noopener noreferrer');

    const words = await page.locator('main').innerText();
    expect(words).not.toMatch(/\btips?\b/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('explains the purpose of support without invented amounts, and thanks visitors', async ({ page }) => {
    await page.goto('/support');

    await expect(page.getByRole('heading', { level: 2, name: 'how your support helps' })).toBeVisible();
    const main = page.locator('main');
    await expect(main.getByText(/maintain the domain,\s*keep the website available, and build more lessons/)).toBeVisible();
    await expect(main.getByText('thank you for helping us make nursing study simpler.')).toBeVisible();
    await expect(page.locator('[data-mission] h2')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('passes the accessibility checks', async ({ page }) => {
    await page.goto('/support');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
