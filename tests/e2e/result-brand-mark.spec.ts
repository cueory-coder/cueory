import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Same reviewed November sample puzzle as play.spec.ts, so tests do not depend on today's word.
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // When storage is blocked the panel never appears.
    }
  });
});

const mark = (page: Page) => page.getByTestId('result-brand-mark');

test('no game result mark appears while a student is answering', async ({ page }) => {
  await page.goto('/play');
  await expect(page.getByTestId('pulse')).toBeVisible();
  await expect(mark(page)).toHaveCount(0);
  await expect(page.getByRole('grid', { name: 'crossword grid' })).toBeVisible();
  await expect(page.getByTestId('sudoku')).toBeVisible();
});

test('pillo completion adds the unobtrusive original-art mark inside the result only', async ({ page }) => {
  await page.goto('/play');
  await page.getByTestId('pulse').getByLabel('your guess', { exact: true }).fill('grace');
  await page.getByTestId('pulse').getByRole('button', { name: 'enter', exact: true }).click();
  const resultDialog = page.getByTestId('game-result-dialog');
  await expect(resultDialog.getByRole('button', { name: 'close results' })).toBeFocused();
  await resultDialog.getByRole('button', { name: 'close results' }).click();
  const result = page.getByTestId('pulse-result');
  await expect(result).toBeFocused();
  await expect(result.getByTestId('result-brand-mark')).toHaveText('cueory.app/play');
  await expect(result.getByTestId('result-brand-mark').locator('img.logo-day')).toHaveAttribute(
    'src', '/brand/v1/emblem-light-96.png',
  );
  await expect(page.getByTestId('pulse').getByRole('list', { name: 'your guesses' }).getByTestId('result-brand-mark')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('crossword completion adds the mark to its finished card, not the clues', async ({ page }) => {
  await page.goto('/play');
  const fill = async (direction: 'across' | 'down', index: number, word: string) => {
    await page.getByRole('list', { name: direction + ' clues' }).getByRole('button').nth(index).click();
    await page.keyboard.type(word);
  };
  await fill('across', 0, 'star');
  await fill('across', 1, 'apple');
  await fill('down', 0, 'sofa');
  await fill('down', 1, 'rail');
  await expect(page.getByTestId('cueword-result').getByTestId('result-brand-mark')).toHaveText('cueory.app/play');
  await expect(page.getByRole('list', { name: 'across clues' }).getByTestId('result-brand-mark')).toHaveCount(0);
});

test('progress is a share-worthy summary, with a mark that remains decorative', async ({ page }) => {
  await page.goto('/progress');
  await expect(mark(page)).toHaveCount(1);
  await expect(mark(page)).toHaveText('cueory.app/progress');
  await expect(mark(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(mark(page)).toHaveClass(/print:hidden/);
});
