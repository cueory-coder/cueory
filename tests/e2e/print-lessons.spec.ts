import { expect, test } from '@playwright/test';

const lessonRoutes = [
  '/learn/study-skills',
  '/learn/study-skills/cards',
  '/learn/study-skills/fill-in',
  '/learn/study-skills/label-it',
  '/learn/study-skills/learn-mode',
  '/learn/study-skills/matching',
  '/learn/study-skills/organizer',
  '/learn/study-skills/questions',
];

test.describe('Task 216: printed lesson pages', () => {
  for (const route of lessonRoutes) {
    test(`${route} prints reading content without site navigation`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);

      if (route === '/learn/study-skills') {
        await expect(page.getByTestId('print-lesson-reader')).toBeHidden();
      }

      await page.emulateMedia({ media: 'print' });

      await expect(page.locator('main')).toBeVisible();
      for (const selector of [
        'body > header',
        'body > footer',
        'body > [data-testid="building-notice"]',
        'body > dialog',
        'body > a[href="#main"]',
      ]) {
        await expect(page.locator(selector)).toBeHidden();
      }
      await expect(page.locator('main')).toHaveCSS('max-width', 'none');

      if (route === '/learn/study-skills') {
        const printReader = page.getByTestId('print-lesson-reader');
        await expect(printReader).toBeVisible();
        await expect(printReader.locator('li')).toHaveCount(3);
        await expect(printReader).toContainText('Placeholder sentence 1');
        await expect(printReader).toContainText('Placeholder sentence 2');
        await expect(printReader).toContainText('Placeholder sentence 3');
      }
    });
  }

  test('/learn/study-skills prints a single full-text lesson when JavaScript is disabled', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const response = await page.goto('/learn/study-skills');
    expect(response?.status()).toBe(200);

    // On screen with JS disabled, noscript is visible and print reader is hidden
    await expect(page.getByTestId('print-lesson-reader')).toBeHidden();
    await expect(page.locator('noscript ol')).toBeVisible();

    // Emulate print media
    await page.emulateMedia({ media: 'print' });

    // Print reader is visible with all 3 sentences
    const printReader = page.getByTestId('print-lesson-reader');
    await expect(printReader).toBeVisible();
    await expect(printReader.locator('li')).toHaveCount(3);
    await expect(printReader).toContainText('Placeholder sentence 1');
    await expect(printReader).toContainText('Placeholder sentence 2');
    await expect(printReader).toContainText('Placeholder sentence 3');

    // noscript fallback is hidden in print so sentences are not duplicated
    await expect(page.locator('noscript ol')).toBeHidden();
    await expect(page.locator('main [data-testid="study-reader"] ol:visible li')).toHaveCount(3);

    await context.close();
  });
});
