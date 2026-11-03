import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const sizes = [
  { width: 320, height: 720 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
] as const;

test.beforeEach(async ({ page }) => {
  // The once-per-visit welcome panel has its own tests; avoid interrupting study controls here.
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* blocked storage */ }
  });
});

async function checkAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('matching has accessible cards, progress and a complete keyboard flow at three sizes', async ({ page }) => {
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto('/learn/study-skills/matching');
    const terms = page.getByRole('region', { name: 'Terms' });
    const meanings = page.getByRole('region', { name: 'Meanings' });
    const progress = page.getByRole('progressbar', { name: 'matching progress' });
    await expect(progress).toHaveAttribute('aria-valuemin', '0');
    await expect(progress).toHaveAttribute('aria-valuemax', '3');
    await expect(progress).toHaveAttribute('aria-valuenow', '0');

    for (let n = 1; n <= 3; n++) {
      const term = terms.getByRole('button', { name: new RegExp(`^Placeholder card ${n}, front\\.`) });
      const meaning = meanings.getByRole('button', { name: new RegExp(`^Placeholder card ${n}, back\\.`) });
      await term.focus();
      await page.keyboard.press('Enter');
      await expect(term).toHaveAttribute('aria-pressed', 'true');
      await expect(term).toContainText('selected');
      await meaning.focus();
      await page.keyboard.press('Enter');
      await expect(meaning).toBeFocused();
      await expect(meaning).toHaveAttribute('aria-disabled', 'true');
      await expect(meaning).toContainText('Matched');
      await expect(progress).toHaveAttribute('aria-valuenow', String(n));
      await expect(progress).toHaveAttribute('aria-valuetext', `${n} of 3 matched`);
      const fraction = await progress.locator('.progress-fill').evaluate((element) => Number.parseFloat((element as HTMLElement).style.getPropertyValue('--progress')));
      expect(fraction).toBeCloseTo(n / 3);
    }

    await expect(page.getByText('All 3 matched.')).toBeVisible();
    await checkAccessible(page);
    const playAgain = page.getByRole('button', { name: 'Play again' });
    await playAgain.focus();
    await page.keyboard.press('Enter');
    await expect(progress).toHaveAttribute('aria-valuenow', '0');
  }
});

test('organizer completes entirely by keyboard with progress and announcements at three sizes', async ({ page }) => {
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto('/learn/study-skills/organizer');
    const board = page.getByTestId('organizer');
    const live = board.getByTestId('organizer-live');
    const progress = board.getByRole('progressbar', { name: 'organizer progress' });
    const item = (text: string) => board.getByRole('button', { name: new RegExp(`^${text}(?:\\s|$)`) });
    const group = (text: string) => board.getByRole('button', { name: text, exact: true });
    await expect(progress).toHaveAttribute('aria-valuemax', '8');
    await expect(progress).toHaveAttribute('aria-valuenow', '0');

    // Enter + Enter moves focus to the first destination, then back to the placed item.
    await item('apple').focus();
    await page.keyboard.press('Enter');
    await expect(item('apple')).toHaveAttribute('aria-pressed', 'true');
    await expect(item('apple')).toContainText('selected');
    await expect(group('1. fruit')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(item('apple')).toBeFocused();
    await expect(live).toHaveText('apple moved to fruit.');

    await item('pear').focus();
    await page.keyboard.press('1');
    await expect(item('pear')).toBeFocused();

    for (const [name, key] of [
      ['plum', '1'], ['carrot', '2'], ['spinach', '2'],
      ['onion', '2'], ['rice', '3'], ['oats', '3'],
    ] as const) {
      await item(name).focus();
      await page.keyboard.press(key);
    }

    const checkButton = board.getByRole('button', { name: 'check' });
    await checkButton.focus();
    await page.keyboard.press('Enter');
    await expect(live).toHaveText('8 right, 0 back in the tray to try again.');
    await expect(board.getByTestId('organizer-result')).toContainText('all 8 sorted in 1 try.');
    await expect(board.getByTestId('organizer-result')).toBeFocused();
    await expect(progress).toHaveAttribute('aria-valuenow', '8');
    await expect(progress).toHaveAttribute('aria-valuetext', '8 of 8 sorted correctly');
    await expect(progress.locator('.progress-fill')).toHaveAttribute('style', /--progress: 1/);
    await checkAccessible(page);
    const again = board.getByRole('button', { name: 'sort again' });
    await again.focus();
    await page.keyboard.press('Enter');
    await expect(progress).toHaveAttribute('aria-valuenow', '0');
    await expect(board.getByRole('list', { name: 'tray' }).getByRole('button')).toHaveCount(8);
  }
});

