import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** Printable sudoku pack (launch task L3): two puzzles per printed page, then the answers. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* storage blocked: no panel */ }
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => { (window as unknown as { printed: number }).printed += 1; };
  });
  await page.goto('/print/sudoku-pack');
});

test.describe('printable sudoku pack (L3)', () => {
  test('30 puzzles on screen, kept out of search, no sideways scroll, no axe violations', async ({ page }) => {
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('[data-sudoku-puzzle]')).toHaveCount(30);
    await expect(page.locator('[data-sudoku-answer]')).toHaveCount(30);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  });

  test('the print button is a 44 × 44 target and opens the print dialog once', async ({ page }) => {
    const button = page.getByRole('button', { name: 'print the pack' });
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await button.focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  });

  test('on paper: no site chrome, two puzzles then a page break, answers at the end in black on white', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('body > header')).toBeHidden();
    await expect(page.locator('body > footer')).toBeHidden();
    await expect(page.getByRole('button', { name: 'print the pack' })).toBeHidden();

    const pages = page.locator('[data-sudoku-page]');
    await expect(pages).toHaveCount(15);
    for (const index of [0, 14]) {
      await expect(pages.nth(index).locator('[data-sudoku-puzzle]')).toHaveCount(2);
      await expect(pages.nth(index)).toHaveCSS('break-after', 'page');
    }

    const answers = page.locator('[data-sudoku-answers]');
    const lastPuzzle = (await page.locator('[data-sudoku-puzzle="30"]').boundingBox())!;
    const firstAnswer = (await page.locator('[data-sudoku-answer="1"]').boundingBox())!;
    expect(firstAnswer.y).toBeGreaterThan(lastPuzzle.y);
    await expect(page.locator('[data-sudoku-answer-page]')).toHaveCount(5);
    await expect(answers).toHaveCSS('color', 'rgb(0, 0, 0)');
    await expect(page.locator('[data-sudoku-puzzle="1"] .sudoku-pack-grid')).toHaveCSS('background-color', 'rgb(255, 255, 255)');

    // A printed grid is wider than an answer grid, and both are square.
    const board = (await page.locator('[data-sudoku-puzzle="1"] .sudoku-pack-grid').boundingBox())!;
    const key = (await page.locator('[data-sudoku-answer="1"] .sudoku-pack-grid').boundingBox())!;
    expect(board.width).toBeGreaterThan(key.width * 1.5);
    expect(Math.abs(board.width - board.height)).toBeLessThan(2);
  });
});
