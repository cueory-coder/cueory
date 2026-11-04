import { expect, test } from '@playwright/test';

test.describe('signed-out account corner keyboard path', () => {
  test('opens from the toggle, reaches both links, and returns focus on Escape', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByRole('button', { name: 'account', exact: true });
    const menu = page.getByTestId('account-menu');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const create = menu.getByRole('link', { name: /create free account/ });
    const signIn = menu.getByRole('link', { name: /sign in/ });
    await expect(create).toHaveAccessibleName(/create free account.*coming soon/i);
    await expect(signIn).toHaveAccessibleName(/sign in.*coming soon/i);

    await page.keyboard.press('Tab');
    await expect(create).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(signIn).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(toggle).toBeFocused();
  });
});
