import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Printing word path for a patient (Task 641). The clock is set to 1 November 2026, so today's puzzle is the first
 * sample (content/games/suture/sample-01.json). window.print is replaced before the click, so no dialog opens.
 */
type Cell = [number, number];
const sample = JSON.parse(readFileSync(new URL('../../content/games/suture/sample-01.json', import.meta.url), 'utf8')) as {
  words: { answer: string; path: Cell[] }[];
};

const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
const game = (page: Page) => page.getByTestId('suture');
const printButton = (page: Page) => game(page).getByRole('button', { name: 'print', exact: true });
const cell = (page: Page, [row, col]: Cell) => game(page).locator(`button[data-cell="${row},${col}"]`);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* storage blocked: no panel */ }
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => { (window as unknown as { printed: number }).printed += 1; };
  });
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await page.goto('/play');
  await expect(game(page)).toBeVisible();
});

const printed = (page: Page) => page.evaluate(() => (window as unknown as { printed: number }).printed);

test.describe('word path: print for a patient (Task 641)', () => {
  test('a round print button, at least 44 × 44, at the top right of the game', async ({ page }) => {
    await expect(printButton(page)).toBeVisible();
    const box = (await printButton(page).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(printButton(page)).toHaveCSS('border-top-left-radius', /^(?:[2-9]\d|\d{3,})(?:\.\d+)?px$/);
    const area = (await game(page).boundingBox())!;
    expect(box.x + box.width).toBeGreaterThan(area.x + area.width - 2);
    // The print-only word list and footer stay off screen.
    await expect(page.getByTestId('suture-print-words')).toBeHidden();
    await expect(page.getByTestId('suture-print-foot')).toBeHidden();
  });

  test('the keyboard reaches the print button, and enter prints', async ({ page }) => {
    // The grid's letter in the tab order comes right after the print button, so shift+tab from it lands on the button.
    await cell(page, [0, 0]).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(printButton(page)).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await printed(page)).toBe(1);
    await expect(page.locator('html')).toHaveAttribute('data-print-game', 'suture');
  });

  test('on paper: only the grid, the words to find and cueory.app, with nothing found shown', async ({ page }) => {
    // Find one word first, so the printed copy has to hide it.
    const first = sample.words[0]!;
    await cell(page, first.path[0]!).click();
    await cell(page, first.path.at(-1)!).click();
    await expect(page.getByTestId('suture-count')).toHaveText(`1 of ${sample.words.length} found`);

    await printButton(page).click();
    expect(await printed(page)).toBe(1);
    await page.emulateMedia({ media: 'print' });

    for (const selector of ['body > header', 'body > footer', 'body > [data-testid="building-notice"]']) {
      await expect(page.locator(selector)).toBeHidden();
    }
    await expect(printButton(page)).toBeHidden();
    await expect(page.getByTestId('suture-words')).toBeHidden();
    await expect(page.getByTestId('suture-count')).toBeHidden();
    await expect(page.getByTestId('suture-live')).toBeHidden();
    await expect(game(page).getByText('tap a word\'s first letter')).toBeHidden();
    // The rest of /play (the page title, the other games, the stats panel) is left out.
    await expect(page.getByRole('heading', { level: 1, name: 'daily games' })).toBeHidden();
    await expect(page.locator('#pulse-heading')).toBeHidden();
    await expect(page.locator('#word-path-heading')).toBeHidden();

    await expect(game(page).getByRole('grid')).toBeVisible();
    const words = page.getByTestId('suture-print-words');
    await expect(words).toBeVisible();
    await expect(words).toContainText('words to find');
    await expect(words.getByRole('listitem')).toHaveText(sample.words.map((word) => word.answer));
    await expect(words.locator('s')).toHaveCount(0);
    await expect(page.getByTestId('suture-print-foot')).toHaveText('cueory.app');

    // Black on white, and the found word's letters look like every other letter.
    await expect(game(page)).toHaveCSS('color', 'rgb(0, 0, 0)');
    await expect(page.locator('body')).toHaveCSS('background-image', 'none');
    const found = cell(page, first.path[0]!);
    await expect(found).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(found).toHaveCSS('color', 'rgb(0, 0, 0)');

    // The grid fits the width of a letter or A4 page inside its margins (16 cm, about 605 px at 96 per inch).
    const board = (await game(page).getByRole('grid').boundingBox())!;
    expect(board.width).toBeLessThanOrEqual(606);
  });

  test('a plain print without the button still prints the game clean', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    await expect(printButton(page)).toBeHidden();
    await expect(page.getByTestId('suture-words')).toBeHidden();
    await expect(page.getByTestId('suture-print-words')).toBeVisible();
    // Without the button's mark, the rest of the page prints as before.
    await expect(page.getByRole('heading', { level: 1, name: 'daily games' })).toBeVisible();
  });

  test('axe passes with the print button', async ({ page }) => {
    await printButton(page).scrollIntoViewIfNeeded();
    const results = await axe(page);
    expect(results.violations).toEqual([]);
  });
});
