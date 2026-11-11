import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Word path as a themed word search (Task 97, D-71). The clock is set to 1 November 2026, so today's puzzle is the first
 * sample, "study break" (content/games/suture/sample-01.json). The tests read the word places from that file.
 */
type Cell = [number, number];
const sample = JSON.parse(readFileSync(new URL('../../content/games/suture/sample-01.json', import.meta.url), 'utf8')) as {
  theme: string;
  grid: string[];
  words: { answer: string; path: Cell[] }[];
};
const words = sample.words.map(({ answer, path }) => ({ word: answer.toLowerCase(), first: path[0]!, last: path.at(-1)! }));

const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
const game = (page: Page) => page.getByTestId('suture');
const cell = (page: Page, [row, col]: Cell) => game(page).locator(`button[data-cell="${row},${col}"]`);
const live = (page: Page) => page.getByTestId('suture-live');
const listed = (page: Page, word: string) => page.getByRole('list', { name: 'words to find' }).getByRole('listitem').filter({ hasText: word });

test.beforeEach(async ({ page }) => {
  // The once-only promo panel (D-59) would take focus part-way through, so it counts as already shown (as in play.spec.ts).
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* storage blocked: no panel */ }
  });
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await page.goto('/play');
  await expect(game(page)).toBeVisible();
});

