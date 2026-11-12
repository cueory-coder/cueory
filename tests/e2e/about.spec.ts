import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const headings = [
  'about cueory',
  'our mission',
  'how we make our lessons',
  "what's coming",
  'help keep cueory free.',
] as const;

test.describe('about page', () => {
  test('shows the design sections with founder-owned copy, without publishing unfinished text', async ({ page }) => {
    await page.goto('/about');

    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.locator('main h1, main h2')).toHaveText([...headings]);
    await expect(page.locator('main section')).toHaveCount(4);

    const paragraphs = page.locator('main p');
    await expect(paragraphs).toHaveCount(8);
    for (const paragraph of await paragraphs.all()) {
      await expect(paragraph).toHaveAttribute('data-placeholder', 'CHRISTIAN-TEXT');
      await expect(paragraph).toHaveText('[Christian writes this]');
    }

    await expect(page.locator('main section').nth(1).locator('li')).toHaveCount(3);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.getByRole('link', { name: 'get launch updates' })).toHaveAttribute('href', '/#signup');
    await expect(page.getByRole('link', { name: 'support our mission' })).toHaveAttribute('href', '/support');
  });

  for (const viewport of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'tablet', width: 820, height: 1180 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`${viewport.name} ${colorScheme}: accessible, readable and without sideways scroll`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.emulateMedia({ colorScheme });
        await page.goto('/about');

        await expect(page.getByRole('heading', { level: 1, name: 'about cueory' })).toBeVisible();
        await expect(page.locator('main .veil')).toHaveCount(4);

        const headingFont = await page.locator('main h1').evaluate((element) => getComputedStyle(element).fontFamily);
        const bodyFont = await page.locator('main p').first().evaluate((element) => getComputedStyle(element).fontFamily);
        expect(headingFont).toContain('Bodoni Moda');
        expect(bodyFont).toContain('Lato');

        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        for (const link of await page.locator('main a').all()) {
          const bounds = await link.boundingBox();
          expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44);
          expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(44);
        }

        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
      });
    }
  }
});
