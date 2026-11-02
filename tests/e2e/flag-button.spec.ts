import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();

// Suppress the promo panel so it does not steal focus mid-test.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // Storage blocked: panel never shows anyway.
    }
  });
});

const pages = [
  { name: 'home', url: '/' },
  { name: 'play', url: '/play' },
  { name: 'privacy', url: '/privacy' },
  { name: 'study-skills cards', url: '/learn/study-skills/cards' },
] as const;

for (const { name, url } of pages) {
  test(`flag button is present and keyboard-operable on ${name}`, async ({ page }) => {
    await page.goto(url);
    const btn = page.getByRole('button', { name: 'flag or comment', exact: true });
    await expect(btn).toBeVisible();

    // Keyboard: Tab to the button, press Enter to open the form.
    await btn.focus();
    await page.keyboard.press('Enter');

    // Signed out: the form panel opens and shows the sign-in message.
    const panel = page.getByTestId('flag-form');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('sign in to send a report');
  });

  test(`axe passes on ${name}`, async ({ page }) => {
    await page.goto(url);
    const results = await axe(page);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test('flag button passes axe with form open', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'flag or comment', exact: true }).click();
  const results = await axe(page);
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

// D-pending (Task 64): hideFlag hides the button during sharpening / timed review.
// Full behavioral test added when those pages exist (Task 4e / sharpening not yet built).
// The hideFlag prop is wired: Layout.astro passes it to FlagCorner; !hideFlag gates rendering.
