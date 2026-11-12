import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dailySudokuSeed, generateSudoku } from '../../src/islands/sudoku';

const daily = generateSudoku(dailySudokuSeed('2026-11-01', 'easy'), 'easy');
const empty = daily.puzzle.findIndex((digit) => digit === 0);
const secondEmpty = daily.puzzle.findIndex((digit, index) => digit === 0 && index !== empty);
const game = (page: Page) => page.getByTestId('sudoku');
const grid = (page: Page) => game(page).getByRole('grid', { name: 'sudoku grid' });
const cells = (page: Page) => grid(page).getByRole('gridcell');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* optional */ }
  });
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
});

for (const [size, width, height] of [['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test('Sudoku keyboard and accessible controls: ' + size + ' / ' + scheme, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/play');
      await expect(game(page)).toBeVisible();
      await expect(cells(page)).toHaveCount(81);

      // Keyboard arrows stop at the top/left boundaries and never jump to another row.
      await cells(page).nth(0).click();
      for (const key of ['ArrowUp', 'ArrowLeft']) {
        await page.keyboard.press(key);
        await expect(cells(page).nth(0)).toBeFocused();
        await expect(cells(page).nth(0)).toHaveAttribute('aria-selected', 'true');
      }
      await page.keyboard.press('ArrowRight');
      await expect(cells(page).nth(1)).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(cells(page).nth(10)).toBeFocused();
      await expect(cells(page).nth(10)).toHaveAttribute('aria-selected', 'true');
      await expect(cells(page).nth(10)).toHaveCSS('outline-style', 'solid');

      // Entries have a spoken announcement and an explicit row/column cell label.
      const correct = daily.solution[empty]!;
      await cells(page).nth(empty).click();
      await page.keyboard.press(String(correct));
      await expect(cells(page).nth(empty)).toHaveText(String(correct));
      await expect(cells(page).nth(empty)).toHaveAttribute('aria-label', new RegExp('row [1-9], column [1-9], ' + correct));
      await expect(game(page).getByTestId('sudoku-live')).toHaveText(correct + ' entered.');

      // X is available by keyboard and by the on-screen button.
      await cells(page).nth(secondEmpty).click();
      await page.keyboard.press('x');
      await expect(cells(page).nth(secondEmpty)).toHaveText('x');
      await expect(cells(page).nth(secondEmpty)).toHaveAttribute('aria-label', /x mark/);
      await expect(game(page).getByTestId('sudoku-live')).toHaveText('x mark added.');
      await game(page).getByRole('button', { name: 'add or remove x mark' }).click();
      await expect(cells(page).nth(secondEmpty)).toBeEmpty();
      await expect(game(page).getByTestId('sudoku-live')).toHaveText('mark removed.');

      // All interactive game controls remain large enough to tap and expose focus.
      const bounds = await game(page)
        .locator('.sudoku-icon-button, .sudoku-small-button, .sudoku-number-row button')
        .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().toJSON()));
      for (const box of bounds) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await cells(page).nth(empty).focus();
      await expect(cells(page).nth(empty)).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => (document.querySelector('header')?.getBoundingClientRect().top ?? 0) >= 0);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
    });
  }
}
