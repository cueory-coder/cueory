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
    const footerLink = page.locator('footer').getByRole('link', { name: 'coming soon' });
    await expect(footerLink).toHaveAttribute('href', '/coming-soon');
  });
});
