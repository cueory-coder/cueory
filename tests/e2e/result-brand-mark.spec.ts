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
  // The crossword has no clue buttons any more: each square is a button named by its row and column (Task 627).
  // Same easy November sample as play.spec.ts.
  const board = page.getByTestId('cueword');
  const sample = ['.ABC.', 'DEFGH', 'IJKLM', 'NOPQR', '.STU.'];
  for (const [row, letters] of sample.entries()) {
    for (const [column, letter] of [...letters].entries()) {
      if (letter === '.') continue;
      await board.getByRole('button', { name: new RegExp('^row ' + (row + 1) + ', column ' + (column + 1) + ',') }).click();
      await page.keyboard.type(letter);
    }
  }
  await expect(page.getByTestId('cueword-result').getByTestId('result-brand-mark')).toHaveText('cueory.app/play');
  // The clues (the clue bar and the printed clue lists) never carry the mark.
  await expect(board.getByTestId('cueword-clue').getByTestId('result-brand-mark')).toHaveCount(0);
  await expect(board.locator('.crossword-print-clues')).toHaveCount(1);
  await expect(board.locator('.crossword-print-clues').getByTestId('result-brand-mark')).toHaveCount(0);
});

test('progress is a share-worthy summary, with a mark that remains decorative', async ({ page }) => {
  await page.goto('/progress');
  await expect(mark(page)).toHaveCount(1);
  await expect(mark(page)).toHaveText('cueory.app/progress');
  await expect(mark(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(mark(page)).toHaveClass(/print:hidden/);
});
