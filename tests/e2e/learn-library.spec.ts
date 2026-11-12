import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { parseLessonMap } from '../../src/islands/lessonmap';
import { studyModes } from '../../src/config/modes';
import { unitAvailability } from '../../src/lessons/availability';
import { lessonCountLabel } from '../../src/lessons/libraryfilter';
import { contentCatalog } from '../lessonroutes';

const sourceCsv = readFileSync(new URL('../../docs/curriculum/medsurg-lesson-map.csv', import.meta.url), 'utf8');
const source = parseLessonMap(sourceCsv);
const totalLessons = source.units.reduce((sum, unit) =>
  sum + unit.topics.reduce((count, topic) => count + topic.lessons.length, 0), 0);
const catalog = contentCatalog();
const deck = JSON.parse(readFileSync(new URL('../../content/cards/study-skills-01.json', import.meta.url), 'utf8')) as {
  cards: { id: string }[];
};

test('the library shows real counts from the CSV and a link only to an open lesson', async ({ page }) => {
  expect(source.problems).toEqual([]);
  const response = await page.goto('/learn');
  expect(response?.status()).toBe(200);
  await expect(page.locator('main h1')).toHaveText('med-surg i');
  await expect(page.getByTestId('curriculum-summary')).toContainText(
    source.units.length + ' planned units · ' + totalLessons + ' lessons'
  );
  await expect(page.getByTestId('curriculum-summary')).toContainText('coming soon');

  const cards = page.locator('main [data-unit-id]');
  await expect(cards).toHaveCount(source.units.length);
  const headings = cards.getByRole('heading', { level: 3 });
  await expect(headings).toHaveText(source.units.map((unit) => unit.title));
  for (const unit of source.units) {
    const card = page.locator('main [data-unit-id="' + unit.id + '"]');
    const available = unitAvailability(catalog.lessons, unit.id);
    const summary = card.locator('summary');
    await expect(summary).toContainText(available.hasLessons ? available.open.length + ' open now' : 'coming soon');
    await expect(summary).toContainText(unit.topics.reduce((sum, topic) => sum + topic.lessons.length, 0).toString());
    await summary.click();
    if (available.hasLessons) {
      await expect(card.getByTestId('unit-empty-state')).toHaveCount(0);
      for (const lesson of available.open) {
        await expect(card.getByRole('link', { name: lesson.name })).toHaveAttribute('href', lesson.href);
        expect((await page.request.get(lesson.href)).status()).toBe(200);
      }
    } else {
      await expect(card.getByTestId('unit-empty-state')).toHaveText('no lessons yet · coming soon');
      await expect(card.locator('a')).toHaveCount(0);
    }
    await summary.click();
  }

  const start = page.locator('main').getByRole('link', { name: /how to study for nursing school/i });
  await expect(start).toHaveAttribute('href', '/learn/study-skills');
  await expect(page.getByText('open now · sample')).toBeVisible();
  await expect(page.getByText(studyModes.filter((mode) => mode.link).length + ' ways to study', { exact: false })).toBeVisible();
  await expect(page.getByText(deck.cards.length + ' sample cards', { exact: false })).toBeVisible();
  const destination = await page.goto('/learn/study-skills');
  expect(destination?.status()).toBe(200);
});

test('the library uses actual device progress, not a sample percentage from the design', async ({ page }) => {
  const cards = deck.cards;
  await page.addInitScript((ids: string[]) => {
    localStorage.setItem('cueory-progress', JSON.stringify({
      version: 1, onboarding: { course: null, examDate: null, done: false },
      decks: { 'study-skills-01': { know: [ids[0]], learning: [ids[1]], starred: [] } },
    }));
  }, cards.map((card) => card.id));
  await page.goto('/learn');
  await expect(page.getByTestId('library-progress-text')).toHaveText('2 of ' + cards.length + ' cards studied on this device');
  await expect(page.getByTestId('library-progress-bar')).toHaveJSProperty('value', 2);
  await expect(page.getByTestId('library-progress-bar')).toHaveJSProperty('max', cards.length);
});