test('organizer retains the touch-friendly pick and destination controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/learn/study-skills/organizer');
  const board = page.getByTestId('organizer');
  const carrot = board.getByRole('button', { name: /^carrot(?:\s|$)/ });
  await carrot.click();
  await expect(carrot).toHaveAttribute('aria-pressed', 'true');
  await board.getByRole('button', { name: '2. vegetable', exact: true }).click();
  await expect(board.getByTestId('organizer-live')).toHaveText('carrot moved to vegetable.');
  await expect(board.getByRole('list', { name: 'vegetable' }).getByRole('button', { name: /^carrot/ })).toBeVisible();
  await checkAccessible(page);
});

async function recordFeedback(page: Page) {
  await page.addInitScript(() => {
    const original = Element.prototype.animate;
    const record = window as Window & { __cueoryFeedback?: Animation[] };
    record.__cueoryFeedback = [];
    Element.prototype.animate = function (frames, options) {
      const animation = original.call(this, frames, options);
      if (this instanceof HTMLButtonElement) {
        // Keep the effect running until the test changes the motion preference.
        animation.pause();
        record.__cueoryFeedback!.push(animation);
      }
      return animation;
    };
  });
}

async function correctFeedback(page: Page, mode: 'matching' | 'organizer') {
  if (mode === 'matching') {
    await page.getByRole('region', { name: 'Terms' }).getByRole('button', { name: 'Placeholder card 1, front.' }).click();
    await page.getByRole('region', { name: 'Meanings' }).getByRole('button', { name: /^Placeholder card 1, back\./ }).click();
    await expect(page.getByText('Matched: Placeholder card 1, front.')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'matching progress' })).toHaveAttribute('aria-valuenow', '1');
  } else {
    const board = page.getByTestId('organizer');
    await board.getByRole('button', { name: /^apple(?:\s|$)/ }).click();
    await board.getByRole('button', { name: '1. fruit', exact: true }).click();
    await board.getByRole('button', { name: 'check', exact: true }).click();
    await expect(board.getByRole('progressbar', { name: 'organizer progress' })).toHaveAttribute('aria-valuenow', '1');
    await expect(board.getByTestId('organizer-live')).toContainText('1 right');
  }
}

for (const mode of ['matching', 'organizer'] as const) {
  test(`${mode}: reduced motion gives immediate feedback without Web Animations`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await recordFeedback(page);
    await page.goto('/learn/study-skills/' + mode);
    await correctFeedback(page, mode);
    // Flush the post-render effect before checking that no animation was requested.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const count = await page.evaluate(() => (window as Window & { __cueoryFeedback?: Animation[] }).__cueoryFeedback?.length);
    expect(count).toBe(0);
  });

  test(`${mode}: enabling reduced motion cancels feedback already in progress`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await recordFeedback(page);
    await page.goto('/learn/study-skills/' + mode);
    await correctFeedback(page, mode);
    await expect.poll(() => page.evaluate(() => (window as Window & { __cueoryFeedback?: Animation[] }).__cueoryFeedback?.length)).toBe(mode === 'matching' ? 2 : 1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => page.evaluate(() => (window as Window & { __cueoryFeedback?: Animation[] }).__cueoryFeedback?.map((animation) => animation.playState))).toEqual(mode === 'matching' ? ['idle', 'idle'] : ['idle']);
  });
}
