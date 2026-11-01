import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Daily games (D-61): pulse on /play. The page's clock is set to 1 November 2026, the first day, so today's sample
 * word is "garden" (content/games/pulse/sample-01.json).
 */
// The once-only promo panel (D-59) slides down after 5 seconds and takes keyboard focus, which would interrupt these
// tests part-way, so every page here starts as if it had already been shown (as in pages.spec.ts).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // Storage is blocked: the panel never shows then anyway.
    }
  });
});

const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
const field = (page: Page) => page.getByLabel('your guess', { exact: true });
const live = (page: Page) => page.getByTestId('pulse-live');
const term = (page: Page, name: string) =>
  page.getByRole('list', { name: 'terms to sort' }).getByRole('button', { name, exact: true });
const place = (page: Page, name: string) =>
  page.getByRole('group', { name: 'groups' }).getByRole('button', { name: new RegExp(`^${name},`) });

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
    for (const name of ['crossword', 'sort', 'word path']) await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
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
    // The crossword below has letter buttons too, so these stay inside pulse.
    const pulse = page.getByTestId('pulse');
    for (const letter of 'garden') await pulse.getByRole('button', { name: letter, exact: true }).click();
    await expect(field(page)).toHaveValue('garden');
    await pulse.getByRole('button', { name: 'enter', exact: true }).click();
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

test.describe('daily games on the home page (D-61)', () => {
  test('a calm section after "ways to study" leads to today\'s game', async ({ page }) => {
    await page.goto('/');
    const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
    expect(headings.indexOf('daily games')).toBe(headings.indexOf('ways to study') + 1);
    const link = page.getByTestId('games-link');
    await expect(link).toHaveText("play today's games");
    await expect(link).toHaveAttribute('href', '/play');
    await link.click();
    await expect(page).toHaveURL(/\/play$/);
    await expect(page.getByRole('heading', { level: 1, name: 'daily games' })).toBeVisible();
  });
});

