import { expect, test } from '@playwright/test';

test.describe('about page', () => {
  test('renders structure with placeholders for founder copy', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1, name: 'about cueory' })).toBeVisible();

    await expect(page.getByRole('heading', { level: 2, name: 'our mission' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'who we are' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'how content is made' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'support us' })).toBeVisible();

    const placeholders = page.locator('[data-placeholder="CHRISTIAN-TEXT"]');
    await expect(placeholders).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await expect(placeholders.nth(i)).toContainText('[Christian writes this]');
    }

    const supportLink = page.getByRole('link', { name: 'visit our support page' });
    await expect(supportLink).toBeVisible();
    await expect(supportLink).toHaveAttribute('href', '/support');
  });
});