test.describe('word path: themed word search (Task 97)', () => {
  test('the theme is the title, with the word list, the count and the sample label', async ({ page }) => {
    await expect(game(page).getByRole('heading', { level: 3, name: 'study break' })).toBeVisible();
    await expect(game(page)).toContainText('find all 12 words. they run up, down, left or right.');
    await expect(game(page)).toContainText('sample puzzle');
    await expect(page.getByTestId('suture-count')).toHaveText('0 of 12 found');
    await expect(game(page).getByRole('row')).toHaveCount(11);
    await expect(game(page).getByRole('gridcell')).toHaveCount(121);
    const items = page.getByRole('list', { name: 'words to find' }).getByRole('listitem');
    await expect(items).toHaveCount(12);
    await expect(items.first()).toHaveText('breathe');
    // Three columns, read down each column like a printed word search: words 1, 5 and 9 share the top line.
    const tops = await items.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(new Set([tops[0], tops[4], tops[8]]).size).toBe(1);
    expect(tops[1]).toBeGreaterThan(tops[0]!);
  });

  test('tapping each first and last letter finds every word, crossed out and said in words', async ({ page }) => {
    for (const [i, { word, first, last }] of words.entries()) {
      await cell(page, first).click();
      await expect(live(page)).toHaveText(`first letter: ${word[0]}. now pick the last letter.`);
      await cell(page, last).click();
      const said = `found: ${word}, ${i + 1} of 12.`;
      await expect(live(page)).toHaveText(i === words.length - 1 ? `${said} all words found.` : said);
      if (i === 0) {
        await expect(listed(page, word).locator('s')).toHaveText(word);
        await expect(listed(page, word)).toContainText('(found)');
        await expect(page.getByTestId('suture-count')).toHaveText('1 of 12 found');
        await expect(cell(page, first)).toHaveAccessibleName(new RegExp(`found: ${word}$`));
      }
    }
    const resultDialog = page.getByTestId('game-result-dialog');
    await expect(resultDialog.getByRole('button', { name: 'close results' })).toBeFocused();
    await resultDialog.getByRole('button', { name: 'close results' }).click();
    const result = page.getByTestId('suture-result');
    await expect(result).toBeFocused();
    await expect(result).toContainText('cueory word path, sun 1 nov: found 12 of 12 words with 0 wrong picks.');
    await expect(page.getByTestId('suture-count')).toHaveText('12 of 12 found');
  });

  test('the keyboard can finish the puzzle: arrows move, enter picks, the letters between highlight', async ({ page }) => {
    let at: Cell = [0, 0];
    const moveTo = async (target: Cell) => {
      while (at[0] !== target[0]) { await page.keyboard.press(at[0] < target[0] ? 'ArrowDown' : 'ArrowUp'); at = [at[0] + (at[0] < target[0] ? 1 : -1), at[1]]; }
      while (at[1] !== target[1]) { await page.keyboard.press(at[1] < target[1] ? 'ArrowRight' : 'ArrowLeft'); at = [at[0], at[1] + (at[1] < target[1] ? 1 : -1)]; }
      await expect(cell(page, target)).toBeFocused();
    };
    await cell(page, [0, 0]).focus();
    for (const [i, { word, first, last }] of words.entries()) {
      await moveTo(first);
      await page.keyboard.press(i % 2 ? 'Space' : 'Enter');
      await moveTo(last);
      if (i === 0) {
        // The pick runs from the first letter to the cursor, so every letter of the word is highlighted before the last pick.
        await expect(game(page).locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(word.length);
      }
      await page.keyboard.press('Enter');
      if (i < words.length - 1) await expect(page.getByTestId('suture-count')).toHaveText(`${i + 1} of 12 found`);
    }
    const resultDialog = page.getByTestId('game-result-dialog');
    await expect(resultDialog.getByRole('button', { name: 'close results' })).toBeFocused();
    await resultDialog.getByRole('button', { name: 'close results' }).click();
    await expect(page.getByTestId('suture-result')).toBeFocused();
  });

  test('a wrong pick says so in words and counts; escape and a second tap clear a pick', async ({ page }) => {
    await cell(page, [0, 0]).click();
    await cell(page, [0, 2]).click();
    await expect(live(page)).toHaveText('not a word in this puzzle.');
    await cell(page, [0, 0]).click();
    await cell(page, [2, 2]).click();
    await expect(live(page)).toHaveText('not a word in this puzzle. words run up, down, left or right.');
    await cell(page, [5, 5]).click();
    await cell(page, [5, 5]).click();
    await expect(live(page)).toHaveText('pick cleared.');
    await cell(page, [5, 5]).click();
    await page.keyboard.press('Escape');
    await expect(live(page)).toHaveText('pick cleared.');
    await expect(cell(page, [5, 5])).toHaveAccessibleName(`row 6, column 6, ${sample.grid[5]![5]}`);
    await expect(page.getByTestId('suture-count')).toHaveText('0 of 12 found');
  });

  test('a wrong pick shakes gently, and not at all with reduced motion', async ({ page }) => {
    // Count the board's animations as they start, so a short shake can't finish before the test looks.
    await page.addInitScript(() => {
      const start = Element.prototype.animate;
      Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
        if (this.getAttribute('role') === 'grid') (window as unknown as { shakes: number }).shakes = ((window as unknown as { shakes?: number }).shakes ?? 0) + 1;
        return start.apply(this, args);
      };
    });
    const shakes = () => page.evaluate(() => (window as unknown as { shakes?: number }).shakes ?? 0);
    await page.goto('/play');
    await cell(page, [0, 0]).click();
    await cell(page, [0, 2]).click();
    await expect(live(page)).toHaveText('not a word in this puzzle.');
    expect(await shakes()).toBe(1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/play');
    await cell(page, [0, 0]).click();
    await cell(page, [0, 2]).click();
    await expect(live(page)).toHaveText('not a word in this puzzle.');
    expect(await shakes()).toBe(0);
  });

  test('the grid fits a 390 px phone with square letters and no sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const grid = await game(page).getByRole('grid').boundingBox();
    expect(grid!.x).toBeGreaterThanOrEqual(0);
    expect(grid!.x + grid!.width).toBeLessThanOrEqual(390);
    const box = await cell(page, [5, 5]).boundingBox();
    expect(Math.abs(box!.width - box!.height)).toBeLessThan(1);
  });

  test('at 320 px every sample fits, letters stay at least 24 px and other buttons 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    for (const day of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) {
      await page.clock.setFixedTime(new Date(`${day}T15:00:00`));
      await page.goto('/play');
      await expect(game(page)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const boxes = await game(page).getByRole('button').evaluateAll((els) =>
        els.map((el) => ({ letter: el.hasAttribute('data-cell'), box: el.getBoundingClientRect().toJSON() as DOMRect })));
      for (const { letter, box } of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(320);
        // Letters meet WCAG 2.2's 24 px target size: 11 across can't be 44 px on a phone (Christian's 11 × 11 design).
        expect(box.height).toBeGreaterThanOrEqual(letter ? 24 : 44);
        expect(box.width).toBeGreaterThanOrEqual(letter ? 24 : 44);
      }
    }
  });

  for (const [label, width, height] of [['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]] as const) {
    test(`axe passes at ${label} size, before and after a find`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      let results = await axe(page);
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      await cell(page, words[0]!.first).click();
      await cell(page, words[0]!.last).click();
      await cell(page, words[1]!.first).click();
      results = await axe(page);
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
});
