import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { hasCurriculumLessons } from '../../src/lessons/availability';
import { contentCatalog } from '../lessonroutes';

test.describe('courses page', () => {
  test('lists available and coming-soon courses', async ({ page }) => {
    await page.goto('/courses');
    await expect(page.getByRole('heading', { level: 1, name: 'courses' })).toBeVisible();

    // Med-Surg I only opens once a mapped lesson actually exists.
    const medSurg = page.locator('[data-course-id="med-surg-1"]');
    await expect(medSurg.getByRole('heading', { level: 2, name: 'Med-Surg I', exact: true })).toBeVisible();
    const hasLessons = hasCurriculumLessons(contentCatalog().lessons);
    if (hasLessons) {
      const openLink = medSurg.getByRole('link', { name: 'open course' });
      await expect(openLink).toHaveAttribute('href', '/learn');
      await openLink.click();
      await expect(page).toHaveURL(/\/learn\/?$/);
      await expect(page.getByRole('heading', { level: 1, name: 'med-surg i' })).toBeVisible();
      await page.goto('/courses');
    } else {
      await expect(medSurg.getByText('no lessons yet · coming soon')).toBeVisible();
      await expect(medSurg.getByRole('link')).toHaveCount(0);
    }

    // Other courses are coming soon
    await expect(page.getByRole('heading', { level: 2, name: 'Med-Surg II', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Mental Health' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Med Math' })).toBeVisible();

    // Small status text uses a foreground with AA contrast in both brand palettes.
    // tests/unit/tokens.test.ts verifies the ink-on-line pairing for Daytime and Evening.
    const badges = page.locator('span.bg-line', { hasText: 'coming soon' });
    await expect(badges).toHaveCount(hasLessons ? 3 : 4);
    expect(await badges.evaluateAll((elements) => elements.every((el) => el.classList.contains('text-ink')))).toBe(true);

    // Planned courses never present a dead link.
    for (const id of ['med-surg-2', 'mental-health', 'med-math']) {
      const card = page.locator('[data-course-id="' + id + '"]');
      await expect(card.getByText('no lessons yet · coming soon')).toBeVisible();
      await expect(card.getByRole('link')).toHaveCount(0);
    }
  });

  test('is linked from the navigation menu', async ({ page }) => {
    await page.goto('/');
    const menuButton = page.locator('button[data-menu-open]');
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAccessibleName(/menu/);
    await menuButton.click();
    const coursesLink = page.getByRole('dialog').getByRole('link', { name: 'courses', exact: true });
    await expect(coursesLink).toBeVisible();
    await expect(coursesLink).toHaveAttribute('href', '/courses');
  });
});

for (const { width, height } of [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`courses have no overflow or axe violations at ${width}px in ${scheme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/courses');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(accessibility.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
    });
  }
}

test.describe('courses without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('keeps planned course status in words without empty links', async ({ page }) => {
    const response = await page.goto('/courses');
    expect(response?.status()).toBe(200);
    for (const id of ['med-surg-2', 'mental-health', 'med-math']) {
      const course = page.locator('[data-course-id="' + id + '"]');
      await expect(course.getByText('no lessons yet · coming soon')).toBeVisible();
      await expect(course.getByRole('link')).toHaveCount(0);
    }
    const medSurg = page.locator('[data-course-id="med-surg-1"]');
    if (!hasCurriculumLessons(contentCatalog().lessons)) {
      await expect(medSurg.getByText('no lessons yet · coming soon')).toBeVisible();
      await expect(medSurg.getByRole('link')).toHaveCount(0);
    }
  });
});
