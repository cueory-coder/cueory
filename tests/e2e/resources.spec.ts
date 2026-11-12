import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const toc = [
  { name: 'how to use cueory', href: '#how-to' },
  { name: 'how learning works', href: '#learning' },
  { name: 'tips', href: '#tips' },
  { name: 'nurse pay by state', href: '#pay' },
  { name: 'adhd tools', href: '#adhd' },
  { name: 'rate my nursing school', href: '#schools' },
] as const;

const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.removeItem('cueory-theme');
    } catch {
      // The page must also work when storage is unavailable.
    }
  });
});

test('is hidden from search, navigation and the sitemap', async ({ page, request }) => {
  const response = await page.goto('/resources');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('resources · cueory');
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', /\bnoindex\b/);
  await expect(page.locator('main[data-pagefind-body]')).toHaveCount(0);
  await expect(page.locator('header a[href="/resources"], footer a[href="/resources"]')).toHaveCount(0);

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).not.toContain('/resources');

  const anchors = await page.locator('main a[href]').evaluateAll((links) =>
    links.map((link) => link.getAttribute('href')),
  );
  expect(anchors).toEqual(toc.map((section) => section.href));
  await expect(page.locator('fieldset select')).toHaveCount(3);
  for (const select of await page.locator('fieldset select').all()) {
    await expect(select).toBeDisabled();
  }
  await expect(page.getByRole('heading', { level: 1, name: 'resources.' })).toBeVisible();
  for (const section of toc) {
    await expect(page.getByRole('heading', { level: 2, name: section.name })).toBeVisible();
  }
  await expect(page.locator('[data-placeholder="resource"]').first()).toBeVisible();
});

test('has six keyboard-operable table-of-contents links in order', async ({ page }) => {
  await page.goto('/resources');
  const links = page.getByRole('navigation', { name: 'on this page' }).getByRole('link');
  await expect(links).toHaveCount(toc.length);

  await page.keyboard.press('Tab'); // Keyboard modality makes the focus outline visible.
  await links.first().focus();
  for (let i = 0; i < toc.length; i++) {
    await expect(links.nth(i)).toBeFocused();
    await expect(links.nth(i)).toHaveAttribute('href', toc[i]!.href);
    const focus = await links.nth(i).evaluate((link) => {
      const style = getComputedStyle(link);
      return { width: Number.parseFloat(style.outlineWidth), kind: style.outlineStyle };
    });
    expect(focus.kind).not.toBe('none');
    expect(focus.width).toBeGreaterThanOrEqual(1);
    if (i < toc.length - 1) await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#schools$/);
});

for (const theme of ['light', 'dark'] as const) {
  test('has no axe violations, small targets or sideways overflow in ' + theme + ' mode', async ({ page }) => {
    // The project's phone, tablet and desktop configurations cover 390, 820 and 1440.
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const response = await page.goto('/resources');
    expect(response?.status()).toBe(200);
    expect([390, 820, 1440]).toContain(page.viewportSize()?.width);
    await page.evaluate(() => document.fonts.ready.then(() => true));

    const tapHeights = await page.getByRole('navigation', { name: 'on this page' }).getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getBoundingClientRect().height));
    expect(tapHeights).toHaveLength(toc.length);
    expect(tapHeights.every((height) => height >= 44)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    if (page.viewportSize()!.width < 640) {
      await expect(page.locator('table')).toBeHidden();
      await expect(page.locator('[data-pay-mobile]')).toBeVisible();
    } else {
      await expect(page.locator('table')).toBeVisible();
      await expect(page.locator('[data-pay-mobile]')).toBeHidden();
    }

    const accessibility = await new AxeBuilder({ page }).withTags(axeTags).analyze();
    expect(accessibility.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
  });
}
