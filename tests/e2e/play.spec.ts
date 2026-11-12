import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dailySudokuSeed, generateSudoku } from '../../src/islands/sudoku';

/**
 * Daily games (D-61): pillo (Task 114; its id is still pulse) on /play. The page's clock is set to 1 November 2026, the
 * first day, so today's sample word is "grace" (content/games/pulse/sample-01.json).
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

/*
  While the page scrolls down, the sticky header tucks itself away just above the screen (SiteHeader), and axe counts it
  as covering whatever small buttons happen to sit there, out of sight. So axe runs from the top of the page, once the
  header is back in place, and the result no longer depends on how far a test happened to scroll.
*/
const axe = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => (document.querySelector('header')?.getBoundingClientRect().top ?? 0) >= 0);
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
};
const field = (page: Page) => page.getByLabel('your guess', { exact: true });
const live = (page: Page) => page.getByTestId('pulse-live');

test.describe('daily games: pillo (Task 114)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
    await page.goto('/play');
    await expect(page.getByTestId('pulse')).toBeVisible();
  });

  const status = (page: Page) => page.getByTestId('pulse').locator('.pillo-status');
  const strip = (page: Page) => page.getByTestId('pulse-strip').locator('.pillo-strip-pill');

  test('the page names the four games, says the puzzle is a sample, and passes axe', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'daily games' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'pillo' })).toBeVisible();
    await expect(page.getByTestId('sample-note')).toHaveText("today's word is a sample.");
    await expect(status(page)).toHaveText('guess the 5-letter word · 6 of 6 guesses left');
    await expect(strip(page)).toHaveCount(6);
    // Six rows of five pockets, the first one ringed for the first letter.
    await expect(page.getByTestId('pulse').locator('.pillo-pack .pillo-pocket')).toHaveCount(30);
    await expect(page.getByTestId('pulse').locator('.pillo-next')).toHaveCount(1);
    for (const name of ['crossword', 'sudoku', 'word path']) await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    const results = await axe(page);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('a typed guess is marked by symbol and in words, and the letter keys learn the marks', async ({ page }) => {
    await field(page).fill('crane');
    await page.keyboard.press('Enter');
    await expect(live(page)).toHaveText(
      'c, elsewhere in the word. r, in place. a, in place. n, not in the word. e, in place. 5 guesses left.',
    );
    const row = page.getByRole('listitem', { name: /^guess 1: crane\./ });
    await expect(row).toBeVisible();
    // Every pill carries its symbol, so no mark depends on color.
    await expect(row.locator('.pillo-mark')).toHaveText(['○', '●', '●', '·', '●']);
    await expect(row.locator('.pillo-letter')).toHaveText(['C', 'R', 'A', 'N', 'E']);
    await expect(page.getByRole('button', { name: 'r, in place' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'c, elsewhere in the word' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'n, not in the word' })).toBeVisible();
    await expect(status(page)).toHaveText('guess the 5-letter word · 5 of 6 guesses left');
    // A used guess leaves an empty pocket in the strip.
    await expect(strip(page)).toHaveCount(5);
    // Focus stays in the field for the next guess.
    await expect(field(page)).toBeFocused();
  });

  test('a guess of the wrong length is explained and spends nothing', async ({ page }) => {
    await field(page).fill('grac');
    await page.getByTestId('pulse').getByRole('button', { name: 'enter', exact: true }).click();
    await expect(page.getByTestId('pulse-problem')).toHaveText('the word has 5 letters.');
    await expect(live(page)).toHaveText('the word has 5 letters.');
    await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(status(page)).toHaveText('guess the 5-letter word · 6 of 6 guesses left');
    await expect(page.getByRole('list', { name: 'your guesses' }).getByRole('listitem')).toHaveCount(0);
  });

  test('the row being typed shows plain pills and rings the next pocket; there is no cue', async ({ page }) => {
    const pulse = page.getByTestId('pulse');
    await pulse.getByRole('button', { name: 'g', exact: true }).click();
    await pulse.getByRole('button', { name: 'r', exact: true }).click();
    await expect(pulse.locator('.pillo-typed')).toHaveText(['G', 'R']);
    await expect(pulse.locator('.pillo-next')).toHaveCount(1);
    await pulse.getByRole('button', { name: 'delete', exact: true }).click();
    await expect(field(page)).toHaveValue('g');
    await expect(pulse.locator('.pillo-typed')).toHaveCount(1);
    await expect(pulse.getByRole('button', { name: /cue/ })).toHaveCount(0);
  });

  test('with reduced motion, a typed pill does not pop in', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await field(page).fill('g');
    const pill = page.getByTestId('pulse').locator('.pillo-typed').first();
    await expect(pill).toBeVisible();
    expect(await pill.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });

  test('every mark passes axe in the evening palette too', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await field(page).fill('crane');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listitem', { name: /^guess 1: crane\./ })).toBeVisible();
    const results = await axe(page);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('the letter keys alone can solve it, and the result shares as one plain line', async ({ page }) => {
    // The crossword below has letter buttons too, so these stay inside pillo.
    const pulse = page.getByTestId('pulse');
    for (const letter of 'grace') await pulse.getByRole('button', { name: letter, exact: true }).click();
    await expect(field(page)).toHaveValue('grace');
    await pulse.getByRole('button', { name: 'enter', exact: true }).click();
    const result = page.getByTestId('pulse-result');
    await expect(result).toBeFocused();
    await expect(result).toContainText('solved.');
    await expect(result).toContainText('cueory pillo, sun 1 nov: solved in 1 of 6');
    await result.getByRole('button', { name: 'copy my result' }).click();
    await expect(result).toContainText('cueory pillo, sun 1 nov: solved in 1 of 6');
    await expect(result.getByText('a new word comes tomorrow.')).toBeVisible();
    await expect(page.getByRole('listitem', { name: /^guess 1: grace\./ }).locator('.pillo-mark')).toHaveText(
      Array(5).fill('●'),
    );
  });

  test('after six guesses the game ends and shows the word', async ({ page }) => {
    for (const word of ['crane', 'plant', 'lemon', 'music', 'pilot', 'coast']) {
      await field(page).fill(word);
      await page.keyboard.press('Enter');
    }
    const result = page.getByTestId('pulse-result');
    await expect(result).toContainText('the word was grace.');
    await expect(result).toContainText('cueory pillo, sun 1 nov: not solved this time');
    await expect(field(page)).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'your guesses' }).getByRole('listitem')).toHaveCount(6);
    await expect(page.getByTestId('pulse-strip').locator('.pillo-strip-pill')).toHaveCount(0);
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
  test('at 320 px nothing scrolls sideways, and every letter key and pill stays on screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    // 3 November: the third sample, "blend".
    await page.clock.setFixedTime(new Date('2026-11-03T15:00:00'));
    await page.goto('/play');
    // Two wrong guesses: the game goes on, so the letter keys stay on screen too.
    for (const word of ['plane', 'candy']) {
      await field(page).fill(word);
      await page.keyboard.press('Enter');
    }
    await expect(page.getByRole('listitem', { name: /^guess 2: candy\./ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const outside = await page.evaluate(() =>
      [...document.querySelectorAll('.pillo-key, .pillo-pill')]
        .map((el) => el.getBoundingClientRect())
        .filter((box) => box.left < 0 || box.right > window.innerWidth).length,
    );
    expect(outside).toBe(0);
    // The three logical QWERTY rows can wrap onto extra visual lines on narrow phones.
    // Check actual touch-target size and non-overlap, not horizontal center order.
    const rows = await page.locator('.pillo-key-row').evaluateAll((rowEls) =>
      rowEls.map((row) => [...row.querySelectorAll('.pillo-key')].map((el) => el.getBoundingClientRect())),
    );
    expect(rows.length).toBe(3);
    const keys = rows.flat();
    for (const key of keys) {
      expect(key.width).toBeGreaterThanOrEqual(44);
      expect(key.height).toBeGreaterThanOrEqual(44);
    }
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i]!;
        const b = keys[j]!;
        const separated = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        expect(separated, `keys ${i} and ${j} should not overlap at 320 px`).toBe(true);
      }
    }
  });

});

