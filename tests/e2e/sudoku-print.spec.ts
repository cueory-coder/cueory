import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dailySudokuSeed, generateSudoku } from '../../src/islands/sudoku';

const source = generateSudoku(dailySudokuSeed('2026-11-01', 'easy'), 'easy').puzzle;
const expected = source.map((digit) => digit ? String(digit) : '');
const game = (page: Page) => page.getByTestId('sudoku');
const sheet = (page: Page) => page.getByTestId('sudoku-print-sheet');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* optional */ }
    window.print = () => { document.documentElement.dataset.printInvoked = 'true'; };
  });
});

for (const [size, width, height] of [['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test('prints a blank Sudoku sheet on ' + size + ' in ' + theme, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/play');
      await expect(game(page)).toBeVisible();
      await expect(sheet(page)).toBeHidden();
      const firstOpen = source.findIndex((value) => value === 0);
      const secondOpen = source.findIndex((value, index) => value === 0 && index !== firstOpen);
      const cells = game(page).getByRole('gridcell');
      await cells.nth(firstOpen).click();
      await page.keyboard.press('1');
      await cells.nth(secondOpen).click();
      await page.keyboard.press('x');

      const print = game(page).getByRole('button', { name: 'print this puzzle' });
      const bounds = await print.boundingBox();
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      await print.focus();
      await expect(print).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('html')).toHaveAttribute('data-print-game', 'sudoku');
      await expect(page.locator('html')).toHaveAttribute('data-print-invoked', 'true');
      await page.emulateMedia({ media: 'print' });

      await expect(sheet(page)).toBeVisible();
      await expect(sheet(page)).toContainText('easy');
      await expect(sheet(page)).toContainText('2026-11-01');
      await expect(sheet(page)).toContainText('cueory.app');
      await expect(sheet(page).locator('td')).toHaveCount(81);
      expect(await sheet(page).locator('td').allTextContents()).toEqual(expected);
      await expect(game(page).locator('.sudoku-board')).toBeHidden();
      await expect(page.getByRole('heading', { level: 1, name: 'daily games' })).toBeHidden();
      await expect(sheet(page)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(sheet(page)).toHaveCSS('color', 'rgb(0, 0, 0)');
      expect((await sheet(page).boundingBox())!.width).toBeLessThanOrEqual(606);

      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      await expect(page.locator('html')).not.toHaveAttribute('data-print-game', /.+/);
      await page.emulateMedia({ media: 'screen' });
      await expect(sheet(page)).toBeHidden();
      await expect(cells.nth(firstOpen)).toHaveText('1');
      await expect(cells.nth(secondOpen)).toHaveText('x');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => (document.querySelector('header')?.getBoundingClientRect().top ?? 0) >= 0);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => v.id + ': ' + v.help)).toEqual([]);
    });
  }
}


for (const level of ['medium', 'hard'] as const) {
  test('printing ' + level + ' while paused still shows only immutable givens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.goto('/play');
    await expect(game(page)).toBeVisible();
    await game(page).getByRole('button', { name: level, exact: true }).click();

    const source = generateSudoku(dailySudokuSeed('2026-11-01', level), level).puzzle;
    const blank = source.findIndex((value) => value === 0);
    await game(page).getByRole('gridcell').nth(blank).click();
    await page.keyboard.press('1');
    await game(page).getByRole('button', { name: 'pause puzzle' }).click();
    await expect(game(page).getByRole('button', { name: 'resume puzzle' })).toBeVisible();

    // Print is deliberately reachable even while the game is paused.
    const print = game(page).getByRole('button', { name: 'print this puzzle' });
    await print.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-print-game', 'sudoku');
    await page.emulateMedia({ media: 'print' });
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByRole('table', { name: 'sudoku ' + level + ' for 2026-11-01' })).toBeVisible();
    expect(await sheet(page).locator('td').allTextContents()).toEqual(source.map((digit) => digit ? String(digit) : ''));
    await expect(game(page).locator('.sudoku-board')).toBeHidden();
    await expect(sheet(page)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(sheet(page)).toHaveCSS('color', 'rgb(0, 0, 0)');

    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.emulateMedia({ media: 'screen' });
    await expect(sheet(page)).toBeHidden();
    await expect(game(page).getByRole('button', { name: 'resume puzzle' })).toBeVisible();
    await game(page).getByRole('button', { name: 'resume puzzle' }).click();
    await expect(game(page).getByRole('gridcell').nth(blank)).toHaveText('1');
  });
}
