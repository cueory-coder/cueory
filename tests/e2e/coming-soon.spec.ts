import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('coming soon page', () => {
  test('lists planned courses and roadmap study features', async ({ page }) => {
    await page.goto('/coming-soon');
    await expect(page.getByRole('heading', { level: 1, name: 'coming soon' })).toBeVisible();

    // Planned courses
    await expect(page.getByRole('heading', { level: 2, name: 'planned courses' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Med-Surg II' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Mental Health' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Med Math' })).toBeVisible();

    // Roadmap study features
    await expect(page.getByRole('heading', { level: 2, name: 'study features' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'clinical notebook' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'name-it quiz' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'label-it from the lab' })).toBeVisible();
  });

  test('is linked from footer and course page', async ({ page }) => {
    await page.goto('/courses');
    const linkOnCourses = page.getByRole('link', { name: 'coming soon page' });
    await expect(linkOnCourses).toHaveAttribute('href', '/coming-soon');

    await page.goto('/');
    const footer = page.locator('footer');
    const toggle = footer.locator('[data-footer-toggle]');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const footerLink = footer.getByRole('link', { name: 'coming soon', exact: true });
    await expect(footerLink).toHaveAttribute('href', '/coming-soon');
  });
});


test.describe('subscribed page', () => {
  test('explains confirmation without claiming an email was sent just by visiting', async ({ page }) => {
    await page.goto('/subscribed');
    await expect(page.getByRole('heading', { level: 1, name: 'almost done: check your inbox' })).toBeVisible();
    await expect(page.locator('main')).toContainText('if you signed up for launch updates');
    await expect(page.locator('main')).toContainText('check your spam or promotions folder.');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.getByRole('link', { name: 'back to home' })).toHaveAttribute('href', '/');
  });
});

for (const route of ['/coming-soon', '/subscribed'] as const) {
  for (const viewport of [
    { label: 'phone', width: 390, height: 844 },
    { label: 'tablet', width: 820, height: 1180 },
    { label: 'desktop', width: 1440, height: 900 },
  ]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${route} ${viewport.label} ${theme}: clear, accessible and without sideways scroll`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(route);

        await expect(page.locator('main h1')).toHaveCount(1);
        await expect(page.locator('main .veil').first()).toBeVisible();
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');

        const link = page.locator('main').getByRole('link', { name: 'explore available lessons' });
        await expect(link).toHaveAttribute('href', '/learn/study-skills');
        await expect(link).toBeVisible();
        await link.focus();
        await expect(link).toBeFocused();

        for (const control of await page.locator('main a').all()) {
          const box = await control.boundingBox();
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
          expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
      });
    }
  }
}