test.describe('daily games: sudoku (Task 625)', () => {
  const day = '2026-11-01';
  const daily = generateSudoku(dailySudokuSeed(day, 'easy'), 'easy');
  const open = daily.puzzle.flatMap((value, index) => value === 0 ? [index] : []);
  const game = (page: Page) => page.getByTestId('sudoku');
  const grid = (page: Page) => game(page).getByRole('grid', { name: 'sudoku grid' });
  const cells = (page: Page) => grid(page).getByRole('gridcell');

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
    await page.goto('/play');
    await expect(game(page)).toBeVisible();
  });

  test('shows one daily easy puzzle with the approved givens, controls and accessible page', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 2, name: 'sudoku' })).toHaveCount(1);
    await expect(cells(page)).toHaveCount(81);
    await expect(grid(page).getByRole('row')).toHaveCount(9);
    for (const row of await grid(page).getByRole('row').all()) await expect(row.getByRole('gridcell')).toHaveCount(9);
    await expect(grid(page).locator('[data-given="true"]')).toHaveCount(40);
    await expect(game(page).getByRole('button', { name: 'easy' })).toHaveAttribute('aria-pressed', 'true');
    const controls = game(page).locator('.sudoku-icon-button, .sudoku-small-button, .sudoku-number-row button');
    const boxes = await controls.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect()));
    for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);
    const results = await axe(page);
    expect(results.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('supports pointer and keyboard entry, roving arrows and all three levels', async ({ page }) => {
    const first = open[0]!;
    const firstCell = cells(page).nth(first);
    await firstCell.click();
    const column = Number(await firstCell.getAttribute('aria-colindex'));
    await page.keyboard.press(column === 9 ? 'ArrowLeft' : 'ArrowRight');
    await expect(grid(page).locator('[aria-selected="true"]')).toBeFocused();

    await firstCell.click();
    const wrong = daily.solution[first] === 1 ? 2 : 1;
    await page.keyboard.press(String(wrong));
    await expect(game(page).locator('.sudoku-errors')).toContainText('error: 1');
    await expect(page.getByTestId('sudoku-live')).toContainText('is not right');

    const second = open[1]!;
    await cells(page).nth(second).click();
    await game(page).getByRole('button', { name: String(daily.solution[second]), exact: true }).click();
    await expect(cells(page).nth(second)).toContainText(String(daily.solution[second]));

    await game(page).getByRole('button', { name: 'medium' }).click();
    await expect(grid(page).locator('[data-given="true"]')).toHaveCount(32);
    await game(page).getByRole('button', { name: 'hard' }).click();
    await expect(grid(page).locator('[data-given="true"]')).toHaveCount(26);
  });

  test('pause hides all 81 squares and gameboard settings persist separately from the site theme', async ({ page }) => {
    const pause = game(page).getByRole('button', { name: 'pause puzzle' });
    await pause.click();
    const before = await game(page).locator('.sudoku-time').innerText();
    await expect(cells(page).filter({ hasText: /^x$/ })).toHaveCount(81);
    await expect(cells(page).first()).toHaveAttribute('aria-label', /hidden while paused/);
    await expect(game(page).locator('.sudoku-time')).toHaveText(before);
    await game(page).getByRole('button', { name: 'resume puzzle' }).click();

    const trigger = game(page).getByRole('button', { name: /settings/i });
    await trigger.click();
    const dialog = game(page).getByRole('dialog', { name: 'settings' });
    const close = dialog.getByRole('button', { name: 'close settings' });
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('checkbox', { name: 'play sound on solve' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await expect(dialog.getByRole('radio')).toHaveCount(0);
    await dialog.getByRole('checkbox', { name: 'start in auto candidate mode' }).check();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();

    await page.reload();
    await game(page).getByRole('button', { name: /settings/i }).click();
    await expect(game(page).getByRole('dialog', { name: 'settings' }).getByRole('checkbox', { name: 'start in auto candidate mode' })).toBeChecked();
    await page.keyboard.press('Escape');
    const hints = game(page).getByRole('checkbox', { name: /hints/i });
    await expect(hints).toHaveAttribute('aria-checked', 'true');
    await hints.click();
    await expect(hints).toHaveAttribute('aria-checked', 'false');
    await expect(game(page).locator('.sudoku-candidates')).toHaveCount(0);
  });

  test('keeps 44 px Sudoku cells on a phone, and print isolates only givens plus cueory.app', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const boxes = await cells(page).evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect()));
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    const editable = grid(page).locator('[data-given="false"]').first();
    await editable.click();
    await page.keyboard.press('1');
    await page.evaluate(() => { window.print = () => {}; });
    await game(page).getByRole('button', { name: 'print this puzzle' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-print-game', 'sudoku');
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('pulse')).toBeHidden();
    await expect(game(page).locator('.sudoku-title-row')).toBeHidden();
    await expect(editable.locator('> *')).toBeHidden();
    await expect(grid(page).locator('[data-given="true"]').first()).toBeVisible();
    await expect(game(page).locator('.sudoku-print-footer')).toHaveText('cueory.app');
    await expect(game(page).locator('.sudoku-print-footer')).toBeVisible();

    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('html')).not.toHaveAttribute('data-print-game', /.+/);
  });

  test('solves the puzzle, focuses the result and emits the Worker 2 result hook', async ({ page }) => {
    await page.evaluate(() => {
      window.addEventListener('cueory:sudoku-solved', ((event: CustomEvent) => {
        document.documentElement.dataset.sudokuResult = JSON.stringify(event.detail);
      }) as EventListener, { once: true });
      window.addEventListener('cueory:game-result', ((event: CustomEvent) => {
        if (event.detail?.game === 'triage') document.documentElement.dataset.sudokuMisreported = 'true';
      }) as EventListener);
    });
    for (const index of open) {
      await cells(page).nth(index).click();
      await page.keyboard.press(String(daily.solution[index]));
    }
    const result = page.getByTestId('sudoku-result');
    await expect(result).toBeFocused();
    await expect(result).toContainText('solved.');
    await expect(result).toContainText('0 errors');
    const detail = JSON.parse((await page.locator('html').getAttribute('data-sudoku-result'))!);
    expect(detail).toMatchObject({ game: 'sudoku', day, level: 'easy', solved: true, errors: 0 });
    await expect(page.locator('html')).not.toHaveAttribute('data-sudoku-misreported', 'true');
  });
});

