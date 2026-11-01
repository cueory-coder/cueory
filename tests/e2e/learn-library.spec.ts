import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { parseLessonMap } from '../../src/islands/lessonmap';

const sourceCsv = readFileSync(new URL('../../docs/curriculum/medsurg-lesson-map.csv', import.meta.url), 'utf8');
const source = parseLessonMap(sourceCsv);
const totalLessons = source.units.reduce((sum, unit) =>
  sum + unit.topics.reduce((count, topic) => count + topic.lessons.length, 0), 0);

test('the course library uses the checked-in curriculum map and links only the open lesson', async ({ page }) => {
  expect(source.problems).toEqual([]);
  const response = await page.goto('/learn');
  expect(response?.status()).toBe(200);
  await expect(page.locator('main h1')).toHaveText('learn');

  const cards = page.locator('main [data-unit-id]');
  await expect(cards).toHaveCount(source.units.length);
  await expect(cards.locator('h3')).toHaveText(source.units.map((unit) => unit.title));
  await expect(page.getByTestId('curriculum-summary')).toContainText(
    source.units.length + ' planned units · ' + totalLessons + ' lessons'
  );
  for (const unit of source.units) {
    const card = page.locator('main [data-unit-id="' + unit.id + '"]');
    const count = unit.topics.reduce((total, topic) => total + topic.lessons.length, 0);
    await expect(card.getByText(count + (count === 1 ? ' lesson planned' : ' lessons planned'))).toBeVisible();
    await expect(card.getByText('coming soon', { exact: true })).toBeVisible();
    await expect(card.locator('a')).toHaveCount(0);
  }

  const start = page.locator('main').getByRole('link', { name: /how to study for nursing school/i });
  await expect(start).toHaveAttribute('href', '/learn/study-skills');
  await expect(page.getByText('available now · free')).toBeVisible();
  const destination = await page.goto('/learn/study-skills');
  expect(destination?.status()).toBe(200);
});

test('only unit and topic titles are published, not private curriculum planning notes', async ({ page }) => {
  await page.goto('/learn');
  const mainText = (await page.locator('main').textContent()) ?? '';
  expect(mainText).not.toContain('ADPIE and NCJMM first; everything after is practiced through them');
  expect(mainText).not.toContain('not started');
  await expect(page.locator('main [data-unit-id]')).toHaveCount(source.units.length);
  const first = source.units[0]!;
  const details = page.locator('main [data-unit-id="' + first.id + '"] details');
  await expect(details.locator('li')).toHaveCount(first.topics.length);
  await expect(details.locator('li')).toHaveText(first.topics.map((topic) => topic.title));
});

test('unit topics open and close using only keyboard controls, even without JavaScript', async ({ page }) => {
  await page.goto('/learn');
  const first = page.locator('main [data-unit-id]').first();
  const summary = first.locator('summary');
  const topics = first.locator('details li');

  await expect(topics.first()).toBeHidden();
  await summary.focus();
  await expect(summary).toBeFocused();
  await summary.press('Enter');
  await expect(first.locator('details')).toHaveAttribute('open', '');
  await expect(topics.first()).toBeVisible();
  await summary.press('Space');
  await expect(first.locator('details')).not.toHaveAttribute('open', '');
  await expect(topics.first()).toBeHidden();
});

test('the units fit phone, tablet and desktop and pass WCAG axe checks', async ({ page }) => {
  await page.goto('/learn');
  for (const { width, height, columns } of [
    { width: 390, height: 844, columns: 1 },
    { width: 820, height: 1180, columns: 2 },
    { width: 1440, height: 900, columns: 3 },
  ]) {
    await page.setViewportSize({ width, height });
    const renderedColumns = await page.getByTestId('unit-grid').evaluate((grid) =>
      getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length);
    expect(renderedColumns).toBe(columns);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(a11y.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
  }
});
