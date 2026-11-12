import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const cases = [
  ['note', 'note'],
  ['remember', 'remember'],
  ['try-it', 'try it'],
] as const;

for (const theme of ['light', 'dark'] as const) {
  test(`the reading preview shows a comfortable layout and labeled callouts in ${theme} mode`, async ({ page }) => {
    const response = await page.goto('/preview/prose');
    expect(response?.status()).toBe(200);
    // The theme switch is in the footer's links panel, behind its chevron (Task 85).
    await page.getByRole('button', { name: 'show footer links', exact: true }).click();
    await page.getByRole('radio', { name: theme, exact: true }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.getByRole('heading', { level: 1, name: 'reading preview' })).toBeVisible();
    const reading = page.locator('article.reading-copy');
    await expect(reading).toBeVisible();
    await expect(reading.locator('h2')).toHaveCount(2);
    await expect(reading.locator('ul > li')).toHaveCount(3);
    await expect(reading.locator('ol > li')).toHaveCount(2);

    for (const [kind, label] of cases) {
      const note = reading.locator(`[data-callout-kind="${kind}"]`);
      await expect(note).toHaveCount(1);
      await expect(note.getByText(label, { exact: true })).toBeVisible();
      await expect(note.locator('svg[aria-hidden="true"]')).toHaveCount(1);
    }

    const metrics = await reading.evaluate((el) => {
      const css = getComputedStyle(el);
      const term = el.querySelector<HTMLElement>('.key-term');
      return {
        width: el.getBoundingClientRect().width,
        maxWidth: parseFloat(css.maxWidth),
        lineHeight: css.lineHeight,
        termBackground: term ? getComputedStyle(term).backgroundColor : '',
      };
    });
    expect(metrics.width).toBeLessThanOrEqual(metrics.maxWidth + 1);
    expect(parseFloat(metrics.lineHeight)).toBeGreaterThan(24);
    expect(metrics.termBackground).not.toBe('rgba(0, 0, 0, 0)');
    expect(metrics.termBackground).not.toBe('');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const report = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(report.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test('reading preview displays each component with only labeled sample content', async ({ page }) => {
  await page.goto('/preview/prose');
  const reading = page.locator('article.reading-copy');
  await expect(reading.locator('[data-callout-kind]')).toHaveCount(3);
  await expect(reading.locator('[data-callout-kind="note"]')).toContainText('[sample note]');
  await expect(reading.locator('[data-callout-kind="remember"]')).toContainText('[sample remember item]');
  await expect(reading.locator('[data-callout-kind="try-it"]')).toContainText('[sample activity]');
  await expect(reading.locator('strong.key-term')).toHaveText('[sample key term]');

  const contentLabel = reading.getByRole('link', { name: 'disclaimer' });
  await expect(contentLabel).toBeVisible();
  await expect(contentLabel).toHaveAttribute('href', '/disclaimer');

  const placeholder = reading.locator('[data-placeholder="CHRISTIAN-TEXT"]');
  await expect(placeholder).toHaveCount(1);
  await expect(placeholder).toContainText('Placeholder: [sample placeholder heading]');
  await expect(placeholder).toContainText('[sample placeholder body]');
});

for (const viewport of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`reading parts: ${viewport.name} ${theme} keyboard, tap target and axe`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.goto('/preview/prose');

      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
      await expect(page.locator('article.reading-copy')).toBeVisible();
      await expect(page.locator('article.reading-copy [data-callout-kind]')).toHaveCount(3);
      await expect(page.locator('article.reading-copy [data-placeholder="CHRISTIAN-TEXT"]')).toHaveCount(1);

      const link = page.locator('article.reading-copy').getByRole('link', { name: 'disclaimer' });
      await expect(link).toBeVisible();
      await link.focus();
      await expect(link).toBeFocused();
      expect(await link.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
      const bounds = await link.boundingBox();
      expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(44);

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      const report = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(report.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
    });
  }
}