test.describe('daily games: crossword levels (Task 627)', () => {
  const board = (page: Page) => page.getByTestId('cueword');

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
    await page.goto('/play');
    await expect(board(page)).toBeVisible();
  });

  test('starts on the labeled 5 by 5 sample with a clue bar and no side clue list', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 2, name: 'crossword' })).toBeVisible();
    await expect(page.getByTestId('crossword-levels').getByLabel('easy, 5 by 5')).toBeChecked();
    await expect(board(page)).toContainText("today's puzzle is a sample");
    await expect(board(page).getByTestId('cueword-clue')).toContainText('1 across');
    await expect(board(page).getByTestId('cueword-clue')).toContainText('[sample clue]');
    await expect(board(page).getByRole('grid', { name: 'crossword grid' })).toHaveAttribute('aria-rowcount', '5');
    await expect(board(page).getByRole('list')).toHaveCount(0);
    await expect(board(page).getByRole('button', { name: /check|reveal/i })).toHaveCount(0);
    const results = await axe(page);
    expect(results.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
  });

  test('switches among 5, 7 and 15 square boards without overflow at 390, 820 or 1440 px', async ({ page }) => {
    for (const width of [390, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [label, size] of [['mid, 7 by 7', '7'], ['hard, 15 by 15', '15'], ['easy, 5 by 5', '5']] as const) {
        await page.getByTestId('crossword-levels').locator('label', { hasText: label.split(',')[0] }).click();
        const grid = board(page).getByRole('grid', { name: 'crossword grid' });
        await expect(grid).toHaveAttribute('aria-rowcount', size);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const cells = grid.locator('.crossword-cell');
        const first = await cells.first().boundingBox();
        const last = await cells.last().boundingBox();
        expect(first).not.toBeNull();
        expect(last).not.toBeNull();
        if (size !== '15') expect(first!.width).toBeGreaterThanOrEqual(44);
        expect(first!.x).toBeGreaterThanOrEqual(0);
        expect(last!.x + last!.width).toBeLessThanOrEqual(width);
      }
    }
  });

  test('a filled selected cell passes contrast in Light and Evening', async ({ page }) => {
    const first = board(page).getByRole('grid', { name: 'crossword grid' }).locator('.crossword-cell').first();
    await first.focus();
    await page.keyboard.type('a');
    await first.click();
    for (const theme of ['light', 'dark']) {
      await page.locator('html').evaluate((element, value) => element.setAttribute('data-theme', value), theme);
      const results = await axe(page);
      expect(results.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
    }
  });

  test('tap toggles direction, Tab leaves the grid and Alt+Arrow changes words', async ({ page }) => {
    const grid = board(page).getByRole('grid', { name: 'crossword grid' });
    const activeCell = grid.locator('button[tabindex="0"]');
    await activeCell.click();
    await expect(board(page).getByTestId('cueword-clue')).toContainText('1 down');

    await activeCell.focus();
    await page.keyboard.press('Alt+ArrowRight');
    await expect(board(page).getByTestId('cueword-clue')).not.toContainText('1 down');
    await expect(grid).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowLeft Alt+ArrowRight');

    await grid.locator('button[tabindex="0"]').focus();
    await page.keyboard.press('Tab');
    await expect(board(page).getByRole('group', { name: 'letters' }).getByRole('button').first()).toBeFocused();
  });

  test('solves the easy sample and exposes the plain solved result', async ({ page }) => {
    const sample = ['.ABC.', 'DEFGH', 'IJKLM', 'NOPQR', '.STU.'];
    for (const [row, letters] of sample.entries()) {
      for (const [column, letter] of [...letters].entries()) {
        if (letter === '.') continue;
        const cell = board(page).getByRole('button', { name: new RegExp('^row ' + (row + 1) + ', column ' + (column + 1) + ',') });
        await cell.click();
        await page.keyboard.type(letter);
      }
    }
    const result = board(page).getByTestId('cueword-result');
    await expect(result).toBeFocused();
    await expect(result).toContainText('solved.');
    await expect(result).toContainText('easy');
  });

  test('print isolates a blank grid, every clue and the cueory.app footer', async ({ page }) => {
    await board(page).getByRole('button', { name: 'row 1, column 2, 1 across, empty' }).click();
    await page.keyboard.type('a');
    await page.evaluate(() => { window.print = () => undefined; });
    await board(page).getByRole('button', { name: 'print this puzzle' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-print-game', 'crossword');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#pulse-heading')).toBeHidden();
    await expect(page.getByTestId('crossword-levels')).toBeHidden();
    await expect(board(page).locator('.crossword-toolbar')).toHaveCSS('display', 'none');
    await expect(board(page).getByTestId('cueword-clue')).toHaveCSS('display', 'none');
    await expect(board(page).locator('.crossword-entry').first()).toHaveCSS('visibility', 'hidden');
    await expect(board(page).locator('.crossword-print-clues')).toHaveCSS('display', 'grid');
    await expect(board(page).locator('.crossword-print-clues')).toContainText('across');
    await expect(board(page).locator('.crossword-print-clues')).toContainText('down');
    await expect(board(page).locator('.crossword-print-footer')).toBeVisible();
    await expect(board(page).locator('.crossword-print-footer')).toHaveText('cueory.app');
    await expect(page.locator('#word-path-heading')).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('html')).not.toHaveAttribute('data-print-game');
  });

  test('phone controls remain 44 px and hard mode never scrolls the page sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/play');
    await page.getByTestId('crossword-levels').locator('label', { hasText: 'hard' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const hardCell = await board(page).locator('.crossword-cell').first().boundingBox();
    expect(hardCell?.width).toBeGreaterThanOrEqual(24);
    expect(hardCell?.width).toBeLessThanOrEqual(40);
    const controls = board(page).locator('.crossword-toolbar button, .crossword-no-print [role="group"] button');
    const boxes = await controls.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect()));
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(390);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('daily games: word path (D-71)', () => {
  // Word path became a themed word search in Task 97; its full browser tests are in word-path.spec.ts.
  test("today's sample is labeled and themed, and axe passes", async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
    await page.goto('/play');
    await expect(page.getByRole('heading', { level: 2, name: 'word path' })).toBeVisible();
    await expect(page.getByTestId('suture').getByRole('heading', { level: 3, name: 'study break' })).toBeVisible();
    await expect(page.getByTestId('suture')).toContainText('sample puzzle');
    await expect(page.getByRole('list', { name: 'words to find' }).getByRole('listitem')).toHaveCount(12);
    await expect(page.getByRole('heading', { name: 'coming soon' })).toHaveCount(0);
    const results = await axe(page);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('daily games: private stats (D-76)', () => {
  const panel = (page: Page) => page.getByTestId('game-stats');
  const toggle = (page: Page) => panel(page).getByRole('switch', { name: 'keep my stats' });
  const kept = (page: Page) => page.evaluate(() => localStorage.getItem('cueory-game-stats'));
  const pulseStats = (page: Page) =>
    panel(page).getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'pillo', exact: true }) });
  // Today's word on 1 November is "grace", so one guess solves it.
  const solvePulse = async (page: Page) => {
    await field(page).fill('grace');
    await field(page).press('Enter');
    await expect(page.getByTestId('pulse-result')).toContainText('solved.');
  };

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
    await page.goto('/play');
    await expect(toggle(page)).toBeVisible();
  });

  test('stats are off until the student turns them on, and nothing is kept while they are off', async ({ page }) => {
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
    await expect(panel(page)).toContainText('off: nothing is kept.');
    await solvePulse(page);
    expect(await kept(page)).toBeNull();
    await page.reload();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
    expect(await kept(page)).toBeNull();
  });

  test('turned on right after a game, it counts that game, keeps it after a reload, and passes axe', async ({ page }) => {
    await solvePulse(page);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await expect(pulseStats(page)).toContainText('played 1 day, solved 1.');
    await expect(pulseStats(page)).toContainText('1 guess on 1 day.');
    expect(JSON.parse((await kept(page))!)).toEqual({
      version: 1,
      results: [{ game: 'pulse', day: '2026-11-01', solved: true, tries: 1 }],
    });
    expect((await axe(page)).violations).toEqual([]);

    await page.reload();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await expect(pulseStats(page)).toContainText('played 1 day, solved 1.');
    // Playing the same day again changes nothing: the first result of the day counts.
    await solvePulse(page);
    await expect(page.getByTestId('stats-live')).toHaveText("pillo: today's first game is already in your stats.");
    await expect(pulseStats(page)).toContainText('played 1 day, solved 1.');
    expect(JSON.parse((await kept(page))!).results).toHaveLength(1);
  });

  test('"forget" and turning stats off delete what was kept, and keyboard focus stays in the panel', async ({ page }) => {
    await toggle(page).click();
    await solvePulse(page);
    await expect(pulseStats(page)).toContainText('played 1 day, solved 1.');

    await panel(page).getByRole('button', { name: 'forget pillo' }).focus();
    await page.keyboard.press('Enter');
    await expect(pulseStats(page)).toContainText('not played yet.');
    await expect(panel(page).getByRole('heading', { name: 'pillo', exact: true })).toBeFocused();
    expect(JSON.parse((await kept(page))!).results).toEqual([]);

    await toggle(page).focus();
    await page.keyboard.press('Enter');
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
    await expect(toggle(page)).toBeFocused();
    await expect(page.getByTestId('stats-live')).toHaveText('stats are off, and what was kept is forgotten.');
    expect(await kept(page)).toBeNull();
  });

  test('turning stats off in one tab holds in another tab that is already open', async ({ page, context }) => {
    await toggle(page).click();
    const other = await context.newPage();
    await other.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
    await other.goto('/play');
    await expect(toggle(other)).toHaveAttribute('aria-checked', 'true');

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
    // The other tab shows it at once, and a game finished there keeps nothing.
    await expect(toggle(other)).toHaveAttribute('aria-checked', 'false');
    await solvePulse(other);
    expect(await kept(other)).toBeNull();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
    await other.close();
  });

  test('a round held while stats are off is dropped when another tab turns stats on and off', async ({
    page,
    context,
  }) => {
    // Stats are off, so this round waits in this tab in case the student turns stats on here.
    await solvePulse(page);
    const other = await context.newPage();
    await other.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
    await other.goto('/play');
    await toggle(other).click();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await toggle(other).click();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
    await other.close();

    // Turning stats on here doesn't bring back a round from before they were turned off.
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await expect(pulseStats(page)).toContainText('not played yet.');
    expect(JSON.parse((await kept(page))!).results).toEqual([]);
  });

  test('a round waiting for the stats panel to load is dropped when another tab turns stats on and off', async ({
    page,
    context,
  }) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/_astro\/GameStatsPanel\.[^/]+\.js$/, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/play');
    await expect(page.getByTestId('pulse')).toBeVisible();
    await expect(toggle(page)).toHaveCount(0);
    await solvePulse(page);

    const other = await context.newPage();
    await other.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
    await other.goto('/play');
    await toggle(other).click();
    await expect(toggle(other)).toHaveAttribute('aria-checked', 'true');
    await toggle(other).click();
    await expect(toggle(other)).toHaveAttribute('aria-checked', 'false');
    await other.close();

    release();
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await expect(pulseStats(page)).toContainText('not played yet.');
    expect(JSON.parse((await kept(page))!).results).toEqual([]);
  });

  test('a page back from the back/forward cache drops a round it was holding', async ({ page }) => {
    await solvePulse(page);
    // As if another tab turned stats on and off while this page was away: a page doesn't hear its own storage
    // changes, and a cached page hears no one's.
    await page.evaluate(() => {
      localStorage.setItem('cueory-game-stats', JSON.stringify({ version: 1, results: [] }));
      localStorage.removeItem('cueory-game-stats');
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await toggle(page).click();
    await expect(pulseStats(page)).toContainText('not played yet.');
    expect(JSON.parse((await kept(page))!).results).toEqual([]);
  });

  test('a tab that missed the news still checks before keeping a game', async ({ page }) => {
    await toggle(page).click();
    // As if another tab turned stats off and this one never heard: a page doesn't hear its own storage changes.
    await page.evaluate(() => localStorage.removeItem('cueory-game-stats'));
    await solvePulse(page);
    await expect(page.getByTestId('stats-live')).toHaveText("stats are off now, so this game wasn't kept.");
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
    expect(await kept(page)).toBeNull();
  });

  test('anything older than 400 days is deleted when daily games open', async ({ page }) => {
    const recent = { game: 'triage', day: '2026-10-30', solved: true, tries: 0 };
    await page.evaluate(
      (results) => localStorage.setItem('cueory-game-stats', JSON.stringify({ version: 1, results })),
      [{ game: 'pulse', day: '2025-09-27', solved: true, tries: 3 }, recent],
    );
    await page.reload();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await expect(pulseStats(page)).toContainText('not played yet.');
    await expect(
      panel(page).getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'sort', exact: true }) }),
    ).toContainText('played 1 day, solved 1.');
    // Deleted from this browser, not only hidden.
    expect(JSON.parse((await kept(page))!).results).toEqual([recent]);
  });

  test('a round finished before the stats panel has loaded still counts when stats are turned on', async ({ page }) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/_astro\/GameStatsPanel\.[^/]+\.js$/, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/play');
    await expect(page.getByTestId('pulse')).toBeVisible();
    await expect(toggle(page)).toHaveCount(0);
    await solvePulse(page);

    release();
    await toggle(page).click();
    await expect(pulseStats(page)).toContainText('played 1 day, solved 1.');
    expect(JSON.parse((await kept(page))!).results).toEqual([
      { game: 'pulse', day: '2026-11-01', solved: true, tries: 1 },
    ]);
  });

  test('a round finished before the panel loads is dropped when another tab forgets stats', async ({
    page,
    context,
  }) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/_astro\/GameStatsPanel\.[^/]+\.js$/, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/play');
    await expect(page.getByTestId('pulse')).toBeVisible();
    await expect(toggle(page)).toHaveCount(0);
    await solvePulse(page);

    // Another tab: turn stats on, finish pillo there, then forget all stats (they stay on).
    const other = await context.newPage();
    await other.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
    await other.goto('/play');
    await toggle(other).click();
    await solvePulse(other);
    await expect(pulseStats(other)).toContainText('played 1 day, solved 1.');
    await other.getByRole('button', { name: 'forget all my stats' }).click();
    await expect(pulseStats(other)).toContainText('not played yet.');
    await other.close();

    // The panel loads with stats still on, and the forgotten round doesn't come back.
    release();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await expect(pulseStats(page)).toContainText('not played yet.');
    expect(JSON.parse((await kept(page))!).results).toEqual([]);
  });

  test('at 320 px the panel fits, and its buttons are at least 44 px tall', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await toggle(page).click();
    await solvePulse(page);
    await expect(pulseStats(page)).toContainText('played 1 day, solved 1.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    for (const button of [toggle(page), ...(await panel(page).getByRole('button').all())]) {
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
  });
});

test.describe('daily games without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('pillo and sudoku say they need JavaScript', async ({ page }) => {
    await page.goto('/play');
    // Playwright's text matching skips <noscript>, so this uses CSS.
    await expect(page.locator('noscript p')).toHaveText([
      'pillo needs JavaScript.',
      'sudoku needs JavaScript.',
      'crossword needs JavaScript.',
      'word path needs JavaScript.',
    ]);
    await expect(page.getByTestId('sample-note')).toBeVisible();
  });
});
