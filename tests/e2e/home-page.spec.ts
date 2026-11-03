import { expect, test } from '@playwright/test';
import { sizeOf } from './projects';

const homeSizes = new Set(['phone', 'desktop']);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // The home page remains usable when storage is blocked.
    }
  });
});

test.describe('home page-specific behavior', () => {
  test('keeps its section order, primary links, and signup state', async ({ page }, testInfo) => {
    test.skip(!homeSizes.has(sizeOf(testInfo)), 'Task 400 runs at phone and desktop sizes only.');

    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    await expect(page.locator('main > section')).toHaveCount(5);
    await expect(page.locator('main > section')).toHaveAttribute('id', /.+/);
    const sectionIds = await page.locator('main > section').evaluateAll((sections) => sections.map((section) => section.id));
    expect(sectionIds).toEqual([
      'how-it-works',
      'ways-to-study',
      'daily-games',
      'study-features',
      'signup',
    ]);

    await expect(page.getByRole('link', { name: "start with a lesson" })).toHaveAttribute('href', '/learn/study-skills');
    await expect(page.getByTestId('games-link')).toHaveAttribute('href', '/play');
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(4);
    const sectionHeadings = await page.getByRole('heading', { level: 2 }).allTextContents();
    expect(sectionHeadings).toEqual([
      'how it works',
      'ways to study',
      'daily games',
      'made for the way you study',
    ]);

    await expect(page.getByTestId('signup-pending')).toHaveText('signups open soon.');
    await expect(page.getByTestId('signup-form')).toHaveCount(0);
  });

  test('opens and closes a study-mode preview with keyboard-safe focus', async ({ page }, testInfo) => {
    test.skip(!homeSizes.has(sizeOf(testInfo)), 'Task 400 runs at phone and desktop sizes only.');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const activeCard = page.locator('[data-mode-card][data-active="true"]');
    const openButton = activeCard.locator('[data-mode-open]');
    await expect(openButton).toBeVisible();
    await openButton.click();

    const dialog = page.getByRole('dialog', { name: /.+/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(await activeCard.locator('h3').textContent() ?? '');
    await expect(dialog.getByRole('button', { name: 'close preview' })).toBeFocused();

    await dialog.getByRole('button', { name: 'next study mode' }).click();
    await expect(dialog.getByRole('heading', { level: 2 })).not.toHaveText(await activeCard.locator('h3').textContent() ?? '');
    await dialog.getByRole('button', { name: 'close preview' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-mode-card][data-active="true"] [data-mode-open]')).toBeFocused();
  });
});
