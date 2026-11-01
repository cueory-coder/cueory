import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Daily games (D-61): pulse on /play. The page's clock is set to 1 November 2026, the first day, so today's sample
 * word is "garden" (content/games/pulse/sample-01.json).
 */
const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
const field = (page: Page) => page.getByLabel('your guess', { exact: true });
const live = (page: Page) => page.getByTestId('pulse-live');

test.describe('daily games: pulse (D-61)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
    await page.goto('/play');
    await expect(page.getByTestId('pulse')).toBeVisible();
  });

  test('the page names the four games, says the puzzle is a sample, and passes axe', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'daily games' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'pulse' })).toBeVisible();
    await expect(page.getByTestId('sample-note')).toHaveText("today's word is a sample.");
    await expect(page.getByText('a 6-letter word · 7 of 7 beats left')).toBeVisible();
    for (const name of ['cueword', 'triage', 'suture']) await expect(page.getByText(name, { exact: true })).toBeVisible();
    const results = await axe(page);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('a typed guess is marked by symbol and in words, and the letter buttons learn the marks', async ({ page }) => {
    await field(page).fill('planet');
    await page.keyboard.press('Enter');
    await expect(live(page)).toHaveText(
      'p, not in the word. l, not in the word. a, elsewhere in the word. n, elsewhere in the word. e, in place. t, not in the word. 6 beats left.',
    );
    const row = page.getByRole('listitem', { name: /^guess 1: planet\./ });
    await expect(row).toBeVisible();
    // Every letter carries its symbol, so no mark depends on color.
    await expect(row.locator('.pulse-symbol')).toHaveText(['·', '·', '○', '○', '●', '·']);
    await expect(page.getByRole('button', { name: 'e, in place' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'p, not in the word' })).toBeVisible();
    await expect(page.getByText('a 6-letter word · 6 of 7 beats left')).toBeVisible();
    // Focus stays in the field for the next guess.
    await expect(field(page)).toBeFocused();
  });

  test('a guess of the wrong length is explained and spends nothing', async ({ page }) => {
    await field(page).fill('gard');
    await page.getByRole('button', { name: 'guess', exact: true }).click();
    await expect(page.getByText('the word has 6 letters.')).toBeVisible();
    await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('a 6-letter word · 7 of 7 beats left')).toBeVisible();
  });

  test('the cue spends one beat, once', async ({ page }) => {
    await page.getByRole('button', { name: 'spend a beat on the cue' }).click();
    await expect(page.getByTestId('pulse-cue')).toHaveText('cue: where flowers and vegetables grow.');
    await expect(page.getByText('a 6-letter word · 6 of 7 beats left')).toBeVisible();
    await expect(page.getByRole('button', { name: 'cue taken' })).toBeDisabled();
  });

  test('the letter buttons alone can solve it, and the result shares as plain words', async ({ page }) => {
    for (const letter of 'garden') await page.getByRole('button', { name: letter, exact: true }).click();
    await expect(field(page)).toHaveValue('garden');
    await page.getByRole('button', { name: 'enter', exact: true }).click();
    const result = page.getByTestId('pulse-result');
    await expect(result).toBeFocused();
    await expect(result).toContainText('solved.');
    await expect(result).toContainText('cueory pulse, sun 1 nov: solved in 1 of 7 beats.');
    await result.getByRole('button', { name: 'copy my result' }).click();
    await expect(result).toContainText('cueory pulse, sun 1 nov: solved in 1 of 7 beats.');
    await expect(result.getByText('a new word comes tomorrow.')).toBeVisible();
  });

  test('after seven beats the game ends and shows the word', async ({ page }) => {
    for (const word of ['planet', 'carton', 'pillow', 'candle', 'lemons', 'basket', 'orange']) {
      await field(page).fill(word);
      await page.keyboard.press('Enter');
    }
    const result = page.getByTestId('pulse-result');
    await expect(result).toContainText('the word was garden.');
    await expect(result).toContainText('cueory pulse, sun 1 nov: not solved this time.');
    await expect(field(page)).toHaveCount(0);
  });
});

test.describe('daily games without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('pulse says it needs JavaScript', async ({ page }) => {
    await page.goto('/play');
    // Playwright's text matching skips <noscript>, so this uses CSS.
    await expect(page.locator('noscript p')).toHaveText('pulse needs JavaScript.');
    await expect(page.getByTestId('sample-note')).toBeVisible();
  });
});
