import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dailySudokuSeed, generateSudoku } from '../../src/islands/sudoku';

const puzzle = generateSudoku(dailySudokuSeed('2026-11-01', 'easy'), 'easy').puzzle;
const given = puzzle.findIndex((value) => value !== 0);
const empty = puzzle.findIndex((value) => value === 0);
const marked = puzzle.findIndex((value, index) => value === 0 && index !== empty);
const game = (page: Page) => page.getByTestId('sudoku');
const cells = (page: Page) => game(page).getByRole('gridcell');

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-01T15:00:00Z') });
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* optional */ }
  });
});
for (const [size, width, height] of [['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`sudoku pause at ${size} in ${scheme} theme`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/play');
      await expect(cells(page)).toHaveCount(81);
      await cells(page).nth(empty).click();
      await page.keyboard.press('1');
      await cells(page).nth(marked).click();
      await page.keyboard.press('x');
      await expect(cells(page).nth(empty)).toHaveText('1');
      await expect(cells(page).nth(marked)).toHaveText('x');
      const savedEntry = await cells(page).nth(empty).getAttribute('aria-label');
      const savedMark = await cells(page).nth(marked).getAttribute('aria-label');

      await page.clock.runFor(2000);
      const pause = game(page).getByRole('button', { name: 'pause puzzle' });
      await pause.focus();
      await expect(pause).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(game(page).getByTestId('sudoku-live')).toHaveText('puzzle paused. given numbers remain visible.');
      await expect(cells(page).nth(given)).toHaveText(String(puzzle[given]));
      await expect(cells(page).nth(given)).toHaveAttribute('aria-label', /given$/);
      await expect(game(page).locator('[data-given="true"]')).toHaveCount(40);
      for (const index of [empty, marked]) {
        await expect(cells(page).nth(index)).toBeEmpty();
        await expect(cells(page).nth(index)).toHaveAttribute('aria-label', /hidden until resumed/);
      }
      await expect(game(page).locator('.is-entered, .is-conflict, .is-identical, .sudoku-mark, .sudoku-candidates')).toHaveCount(0);
      const labels = await cells(page).evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label') ?? ''));
      expect(labels.some((label) => /paused/i.test(label))).toBe(false);
      const time = await game(page).locator('.sudoku-time strong').textContent();
      await page.clock.runFor(10000);
      await expect(game(page).locator('.sudoku-time strong')).toHaveText(time ?? '');

      await game(page).getByRole('button', { name: 'resume puzzle' }).click();
      await expect(game(page).getByTestId('sudoku-live')).toHaveText('puzzle resumed.');
      await expect(cells(page).nth(empty)).toHaveText('1');
      await expect(cells(page).nth(marked)).toHaveText('x');
      await expect(cells(page).nth(empty)).toHaveAttribute('aria-label', savedEntry!);
      await expect(cells(page).nth(marked)).toHaveAttribute('aria-label', savedMark!);
      await page.clock.runFor(2000);
      await expect(game(page).locator('.sudoku-time strong')).not.toHaveText(time ?? '');
      const box = await game(page).getByRole('button', { name: 'pause puzzle' }).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => (document.querySelector('header')?.getBoundingClientRect().top ?? 0) >= 0);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
}