test('progress refreshes after another tab saves and forgets its cards', async ({ page, context }) => {
  await page.goto('/learn');
  const progress = page.getByTestId('library-progress-text');
  await expect(progress).toHaveText('0 of ' + deck.cards.length + ' cards studied on this device');

  const other = await context.newPage();
  await other.goto('/learn/study-skills');
  await other.evaluate((ids: string[]) => {
    localStorage.setItem('cueory-progress', JSON.stringify({
      version: 1, onboarding: { course: null, examDate: null, done: false },
      decks: { 'study-skills-01': { know: [ids[0]], learning: [ids[1]], starred: [] } },
    }));
  }, deck.cards.map(card => card.id));
  await expect(progress).toHaveText('2 of ' + deck.cards.length + ' cards studied on this device');
  await expect(page.getByTestId('library-progress-bar')).toHaveJSProperty('value', 2);

  await other.evaluate(() => localStorage.removeItem('cueory-progress'));
  await expect(progress).toHaveText('0 of ' + deck.cards.length + ' cards studied on this device');
  await expect(page.getByTestId('library-progress-bar')).toHaveJSProperty('value', 0);
  await other.close();
});

test('the course index keeps internal planning notes and statuses out of the page', async ({ page }) => {
  await page.goto('/learn');
  const text = await page.locator('main').textContent() ?? '';
  expect(text).not.toContain('ADPIE and NCJMM first; everything after is practiced through them');
  expect(text).not.toContain('not started');
  const first = source.units[0]!;
  const details = page.locator('main [data-unit-id="' + first.id + '"] details');
  await expect(details.locator('li')).toHaveCount(first.topics.length);
  await expect(details.locator('li')).toHaveText(first.topics.map((topic) => topic.title));
});

test('native unit disclosures open and close by keyboard', async ({ page }) => {
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

for (const { width, height, columns } of [
  { width: 390, height: 844, columns: 1 },
  { width: 820, height: 1180, columns: 2 },
  { width: 1440, height: 900, columns: 3 },
]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`the unit grid fits ${width}px in ${scheme} mode without accessibility errors`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/learn');
      const renderedColumns = await page.getByTestId('unit-grid').evaluate((grid) =>
        getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length);
      expect(renderedColumns).toBe(columns);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(accessibility.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);

      // Exercise selected-button contrast, overflow, and accessibility too.
      await page.locator('[data-library-unit-picker] summary').click();
      await page.locator('[data-library-choice="unit:' + source.units[0]!.id + '"]').click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const filteredAccessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(filteredAccessibility.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
    });
  }
}

test.describe('library without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('keeps every planned unit available as a keyboard-operated disclosure', async ({ page }) => {
    const response = await page.goto('/learn');
    expect(response?.status()).toBe(200);
    await expect(page.locator('[data-unit-id]')).toHaveCount(source.units.length);

    const firstUnit = source.units[0]!;
    const first = page.locator('[data-unit-id="' + firstUnit.id + '"]');
    const summary = first.locator('summary');
    await expect(first.getByRole('heading', { level: 3, name: firstUnit.title })).toBeVisible();
    await summary.focus();
    await expect(summary).toBeFocused();
    await summary.press('Enter');
    await expect(first.locator('details')).toHaveAttribute('open', '');
    await expect(first.locator('ul').first().locator('li')).toHaveText(firstUnit.topics.map((topic) => topic.title));

    if (!unitAvailability(catalog.lessons, firstUnit.id).hasLessons) {
      await expect(first.getByTestId('unit-empty-state')).toHaveText('no lessons yet · coming soon');
      await expect(first.locator('a')).toHaveCount(0);
    }
    await summary.press('Space');
    await expect(first.locator('details')).not.toHaveAttribute('open', '');
    await expect(page.locator('[data-open-lesson]')).toHaveCount(catalog.lessons.length);
  });
});

test('course buttons filter open lessons with keyboard and restore state using browser history', async ({ page }) => {
  await page.goto('/learn');
  const controls = page.locator('[data-library-filters]');
  await expect(controls).toBeVisible();
  const count = page.getByTestId('library-filter-count');
  const total = catalog.lessons.length;
  await expect(count).toHaveText(lessonCountLabel(total, total));
  const medSurg = controls.locator('[data-library-choice="course:med-surg-i"]');
  await medSurg.focus();
  await medSurg.press('Enter');
  await expect(medSurg).toBeFocused();
  await expect(medSurg).toHaveAttribute('aria-pressed', 'true');
  await expect(medSurg.locator('[data-library-selected]')).toBeVisible();
  await expect(page).toHaveURL(/\?course=med-surg-i$/);
  const mapped = catalog.lessons.filter((lesson) => Boolean(lesson.unitId)).length;
  await expect(count).toHaveText(lessonCountLabel(mapped, total));
  await expect(page.locator('[data-open-lesson]:visible')).toHaveCount(mapped);
  await expect(page.locator('[data-library-planned-section]')).toBeVisible();

  const studySkills = controls.locator('[data-library-choice="course:study-skills"]');
  await studySkills.click();
  await expect(studySkills).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/\?course=study-skills$/);
  await expect(page.locator('[data-library-planned-section]')).toBeHidden();
  const legacy = catalog.lessons.filter((lesson) => !lesson.unitId).length;
  await expect(count).toHaveText(lessonCountLabel(legacy, total));
  await expect(page.locator('[data-open-lesson]:visible')).toHaveCount(legacy);
  await page.goBack();
  await expect(medSurg).toHaveAttribute('aria-pressed', 'true');
  await expect(count).toHaveText(lessonCountLabel(mapped, total));
});

