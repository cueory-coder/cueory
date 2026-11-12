import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { sizeOf } from './projects';

const missingPage = '/this-page-does-not-exist-task-89';

const unknownStudyPages = ['/learn/nope', '/learn/study-skills/nope'] as const;

test('a missing address shows a useful branded 404 page', async ({ page }) => {
  const response = await page.goto(missingPage);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: "that page isn't here." })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');

  const main = page.locator('main');
  const nav = main.getByRole('navigation', { name: 'other places to go' });
  await expect(nav.getByRole('link', { name: 'home' })).toHaveAttribute('href', '/');
  await expect(nav.getByRole('link', { name: 'learn' })).toHaveAttribute('href', '/learn');
  await expect(nav.getByRole('link', { name: 'play' })).toHaveAttribute('href', '/play');
  await expect(nav.getByRole('link', { name: 'support' })).toHaveAttribute('href', '/support');
  await expect(nav.getByRole('link')).toHaveCount(4);
});

for (const path of unknownStudyPages) {
  test(`${path} returns the branded 404 page`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: "that page isn't here." })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  });
}

test('the labeled search uses the site index and stays keyboard accessible', async ({ page }) => {
  await page.goto(missingPage);
  const search = page.getByRole('search', { name: 'search cueory' });
  const input = search.getByRole('searchbox', { name: 'search cueory' });
  await expect(search.getByRole('status')).toHaveAttribute('aria-atomic', 'true');
  await expect(input).toBeVisible();
  await input.focus();
  await expect(input).toBeFocused();

  await input.fill('support');
  const results = search.getByRole('list', { name: 'search results' });
  const firstResult = results.getByRole('link').first();
  await expect(firstResult).toBeVisible({ timeout: 15000 });
  await input.press('ArrowDown');
  await expect(firstResult).toBeFocused();
  await firstResult.press('ArrowUp');
  await expect(input).toBeFocused();

  await input.fill('zxqvjkpwrmntbfyhlc');
  await expect(search.getByRole('status')).toContainText('no results for', { timeout: 15000 });
  await expect(results).toBeHidden();

  await input.fill('');
  await expect(search.getByRole('status')).toBeEmpty();
});

test('the missing-page experience passes accessibility and layout checks', async ({ page }) => {
  await page.goto(missingPage);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const links = page.locator('main nav[aria-label="other places to go"] a');
  for (const link of await links.all()) {
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test('404 next steps work by keyboard and touch and pass axe in Light and Evening', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  // Test every configured project at the required size for its phone, tablet or desktop class.
  // This also covers new Playwright projects with different default viewport widths.
  const viewports = {
    phone: { width: 390, height: 844 },
    tablet: { width: 820, height: 1180 },
    desktop: { width: 1440, height: 900 },
  } as const;
  await page.setViewportSize(viewports[sizeOf(testInfo)]);

  // Stored user preferences override device media. Clear them before navigation,
  // then verify the computed palette so both axe runs audit distinct themes.
  await page.addInitScript(() => {
    try { localStorage.removeItem('cueory-theme'); } catch { /* device mode remains the fallback */ }
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const response = await page.goto(missingPage);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

    const palette = await page.evaluate(() => {
      const root = document.documentElement;
      const computed = getComputedStyle(root);
      return {
        storedOverride: root.getAttribute('data-theme'),
        mediaIsDark: matchMedia('(prefers-color-scheme: dark)').matches,
        page: computed.getPropertyValue('--color-page').trim().toLowerCase(),
        ink: computed.getPropertyValue('--color-ink').trim().toLowerCase(),
      };
    });
    expect(palette, colorScheme + ' palette must actually be active').toEqual({
      storedOverride: null,
      mediaIsDark: colorScheme === 'dark',
      page: colorScheme === 'dark' ? '#1c1917' : '#f9f5ef',
      ink: colorScheme === 'dark' ? '#f9f5ef' : '#3e2c23',
    });
    await expect(page.getByRole('searchbox', { name: 'search cueory' })).toBeVisible();

    const links = page.getByRole('navigation', { name: 'other places to go' }).getByRole('link');
    await expect(links).toHaveCount(4);
    for (const link of await links.all()) {
      const bounds = await link.boundingBox();
      expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    const searchBounds = await page.getByRole('searchbox', { name: 'search cueory' }).boundingBox();
    expect(searchBounds?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => v.id + ': ' + v.help)).toEqual([]);

    const search = page.getByRole('searchbox', { name: 'search cueory' });
    await search.focus();
    await page.keyboard.press('Tab');
    await expect(links.nth(0)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(links.nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/learn\/?$/);

    await page.goto(missingPage);
    const playLink = page.getByRole('navigation', { name: 'other places to go' }).getByRole('link', { name: 'play' });
    if (testInfo.project.use.hasTouch) await playLink.tap();
    else await playLink.click();
    await expect(page).toHaveURL(/\/play\/?$/);
  }
});
