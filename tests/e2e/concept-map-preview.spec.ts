import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const route = '/preview/concept-map';
const statuses = ['got it', 'getting there', 'learning', 'not started'] as const;
const sizes = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
] as const;

for (const colorScheme of ['light', 'dark'] as const) {
  for (const viewport of sizes) {
    test(`sample concept filters, accessible labels and sizing at ${viewport.width}px in ${colorScheme}`, async ({ page }) => {
      test.slow();
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto(route);

      await expect(page.getByRole('heading', { level: 1, name: 'concept map' })).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
      await expect(page.locator('main')).not.toHaveAttribute('data-pagefind-body');
      const map = page.getByTestId('concept-map');
      await expect(map).toBeVisible();
      await expect(page.locator('astro-island').filter({ has: map })).not.toHaveAttribute('ssr', '');
      await expect(page.getByTestId('concept-counts')).toHaveText('2 got it, 2 getting there, 2 learning, 2 not started.');

      const list = map.getByRole('list', { name: 'concepts' });
      await expect(list.getByRole('listitem')).toHaveCount(8);
      for (const status of statuses) {
        const button = map.getByRole('button', { name: status, exact: true });
        const bounds = await button.boundingBox();
        expect(bounds?.width).toBeGreaterThanOrEqual(44);
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
        await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await expect(list.getByRole('listitem')).toHaveCount(2);
        await expect(map.getByText('2 concepts shown.')).toBeVisible();
        await expect(list.getByText(status, { exact: true })).toHaveCount(2);
      }
      await map.getByRole('button', { name: 'all', exact: true }).click();
      await expect(list.getByRole('listitem')).toHaveCount(8);
      await expect(map.getByText('8 concepts shown.')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(axe.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
    });
  }
}

test('filtering works by keyboard with focus retained', async ({ page }) => {
  await page.goto(route);
  const map = page.getByTestId('concept-map');
  await expect(page.locator('astro-island').filter({ has: map })).not.toHaveAttribute('ssr', '');
  const selected = map.getByRole('button', { name: 'learning', exact: true });
  await selected.focus();
  await page.keyboard.press('Enter');
  await expect(selected).toBeFocused();
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect(map.getByRole('list', { name: 'concepts' }).getByRole('listitem')).toHaveCount(2);
  await page.keyboard.press('Tab');
  await expect(map.getByRole('button', { name: 'not started', exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(map.getByRole('button', { name: 'not started', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test.describe('touch input', () => {
  test.use({ hasTouch: true });

  test('tapping a filter changes the list and the visible count', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    const map = page.getByTestId('concept-map');
    await expect(page.locator('astro-island').filter({ has: map })).not.toHaveAttribute('ssr', '');
    await map.getByRole('button', { name: 'getting there', exact: true }).tap();
    await expect(map.getByText('2 concepts shown.')).toBeVisible();
    await expect(map.getByRole('list', { name: 'concepts' }).getByRole('listitem')).toHaveCount(2);
  });
});

test.describe('no JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('explains the static preview limitation in words', async ({ page }) => {
    await page.goto(route);
    const notice = await page.locator('main noscript p').evaluate((element) => element.textContent ?? '');
    expect(notice).toContain('turn on javascript to use the sample concept filters');
  });
});
