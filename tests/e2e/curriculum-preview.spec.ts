import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { parseLessonMap } from '../../src/islands/lessonmap';
import { curriculumStatus } from '../../src/lessons/curriculumstatus';
import { contentCatalog } from '../lessonroutes';

const csv = readFileSync(new URL('../../docs/curriculum/medsurg-lesson-map.csv', import.meta.url), 'utf8');
const outline = parseLessonMap(csv);
const expected = curriculumStatus(outline.units, contentCatalog().lessons);
const route = '/preview/curriculum';

test('preview renders the complete outline as identifiers and text statuses', async ({ page }) => {
  expect(outline.problems).toEqual([]);
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'curriculum status', level: 1 })).toBeVisible();
  await expect(page.getByTestId('curriculum-totals')).toContainText(
    `${expected.units.length} units · ${expected.lessonCount} planned lessons · ${expected.builtCount} built`
  );
  await expect(page.locator('[data-curriculum-unit]')).toHaveCount(expected.units.length);
  await expect(page.locator('[data-curriculum-topic]')).toHaveCount(
    expected.units.reduce((count, unit) => count + unit.topics.length, 0)
  );
  await expect(page.locator('[data-curriculum-lesson-id]')).toHaveCount(expected.lessonCount);
  await expect(page.locator('[data-curriculum-status="built"]')).toHaveCount(expected.builtCount);
  await expect(page.locator('[data-curriculum-status="not built yet"]'))
    .toHaveCount(expected.lessonCount - expected.builtCount);
  for (const unit of expected.units) {
    const section = page.locator('[data-curriculum-unit="' + unit.id + '"]');
    await expect(section.locator('summary')).toContainText(unit.title);
    for (const topic of unit.topics) {
      await expect(section.locator('[data-curriculum-topic="' + topic.id + '"] h3')).toHaveText(topic.title);
      await expect(section.locator('[data-curriculum-topic="' + topic.id + '"] [data-curriculum-lesson-id]'))
        .toHaveCount(topic.lessons.length);
    }
  }
});

test('preview is noindex, has no navigation link and is absent from sitemap', async ({ page, request }) => {
  await page.goto(route);
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', /\bnoindex\b/);
  await expect(page.locator('main[data-pagefind-body]')).toHaveCount(0);
  await expect(page.locator('nav a[href="/preview/curriculum"]')).toHaveCount(0);
  const response = await request.get('/sitemap.xml');
  expect(response.status()).toBe(200);
  expect(await response.text()).not.toContain('/preview/curriculum');
});

test('native unit disclosure works by keyboard, without dragging', async ({ page }) => {
  await page.goto(route);
  const first = page.locator('[data-curriculum-unit]').first();
  const summary = first.locator('summary');
  await expect(first.locator('h3').first()).toBeHidden();
  await summary.focus();
  await expect(summary).toBeFocused();
  await summary.press('Enter');
  await expect(first.locator('details')).toHaveAttribute('open', '');
  await expect(first.locator('h3').first()).toBeVisible();
  await summary.press('Space');
  await expect(first.locator('details')).not.toHaveAttribute('open', '');
});

test.describe('preview with JavaScript unavailable', () => {
  test.use({ javaScriptEnabled: false });
  test('keeps the full curriculum and native disclosures', async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('[data-curriculum-lesson-id]')).toHaveCount(expected.lessonCount);
    const summary = page.locator('[data-curriculum-unit] summary').first();
    await summary.click();
    await expect(page.locator('[data-curriculum-unit] details').first()).toHaveAttribute('open', '');
  });
});

for (const { width, height } of [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`preview has no overflow or axe violations at ${width}px in ${scheme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto(route);
      await page.locator('[data-curriculum-unit] summary').first().click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(result.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
    });
  }
}