test.describe('daily games on a narrow phone', () => {
  test('at 320 px nothing scrolls sideways, and every letter button and guessed letter stays on screen', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    // 3 November: the third sample, "blanket", the longest word (7 letters).
    await page.clock.setFixedTime(new Date('2026-11-03T15:00:00'));
    await page.goto('/play');
    // Two wrong 7-letter guesses: the game goes on, so the letter buttons stay on screen too.
    for (const word of ['pillows', 'cabinet']) {
      await field(page).fill(word);
      await page.keyboard.press('Enter');
    }
    await expect(page.getByRole('listitem', { name: /^guess 2: cabinet\./ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const outside = await page.evaluate(() =>
      [...document.querySelectorAll('.pulse-key, .pulse-letter')]
        .map((el) => el.getBoundingClientRect())
        .filter((box) => box.left < 0 || box.right > window.innerWidth).length,
    );
    expect(outside).toBe(0);
    // Each letter button keeps a 44 px height, and their middles stay at least 24 px apart (WCAG 2.5.8).
    const keys = await page.locator('.pulse-key-row').first().locator('.pulse-key').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect()),
    );
    for (const key of keys) expect(key.height).toBeGreaterThanOrEqual(44);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i]!.left + keys[i]!.width / 2 - (keys[i - 1]!.left + keys[i - 1]!.width / 2)).toBeGreaterThanOrEqual(24);
    }
  });

  test('at 320 px triage fits too: every term and group is on screen, each at least 44 px tall', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.clock.setFixedTime(new Date('2026-11-03T15:00:00'));
    await page.goto('/play');
    // 3 November: the third sample, with the longest group name ("musical instruments").
    await page.getByRole('list', { name: 'terms to sort' }).getByRole('button').first().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const boxes = await page.locator('.triage-term, .triage-place-button').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect()),
    );
    expect(boxes).toHaveLength(14);
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(320);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('daily games: triage (D-63)', () => {
  // 1 November: the first sample. fruits: apple, pear, mango; weather: rain, fog, hail; furniture: chair, sofa, desk;
  // and violin fits none of them.
  const answer: Record<string, string[]> = {
    fruits: ['apple', 'pear', 'mango'],
    weather: ['rain', 'fog', 'hail'],
    furniture: ['chair', 'sofa', 'desk'],
    'none of these': ['violin'],
  };
  const triageLive = (page: Page) => page.getByTestId('triage-live');

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
    await page.goto('/play');
    await expect(page.getByTestId('triage')).toBeVisible();
  });

  test('pick a term, then its group: a right place shows it there with ✓, and axe passes', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 2, name: 'sort' })).toBeVisible();
    await expect(page.getByTestId('triage-sample-note')).toHaveText("today's terms are a sample.");
    await expect(page.getByTestId('triage-status')).toHaveText('10 terms to sort · 3 slips left');
    await term(page, 'mango').click();
    await expect(term(page, 'mango')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('triage-picked')).toHaveText('picked: mango. now pick its group.');
    await expect(place(page, 'fruits')).toHaveAccessibleName('fruits, 0 of 3, put mango here');
    const results = await axe(page);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await place(page, 'fruits').click();
    await expect(triageLive(page)).toHaveText('mango goes in fruits. 9 terms left.');
    await expect(page.getByRole('list', { name: 'in fruits' })).toHaveText('✓ mango');
    await expect(term(page, 'mango')).toHaveCount(0);
    await expect(page.getByTestId('triage-status')).toHaveText('9 terms to sort · 3 slips left');
    await expect(place(page, 'fruits')).toHaveAccessibleName('fruits, 1 of 3');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('tapping a picked term again puts it back, and a group with nothing picked asks for a term', async ({ page }) => {
    await place(page, 'weather').click();
    await expect(triageLive(page)).toHaveText('pick a term first.');
    await term(page, 'fog').click();
    await term(page, 'fog').click();
    await expect(term(page, 'fog')).toHaveAttribute('aria-pressed', 'false');
    await expect(triageLive(page)).toHaveText('fog put back.');
    await expect(page.getByTestId('triage-status')).toHaveText('10 terms to sort · 3 slips left');
  });

  test('a wrong group is a slip, said in words; the third ends the round and shows where each term goes', async ({
    page,
  }) => {
    await term(page, 'violin').click();
    await place(page, 'fruits').click();
    await expect(triageLive(page)).toHaveText("slip: violin isn't in fruits. 2 slips left.");
    await expect(page.getByTestId('triage-status')).toHaveText('10 terms to sort · 2 slips left');
    // The term stays picked, so it can go somewhere else.
    await expect(term(page, 'violin')).toHaveAttribute('aria-pressed', 'true');
    await place(page, 'weather').click();
    await expect(triageLive(page)).toHaveText("slip: violin isn't in weather. 1 slip left.");
    await place(page, 'furniture').click();
    const result = page.getByTestId('triage-result');
    await expect(result).toBeFocused();
    await expect(result).toContainText('out of slips.');
    await expect(page.getByTestId('triage-answer').getByRole('listitem')).toHaveText([
      'fruits: apple, pear, mango.',
      'weather: rain, fog, hail.',
      'furniture: chair, sofa, desk.',
      'none of these: violin.',
    ]);
    await expect(result).toContainText('cueory sort, sun 1 nov: not sorted this time.');
    await expect(page.getByRole('list', { name: 'terms to sort' })).toHaveCount(0);
    await expect(page.getByTestId('triage-status')).toHaveCount(0);
    await expect(place(page, 'fruits')).toBeDisabled();
  });

  test('the odd one out fits none of the groups, and putting a group term there is a slip', async ({ page }) => {
    await term(page, 'pear').click();
    await place(page, 'none of these').click();
    await expect(triageLive(page)).toHaveText('slip: pear belongs in one of the groups. 2 slips left.');
    await term(page, 'violin').click();
    await place(page, 'none of these').click();
    await expect(triageLive(page)).toHaveText('violin fits none of the groups. 9 terms left.');
    await expect(page.getByRole('list', { name: 'in none of these' })).toHaveText('✓ violin');
  });

  test('the keyboard alone sorts the whole round, and the result shares as plain words', async ({ page }) => {
    const groups = Object.keys(answer);
    for (const [group, terms] of Object.entries(answer)) {
      for (const name of terms) {
        await term(page, name).focus();
        await page.keyboard.press('Enter');
        // Enter on a term moves focus to the first group; Tab goes on to the others.
        await expect(place(page, 'fruits')).toBeFocused();
        for (let i = 0; i < groups.indexOf(group); i++) await page.keyboard.press('Tab');
        await expect(place(page, group)).toBeFocused();
        await page.keyboard.press('Enter');
      }
    }
    const result = page.getByTestId('triage-result');
    await expect(result).toBeFocused();
    await expect(result).toContainText('sorted.');
    await expect(result).toContainText('cueory sort, sun 1 nov: sorted with no slips.');
    await result.getByRole('button', { name: 'copy my result' }).click();
    await expect(result).toContainText('cueory sort, sun 1 nov: sorted with no slips.');
    await expect(result.getByText('a new puzzle comes tomorrow.')).toBeVisible();
    // Each group lists its terms in the order they were dealt, each with ✓.
    for (const [group, terms] of Object.entries(answer)) {
      const shown = await page.getByRole('list', { name: `in ${group}` }).getByRole('listitem').allInnerTexts();
      expect(shown.sort()).toEqual(terms.map((name) => `✓ ${name}`).sort());
    }
  });

  test('after a right place by keyboard, focus goes back to the terms still to sort', async ({ page }) => {
    await term(page, 'rain').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(place(page, 'weather')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('list', { name: 'terms to sort' }).getByRole('button').first()).toBeFocused();
  });
});

