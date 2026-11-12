import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const route = '/preview/level-test';
const choice = (page: Page, option: 'a' | 'b') =>
  page.getByRole('button', { name: '[sample] choice ' + option, exact: true });
const axe = async (page: Page) => {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.map(item => item.id + ': ' + item.help)).toEqual([]);
};

test('preview is noindex, reads as a sample and shows an initial question', async ({ page }) => {
  await page.goto(route);
  await expect(page.locator('h1')).toHaveText('sample unit level test');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByText(/choices stay on this page only, and are not saved or sent anywhere/)).toBeVisible();
  await expect(page.getByText('[sample question] one')).toBeVisible();
  await expect(page.getByTestId('level-test-announcement')).toHaveAttribute('aria-live', 'polite');
  await axe(page);
});

test('keyboard choices move focus to next heading and report results in words', async ({ page }) => {
  await page.goto(route);
  await choice(page, 'a').focus();
  expect(await choice(page, 'a').evaluate(el => {
    const style = getComputedStyle(el);
    return el.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
  })).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'sample question 2' })).toBeFocused();
  await choice(page, 'a').focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: 'sample question 3' })).toBeFocused();
  await choice(page, 'b').click();
  await expect(page.getByRole('heading', { name: 'sample question 4' })).toBeFocused();
  await choice(page, 'b').click();
  await expect(page.getByRole('heading', { name: 'sample results' })).toBeFocused();
  await expect(page.getByTestId('level-test-result-words')).toHaveText(
    '2 sample concepts checked. 0 still learning, 0 getting there, 2 got it.',
  );
  await axe(page);
  await page.getByRole('button', { name: 'try the sample again' }).click();
  await expect(page.getByRole('heading', { name: 'sample question 1' })).toBeFocused();
});

test('wrong first choice skips that concept’s higher-level question', async ({ page }) => {
  await page.goto(route);
  await choice(page, 'b').click();
  await expect(page.getByText('[sample question] two')).toBeVisible();
  await choice(page, 'a').click();
  await expect(page.getByText('[sample question] four')).toBeVisible();
  await choice(page, 'b').click();
  await expect(page.getByTestId('level-test-result-words')).toHaveText(
    '2 sample concepts checked. 1 still learning, 0 getting there, 1 got it.',
  );
  await expect(page.getByText('[sample question] three')).toHaveCount(0);
});

test('answering and restarting never stores or uploads anything', async ({ page }) => {
  await page.goto(route);
  const stored = () => page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  const before = await stored();
  const writes: string[] = [];
  page.on('request', req => { if (!['GET', 'HEAD'].includes(req.method())) writes.push(req.method()); });
  for (const option of ['a', 'a', 'b', 'b'] as const) await choice(page, option).click();
  await expect(page.getByTestId('level-test-results')).toBeVisible();
  await page.getByRole('button', { name: 'try the sample again' }).click();
  expect(await stored()).toEqual(before);
  expect(writes).toEqual([]);
});

test.describe('touchscreen', () => {
  test.use({ hasTouch: true });
  test('sample choices and restart work by tapping, not dragging', async ({ page }) => {
    await page.goto(route);
    await choice(page, 'b').tap();
    await expect(page.getByRole('heading', { name: 'sample question 2' })).toBeVisible();
    await choice(page, 'b').tap();
    await expect(page.getByTestId('level-test-results')).toBeVisible();
    await page.getByRole('button', { name: 'try the sample again' }).tap();
    await expect(page.getByRole('heading', { name: 'sample question 1' })).toBeVisible();
  });
});

for (const width of [390, 820, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test('preview ' + width + 'px ' + colorScheme + ': axe, focus, tap targets, no scroll', async ({ page }) => {
      test.slow();
      await page.setViewportSize({ width, height: width === 390 ? 844 : width === 820 ? 1180 : 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const button of await page.getByTestId('level-test-question').getByRole('button').all()) {
        const bounds = await button.boundingBox();
        expect(bounds?.width).toBeGreaterThanOrEqual(44);
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
      }
      await axe(page);
      await choice(page, 'b').click();
      await choice(page, 'b').click();
      await expect(page.getByTestId('level-test-results')).toBeVisible();
      const restart = await page.getByRole('button', { name: 'try the sample again' }).boundingBox();
      expect(restart?.width).toBeGreaterThanOrEqual(44);
      expect(restart?.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await axe(page);
    });
  }
}
