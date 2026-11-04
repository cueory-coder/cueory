import { test, expect } from '@playwright/test';

test('default launch switch keeps the account menu and promo on the launch list', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'account', exact: true }).click();
  const menu = page.getByTestId('account-menu');
  await expect(menu.getByRole('link', { name: /create free account/ })).toHaveAttribute('href', '/#signup');
  await expect(menu.getByRole('link', { name: /sign in/ })).toHaveAttribute('href', '/#signup');
  await expect(menu.getByText('coming soon')).toHaveCount(2);
  await expect(page.locator('.promo-button').filter({ hasText: 'join the launch list' })).toHaveAttribute('href', '/#signup');
});
