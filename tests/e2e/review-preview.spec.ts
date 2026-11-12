import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

const route = '/preview/review';
const region = (page: Page) => page.getByRole('region', { name: 'sample review session' });
const root = (page: Page) => page.locator('[data-review-preview-root]');
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function openReview(page: Page): Promise<void> {
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  await expect(region(page).getByRole('button', { name: 'show the answer' })).toBeVisible();
  await expect(region(page)).toContainText('4 cards to review today');
}

async function finish(page: Page, input: 'keyboard' | 'tap' | 'click'): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await expect(region(page)).toContainText(`card ${i + 1} of 4`);
    const reveal = region(page).getByRole('button', { name: 'show the answer' });
    if (input === 'keyboard') {
      await reveal.focus();
      await page.keyboard.press('Enter');
    } else if (input === 'tap') {
      await reveal.tap();
    } else {
      await reveal.click();
    }
    await expect(region(page).getByText('[sample back]', { exact: true })).toBeVisible();
    for (const button of await region(page).getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(box, 'sample review controls must have measurable tap targets').not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    const result = region(page).getByRole('button', { name: i % 2 === 0 ? 'know it' : 'still learning' });
    if (input === 'keyboard') {
      await result.focus();
      await page.keyboard.press('Enter');
    } else if (input === 'tap') {
      await result.tap();
    } else {
      await result.click();
    }
    if (i < 3) await expect(region(page)).toContainText(`card ${i + 2} of 4`);
  }
  await expect(region(page)).toContainText('you reviewed 4 cards: 2 you knew, 2 come back tomorrow.');
  await expect(root(page)).toHaveAttribute('data-saved-cards', '4');
}

test('uses an unlisted study layout and only labeled sample cards', async ({ page }) => {
  await openReview(page);
  await expect(page).toHaveTitle('review session preview · cueory');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('main')).not.toHaveAttribute('data-pagefind-body');
  await expect(page.getByRole('heading', { level: 1, name: 'review session' })).toBeVisible();
  await expect(region(page)).toContainText('sample day: november 5, 2026');
  await expect(region(page).getByText('[sample front]', { exact: true })).toBeVisible();
  await expect(region(page).getByText('[sample back]', { exact: true })).toHaveCount(0);
  await expect(root(page)).toHaveAttribute('data-saved-cards', '0');
});

test('keyboard completes four sample cards and moves focus to the word summary', async ({ page }) => {
  await openReview(page);
  await finish(page, 'keyboard');
  await expect(region(page).getByText(/you reviewed 4 cards:/)).toBeFocused();
  await expect(region(page).getByRole('button', { name: 'show the answer' })).toHaveCount(0);
});

test.describe('real touch input', () => {
  test.use({ hasTouch: true });

  test('taps can complete the same session without dragging', async ({ page }) => {
    await openReview(page);
    await finish(page, 'tap');
  });
});

test('Space reveals and rates a card, and grading actions stay hidden until the answer appears', async ({ page }) => {
  await openReview(page);
  await expect(region(page).getByRole('button', { name: 'know it' })).toHaveCount(0);
  await expect(region(page).getByRole('button', { name: 'still learning' })).toHaveCount(0);
  const reveal = region(page).getByRole('button', { name: 'show the answer' });
  await reveal.focus();
  await expect(reveal).toBeFocused();
  await page.keyboard.press('Space');
  await expect(region(page).getByText('[sample back]', { exact: true })).toBeVisible();
  await expect(region(page).getByRole('button', { name: 'show the answer' })).toHaveCount(0);
  const missed = region(page).getByRole('button', { name: 'still learning' });
  await missed.focus();
  await expect(missed).toBeFocused();
  await page.keyboard.press('Space');
  await expect(region(page)).toContainText('card 2 of 4');
  await expect(root(page)).toHaveAttribute('data-saved-cards', '1');
  // The outcome must be spoken in words at completion, not communicated only by color.
  await finishRemaining(page);
});

async function finishRemaining(page: Page): Promise<void> {
  for (let i = 1; i < 4; i++) {
    await expect(region(page)).toContainText(`card ${i + 1} of 4`);
    await region(page).getByRole('button', { name: 'show the answer' }).click();
    await expect(region(page).getByText('[sample back]', { exact: true })).toBeVisible();
    await region(page).getByRole('button', { name: 'know it' }).click();
  }
  await expect(region(page)).toContainText('you reviewed 4 cards: 3 you knew, 1 comes back tomorrow.');
  await expect(root(page)).toHaveAttribute('data-saved-cards', '4');
}

test('answers are kept only in page memory, never sent or restored after reload', async ({ page }) => {
  const writes: string[] = [];
  const accountRequests: string[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.method() + ' ' + request.url());
    if (/supabase|\/auth\/v1\/|\/rest\/v1\//i.test(request.url())) accountRequests.push(request.url());
  });
  await openReview(page);
  await region(page).getByRole('button', { name: 'show the answer' }).click();
  await region(page).getByRole('button', { name: 'know it' }).click();
  await expect(root(page)).toHaveAttribute('data-saved-cards', '1');
  expect(writes).toEqual([]);
  expect(accountRequests).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('cueory-progress'))).toBeNull();
  await page.reload();
  await expect(region(page).getByRole('button', { name: 'show the answer' })).toBeVisible();
  await expect(region(page)).toContainText('card 1 of 4');
  await expect(root(page)).toHaveAttribute('data-saved-cards', '0');
  expect(writes).toEqual([]);
  expect(accountRequests).toEqual([]);
});

for (const width of [390, 820, 1440]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`axe and no overflow at ${width}px in ${scheme} mode, before and after review`, async ({ page }, info) => {
      // The same viewport-and-palette pair runs once per available desktop engine.
      test.skip(!isDesktopOfEachEngine(info), 'Size and palette matrix runs from desktop browser projects');
      await page.setViewportSize({ width, height: width === 390 ? 844 : width === 820 ? 1180 : 900 });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await openReview(page);
      const audit = async () => {
        const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect(await root(page).evaluate((node) =>
          node.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length)).toBe(0);
      };
      await audit();
      // This matrix checks axe and layouts. Real tapping is exercised by the touch project above.
      await finish(page, 'click');
      await audit();
    });
  }
}
