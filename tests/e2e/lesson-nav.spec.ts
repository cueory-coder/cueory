import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { contentCatalog } from '../lessonroutes';
import { lessonNeighbors } from '../../src/lessons/neighbors';

const catalog = contentCatalog();

async function tabToLessonLink(page: Page, target: Locator) {
  // Begin at a known earlier keyboard stop. Do not focus the target programmatically.
  const start = page.getByTestId('mode-grid').locator('[data-mode-tile]').last()
    .getByRole('button', { name: /^more about / });
  await expect(start).toBeVisible();
  await start.focus();
  await expect(start).toBeFocused();
  for (let step = 0; step < 80; step++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => document.activeElement === element)) {
      await expect(target).toBeFocused();
      return;
    }
  }
  throw new Error('lesson link was not reachable by Tab from the final study-mode InfoTip');
}

test('course-library unit cards expose unique destinations for lesson back links', async ({ page }) => {
  await page.goto('/learn');
  const cards = page.locator('[data-unit-id]');
  const destinations = await cards.evaluateAll((items) => items.map((element) => ({
    unit: element.getAttribute('data-unit-id'), id: element.id,
  })));
  expect(destinations.length).toBeGreaterThan(0);
  expect(new Set(destinations.map(({ id }) => id)).size).toBe(destinations.length);
  for (const { unit, id } of destinations) {
    expect(id).toBe(`unit-${unit}`);
    await page.goto(`/learn#${id}`);
    await expect(page.locator(`[data-unit-id="${unit}"]`)).toBeInViewport();
  }
});

for (const lesson of catalog.lessons) {
  test(lesson.href + ': links to only visible lessons in the same unit', async ({ page }) => {
    const response = await page.goto(lesson.href);
    expect(response?.status()).toBe(200);
    const nav = page.getByTestId('lesson-nav');
    await expect(nav).toBeVisible();
    const { previous, next, back } = lessonNeighbors(catalog, lesson);
    const prevLink = nav.locator('[data-lesson-previous]');
    const nextLink = nav.locator('[data-lesson-next]');
    const backLink = nav.locator('[data-lesson-back]');
    if (previous) {
      await expect(prevLink).toHaveAttribute('href', previous.href);
      await expect(prevLink).toHaveAttribute('aria-label', 'previous lesson: ' + previous.name);
      expect((await page.request.get(previous.href)).status()).toBe(200);
    } else {
      await expect(prevLink).toHaveCount(0);
    }
    if (next) {
      await expect(nextLink).toHaveAttribute('href', next.href);
      await expect(nextLink).toHaveAttribute('aria-label', 'next lesson: ' + next.name);
      expect((await page.request.get(next.href)).status()).toBe(200);
    } else {
      await expect(nextLink).toHaveCount(0);
    }
    await expect(backLink).toHaveAttribute('href', back.href);
    await expect(backLink).toHaveText(back.label);
    expect((await page.request.get(back.href)).status()).toBe(200);
    // Activate both directions, not just Next on a middle lesson.
    // Return to the lesson after each navigation so each link gets a real keyboard check.
    for (const [neighbor, link] of [[previous, prevLink], [next, nextLink]] as const) {
      if (!neighbor) continue;
      await tabToLessonLink(page, link);
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL((url) => url.pathname === neighbor.href || url.pathname === neighbor.href + '.html');
      await page.goto(lesson.href);
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test('lesson navigation has focus, 44px links and axe clean in ' + theme, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    for (const [width, height] of [[390, 844], [820, 1180], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await page.goto('/learn/study-skills');
      const nav = page.getByTestId('lesson-nav');
      await expect(nav).toBeVisible();
      const back = nav.locator('[data-lesson-back]');
      await tabToLessonLink(page, back);
      const outline = await back.evaluate((element) => {
        const style = getComputedStyle(element);
        return { width: Number.parseFloat(style.outlineWidth), kind: style.outlineStyle };
      });
      expect(outline.kind).not.toBe('none');
      expect(outline.width).toBeGreaterThanOrEqual(1);
      const heights = await nav.locator('a[href]').evaluateAll((items) =>
        items.map((link) => link.getBoundingClientRect().height));
      expect(heights.length).toBeGreaterThan(0);
      expect(heights.every((height) => height >= 44)).toBe(true);
      expect(await page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const scan = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(scan.violations.map((v) => v.id + ': ' + v.help), theme + ' ' + width).toEqual([]);
      await expect(back).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL((url) => url.pathname === '/learn' || url.pathname === '/learn.html');
    }
  });
}

test('touchscreen tap on back reaches the same unit when one exists', async ({ page }, testInfo) => {
  test.skip(
    !['phone', 'phone-evening', 'tablet', 'webkit-phone'].includes(testInfo.project.name),
    'Touch test belongs to phone or tablet projects',
  );
  // Disposable curriculum fixtures make this exercise the #unit-... fragment.
  // Without fixtures, retain the real legacy lesson's /learn fallback assertion.
  const lesson = catalog.lessons.find((candidate) => candidate.unitId)
    ?? catalog.lessons.find((candidate) => candidate.href === '/learn/study-skills');
  expect(lesson).toBeDefined();
  const expected = new URL(lessonNeighbors(catalog, lesson!).back.href, 'https://cueory.app');
  await page.goto(lesson!.href);
  await page.getByTestId('lesson-nav').locator('[data-lesson-back]').tap();
  await expect(page).toHaveURL((url) =>
    (url.pathname === expected.pathname || url.pathname === expected.pathname + '.html') &&
    url.hash === expected.hash,
  );
  await expect(page.getByRole('heading', { level: 1, name: 'med-surg i' })).toBeVisible();
  if (lesson!.unitId) {
    await expect(page.locator(`[data-unit-id="${lesson!.unitId}"]`)).toBeInViewport();
  }
});
