import { expect, test } from '@playwright/test';

test.describe('courses page', () => {
  test('lists available and coming-soon courses', async ({ page }) => {
    await page.goto('/courses');
    await expect(page.getByRole('heading', { level: 1, name: 'courses' })).toBeVisible();

    // Med-Surg I is available
    await expect(page.getByRole('heading', { level: 2, name: 'Med-Surg I', exact: true })).toBeVisible();
    const openLink = page.getByRole('link', { name: 'open course' });
    await expect(openLink).toBeVisible();
    await expect(openLink).toHaveAttribute('href', '/learn');

    // Other courses are coming soon
    await expect(page.getByRole('heading', { level: 2, name: 'Med-Surg II', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Mental Health' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Med Math' })).toBeVisible();

    // Small status text uses a foreground with AA contrast in both brand palettes.
    // tests/unit/tokens.test.ts verifies the ink-on-line pairing for Daytime and Evening.
    const badges = page.locator('span.bg-line', { hasText: 'coming soon' });
    await expect(badges).toHaveCount(3);
    expect(await badges.evaluateAll((elements) => elements.every((el) => el.classList.contains('text-ink')))).toBe(true);

    // The available course should open the course library, not one sample lesson.
    await openLink.click();
    await expect(page).toHaveURL(/\/learn\/?$/);
    await expect(page.getByRole('heading', { level: 1, name: 'med-surg i' })).toBeVisible();
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