test.describe('daily games: crossword (D-70)', () => {
  // 1 November: the first sample. 1 across STAR, 3 across APPLE; 1 down SOFA, 2 down RAIL.
  const clues = (page: Page, direction: 'across' | 'down') =>
    page.getByRole('list', { name: `${direction} clues` }).getByRole('button');
  const fill = async (page: Page, direction: 'across' | 'down', index: number, word: string) => {
    await clues(page, direction).nth(index).click();
    await page.keyboard.type(word);
  };

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
    await page.goto('/play');
    await expect(page.getByTestId('cueword')).toBeVisible();
  });

  test("today's sample is labeled, its first clue shows, and axe passes", async ({ page }) => {
    await expect(page.getByRole('heading', { level: 2, name: 'crossword' })).toBeVisible();
    await expect(page.getByTestId('cueword')).toContainText("today's puzzle is a sample");
    await expect(page.getByTestId('cueword-clue')).toHaveText('1 across: it twinkles in the night sky');
    await expect(page.getByRole('grid', { name: 'crossword grid' })).toBeVisible();
    const results = await axe(page);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('check marks a wrong letter with a symbol and says it in words', async ({ page }) => {
    await fill(page, 'across', 0, 'stax');
    await page.getByRole('button', { name: 'check', exact: true }).click();
    await expect(page.getByTestId('cueword-live')).toHaveText('1 letter is wrong in 1 across. 0 cells are empty.');
    await expect(page.getByRole('button', { name: /^row 1, column 4,/ })).toContainText('×');
  });

  test('typing from the clue list solves it, and the result shares as plain words', async ({ page }) => {
    await fill(page, 'across', 0, 'star');
    await fill(page, 'across', 1, 'apple');
    await fill(page, 'down', 0, 'sofa');
    await fill(page, 'down', 1, 'rail');
    const result = page.getByTestId('cueword-result');
    await expect(result).toBeFocused();
    await expect(result).toContainText('solved.');
    await expect(result).toContainText('cueory crossword, sun 1 nov: solved in 0:00 with 0 cues.');
  });

  test('at 320 px the grid, the letters and the clues fit, each button at least 44 px tall', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/play');
    await expect(page.getByTestId('cueword')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const boxes = await page
      .getByTestId('cueword')
      .getByRole('button')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(320);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('daily games without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('pulse and triage say they need JavaScript', async ({ page }) => {
    await page.goto('/play');
    // Playwright's text matching skips <noscript>, so this uses CSS.
    await expect(page.locator('noscript p')).toHaveText([
      'pulse needs JavaScript.',
      'sort needs JavaScript.',
      'crossword needs JavaScript.',
    ]);
    await expect(page.getByTestId('sample-note')).toBeVisible();
    await expect(page.getByTestId('triage-sample-note')).toBeVisible();
  });
});
