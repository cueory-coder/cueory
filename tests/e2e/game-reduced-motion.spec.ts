import { expect, test, type Locator } from '@playwright/test';

async function expectStill(root: Locator) {
  const moving = await root.evaluate((element) => {
    const seconds = (value: string) => value.split(',').map((part) => {
      const text = part.trim();
      return Number.parseFloat(text) / (text.endsWith('ms') ? 1000 : 1);
    });
    return [element, ...element.querySelectorAll('*')].flatMap((node) => {
      const box = node.getBoundingClientRect();
      if (!box.width || !box.height) return [];
      return [null, '::before', '::after'].flatMap((pseudo) => {
        const style = getComputedStyle(node, pseudo);
        if (style.display === 'none' || style.visibility === 'hidden') return [];
        const animation = style.animationName !== 'none' && seconds(style.animationDuration).some((n) => n > 0.001);
        const transition = style.transitionProperty !== 'none' && seconds(style.transitionDuration).some((n) => n > 0.001);
        const scripted = !pseudo && node.getAnimations().some((item) => {
          const duration = item.effect?.getComputedTiming().duration;
          return item.playState === 'running' && typeof duration === 'number' && duration > 1;
        });
        return animation || transition || scripted ? [node.tagName + (pseudo ?? '')] : [];
      });
    });
  });
  expect(moving).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* optional storage */ }
  });
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`pillo, crossword and sudoku remain still during input in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
    await page.goto('/play');
    const pillo = page.getByTestId('pulse');
    await pillo.getByLabel('your guess', { exact: true }).fill('a');
    await expect(pillo.locator('.pillo-typed')).toHaveCount(1);
    await expectStill(pillo);
    const crossword = page.getByTestId('cueword');
    const square = crossword.getByRole('button', { name: /^row 1, column 2,/ });
    await square.click();
    await page.keyboard.type('a');
    await expect(square).toContainText(/a/i);
    await expectStill(crossword);
    const sudoku = page.getByTestId('sudoku');
    const empty = sudoku.locator('[role="gridcell"][data-given="false"]').first();
    await empty.click();
    await page.keyboard.press('x');
    await expect(empty).toHaveText('x');
    await expectStill(sudoku);
  });

  test(`word path never starts a reduced-motion shake in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
    await page.addInitScript(() => {
      const original = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        if (this.matches('.wordpath-board')) this.setAttribute('data-shake-started', 'true');
        return original.apply(this, args);
      };
    });
    await page.goto('/play');
    const game = page.getByTestId('suture');
    await game.locator('[data-cell="0,0"]').click();
    await game.locator('[data-cell="0,2"]').click();
    await expect(page.getByTestId('suture-live')).toHaveText('not a word in this puzzle.');
    await expect(game.locator('.wordpath-board')).not.toHaveAttribute('data-shake-started', 'true');
    await expectStill(game);
  });

  test(`an active word-path shake stops when reduced motion is enabled in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme });
    await page.addInitScript(() => {
      const original = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        const animation = original.apply(this, args);
        if (this.matches('.wordpath-board')) {
          // Hold the real animation open so this checks cancellation rather than natural completion.
          animation.effect?.updateTiming({ duration: 60_000 });
          animation.addEventListener('cancel', () => this.setAttribute('data-shake-cancelled', 'true'));
        }
        return animation;
      };
    });
    await page.goto('/play');
    const game = page.getByTestId('suture');
    const board = game.locator('.wordpath-board');
    await game.locator('[data-cell="0,0"]').click();
    await game.locator('[data-cell="0,2"]').click();
    await expect(page.getByTestId('suture-live')).toHaveText('not a word in this puzzle.');
    expect(await board.evaluate((node) => node.getAnimations().some((item) => item.playState === 'running'))).toBe(true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(board).toHaveAttribute('data-shake-cancelled', 'true');
    await expectStill(game);
    // The interaction and text feedback still work after cancellation.
    await game.locator('[data-cell="5,5"]').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('suture-live')).toHaveText('pick cleared.');
  });

  test(`hello cards and depth switch swap without motion in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
    await page.goto('/play/hello-cards');
    const card = page.getByTestId('hello-card');
    await expect(card).toBeEnabled();
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('hello-card-back')).toBeVisible();
    await expectStill(card);
    const toggle = page.getByRole('switch', { name: 'deep convo', exact: true });
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expectStill(toggle);
    await expectStill(card);
  });

  test(`stat keeps readable time without a moving transition in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
    await page.clock.install({ time: new Date('2026-11-01T15:00:00') });
    await page.goto('/play/stat');
    await page.getByTestId('stat-start').click();
    await expect(page.getByTestId('stat-progress')).toHaveText('question 1 of 15');
    await page.clock.runFor(2_000);
    await expect(page.getByTestId('stat-seconds')).toContainText('18');
    await expectStill(page.getByTestId('stat'));
  });
}
