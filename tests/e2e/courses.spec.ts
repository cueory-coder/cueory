import { expect, test } from '@playwright/test';

test.describe('courses page', () => {
  test('lists available and coming-soon courses', async ({ page }) => {
    await page.goto('/courses');
    await expect(page.getByRole('heading', { level: 1, name: 'courses' })).toBeVisible();

    // Med-Surg I is available
    await expect(page.getByRole('heading', { level: 2, name: 'Med-Surg I' })).toBeVisible();
    const openLink = page.getByRole('link', { name: 'open course' });
    await expect(openLink).toBeVisible();
    await expect(openLink).toHaveAttribute('href', '/learn/study-skills');

    // Other courses are coming soon
    await expect(page.getByRole('heading', { level: 2, name: 'Med-Surg II' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Mental Health' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Med Math' })).toBeVisible();
  });

  test('is linked from the navigation menu', async ({ page }) => {
    await page.goto('/');
    const menuButton = page.getByRole('button', { name: 'menu' });
    if (await menuButton.isVisible()) {
      await menuButton.click();
      const coursesLink = page.getByRole('link', { name: 'courses' });
      await expect(coursesLink).toBeVisible();
      await expect(coursesLink).toHaveAttribute('href', '/courses');
    }
  });
});