test('unit buttons and URL query only show one unit, and invalid units show all', async ({ page }) => {
  const unit = source.units[0]!;
  const total = catalog.lessons.length;
  const mapped = catalog.lessons.filter((lesson) => lesson.unitId === unit.id).length;
  await page.goto('/learn?unit=' + encodeURIComponent(unit.id));
  const picker = page.locator('[data-library-unit-picker]');
  await expect(picker).toHaveAttribute('open', '');
  const selected = page.locator('[data-library-choice="unit:' + unit.id + '"]');
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect(selected.locator('[data-library-selected]')).toBeVisible();
  await expect(page.locator('[data-library-unit-id]:visible')).toHaveCount(1);
  await expect(page.locator('[data-open-lesson]:visible')).toHaveCount(mapped);
  await expect(page.getByTestId('library-filter-count')).toHaveText(lessonCountLabel(mapped, total));
  if (mapped === 0 && total > 0) {
    await expect(page.locator('[data-library-no-results]')).toBeVisible();
  }

  await page.locator('[data-library-choice="all"]').click();
  await expect(page).toHaveURL(/\/learn\/?$/);
  await expect(page.locator('[data-library-unit-id]:visible')).toHaveCount(source.units.length);
  await expect(page.locator('[data-open-lesson]:visible')).toHaveCount(total);
  await page.goto('/learn?unit=NOT-A-UNIT');
  await expect(page.locator('[data-library-choice="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-library-unit-id]:visible')).toHaveCount(source.units.length);
  await expect(page.getByTestId('library-filter-count')).toHaveText(lessonCountLabel(total, total));
});

test.describe('course library without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('keeps every lesson and unit visible, even with a unit URL', async ({ page }) => {
    const firstUnit = source.units[0]!;
    await page.goto('/learn?unit=' + encodeURIComponent(firstUnit.id));
    await expect(page.locator('[data-library-filters]')).toBeHidden();
    await expect(page.locator('[data-library-unit-id]:visible')).toHaveCount(source.units.length);
    await expect(page.locator('[data-open-lesson]:visible')).toHaveCount(catalog.lessons.length);
    await expect(page.getByTestId('library-filter-count')).toHaveText(
      lessonCountLabel(catalog.lessons.length, catalog.lessons.length)
    );
  });
});

test('a keyboard-selected filter keeps visible focus and announces the lesson count politely', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/learn');

  const controls = page.locator('[data-library-filters]');
  await expect(controls).toBeVisible();
  const count = page.getByTestId('library-filter-count');
  await expect(count).toHaveAttribute('role', 'status');
  await expect(count).toHaveAttribute('aria-live', 'polite');
  await expect(count).toHaveAttribute('aria-atomic', 'true');

  const filter = controls.locator('[data-library-choice="course:med-surg-i"]');
  await filter.focus();
  await page.keyboard.press('Space');
  await expect(filter).toBeFocused();
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  const appearance = await filter.evaluate((button) => ({
    outline: getComputedStyle(button).outlineStyle,
    height: button.getBoundingClientRect().height,
  }));
  expect(appearance.outline).not.toBe('none');
  expect(appearance.height).toBeGreaterThanOrEqual(44);
  const mapped = catalog.lessons.filter((lesson) => Boolean(lesson.unitId)).length;
  await expect(count).toHaveText(lessonCountLabel(mapped, catalog.lessons.length));

  await page.goBack();
  await expect(controls.locator('[data-library-choice="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(count).toHaveText(lessonCountLabel(catalog.lessons.length, catalog.lessons.length));
  await page.goForward();
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await expect(count).toHaveText(lessonCountLabel(mapped, catalog.lessons.length));
});
