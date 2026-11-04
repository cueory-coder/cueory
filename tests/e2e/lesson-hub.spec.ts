import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { studyModes } from '../../src/config/modes';

const modeOrder = ['cards', 'learn', 'matching', 'organizer', 'fill-in', 'label-it', 'questions'] as const;
const oldLinkLabels: Record<(typeof modeOrder)[number], string> = {
  cards: 'practice this lesson with cards',
  learn: "learn this lesson's cards in learn mode",
  matching: "match this lesson's terms and meanings",
  organizer: 'sort ideas into groups with the organizer',
  'fill-in': 'recall the missing word with fill-in',
  'label-it': "uncover a diagram's labels with label it",
  questions: 'practice questions with rationales',
};

test('the hub uses seven canonical modes and preserves every existing destination', async ({ page }) => {
  const response = await page.goto('/learn/study-skills');
  expect(response?.status()).toBe(200);
  await expect(page.locator('main header p').first()).toHaveText('how to study for nursing school · lesson 1');
  const grid = page.getByTestId('mode-grid');
  const tiles = grid.locator('[data-mode-tile]');
  await expect(tiles).toHaveCount(modeOrder.length);
  expect(await tiles.evaluateAll((items) => items.map((item) => item.getAttribute('data-mode-tile')))).toEqual([...modeOrder]);

  for (const id of modeOrder) {
    const mode = studyModes.find((item) => item.id === id);
    expect(mode?.link?.href).toBeTruthy();
    const tile = grid.locator('[data-mode-tile="' + id + '"]');
    await expect(tile.getByRole('heading', { level: 3 })).toHaveText(mode!.name);
    // The mode's line waits behind the ⓘ beside its name (Christian, 2026-11-02).
    await expect(tile.locator('p')).toHaveCount(0);
    const info = tile.getByRole('button', { name: `more about ${mode!.name}` });
    await expect(info).toHaveAttribute('aria-expanded', 'false');
    await expect(tile.locator('[data-infotip-panel]')).toBeHidden();
    await expect(tile.locator('[data-infotip-panel]')).toHaveText(mode!.text);
    await expect(tile.locator('.mode-art svg[aria-hidden="true"]')).toHaveCount(1);
    const link = tile.getByRole('link', { name: oldLinkLabels[id] });
    await expect(link).toHaveAttribute('href', mode!.link!.href);
    const target = await page.request.get(mode!.link!.href);
    expect(target.status()).toBe(200);
  }
});

test('the original sentence-by-sentence reader and its keyboard controls remain', async ({ page }) => {
  await page.goto('/learn/study-skills');
  await expect(page.locator('main h1')).toHaveCount(1);
  await expect(page.getByTestId('study-reader').getByRole('heading', { level: 2, name: 'read the lesson' })).toBeVisible();
  await expect(page.getByText('Sentence 1 of')).toBeVisible();
  await page.getByRole('button', { name: 'Next sentence' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Sentence 2 of')).toBeVisible();
  await expect(page.getByText('this lesson is a placeholder.', { exact: false })).toBeVisible();
  await expect(page.locator('main iframe')).toHaveCount(0);
});

test('keyboard navigation follows the visual order of the seven modes', async ({ page }) => {
  await page.goto('/learn/study-skills');
  const links = page.getByTestId('mode-grid').getByRole('link');
  await expect(links).toHaveCount(modeOrder.length);
  await links.first().focus();
  for (let index = 0; index < modeOrder.length; index++) {
    await expect(links.nth(index)).toBeFocused();
    await expect(links.nth(index)).toContainText(oldLinkLabels[modeOrder[index]]!);
    if (index + 1 < modeOrder.length) {
      // Each tile's ⓘ, beside its name, comes before its link.
      await page.keyboard.press('Tab');
      const next = studyModes.find((mode) => mode.id === modeOrder[index + 1])!;
      await expect(page.getByRole('button', { name: `more about ${next.name}` })).toBeFocused();
      await page.keyboard.press('Tab');
    }
  }
});

test('the grid fits phone, tablet and desktop, with no sideways scroll and axe clean', async ({ page }) => {
  await page.goto('/learn/study-skills');
  const grid = page.getByTestId('mode-grid');
  for (const { width, height, columns } of [
    { width: 320, height: 640, columns: 2 },
    { width: 390, height: 844, columns: 2 },
    { width: 820, height: 1180, columns: 3 },
    { width: 1440, height: 900, columns: 4 },
  ]) {
    await page.setViewportSize({ width, height });
    const actual = await grid.evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(/\s+/).filter(Boolean).length);
    expect(actual).toBe(columns);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const link of await grid.getByRole('link').all()) {
      const bounds = await link.boundingBox();
      expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations.map((v) => v.id + ': ' + v.help)).toEqual([]);
  }
});

test('reduced motion does not move hovered mode tiles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/learn/study-skills');
  const first = page.getByTestId('mode-grid').locator('[data-mode-tile]').first();
  await first.hover();
  expect(await first.evaluate((element) => getComputedStyle(element).translate)).toBe('none');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('all mode links and the full lesson text are still available', async ({ page }) => {
    await page.goto('/learn/study-skills');
    await expect(page.getByTestId('mode-grid').getByRole('link')).toHaveCount(modeOrder.length);
    await expect(page.locator('main noscript ol li')).toHaveCount(3);
  });
});
