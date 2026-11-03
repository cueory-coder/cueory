import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('cueory-promo-seen', '1'));
});

test('callback without a code explains recovery and offers home', async ({ page }) => {
  await page.goto('/auth/callback');
  await expect(page).toHaveTitle('finish signing in · cueory');
  await expect(page.getByRole('heading', { level: 1, name: 'signing you in…' })).toBeVisible();
  await expect(page.locator('main [role="alert"]')).toHaveText('this sign-in link has no code. please start again.');
  await expect(page.locator('main').getByRole('link', { name: 'back to home' })).toHaveAttribute('href', '/#signup');
});

test('accounts-off callback removes the code and gives a safe next step', async ({ page }) => {
  const exchanges: string[] = [];
  page.on('request', request => {
    if (/supabase|accounts\.google/.test(new URL(request.url()).hostname)) exchanges.push(request.url());
  });
  await page.goto('/auth/callback?code=synthetic-test-code&next=%2F%2Fevil.example');
  await expect(page.locator('main')).toContainText("accounts open soon. sign-in isn't available yet.");
  await expect(page).toHaveURL(/\/auth\/callback$/);
  await expect(page.locator('main').getByRole('link', { name: 'back to home' })).toHaveAttribute('href', '/#signup');
  expect(exchanges).toEqual([]);
});

test('callback explains the JavaScript requirement when scripts are disabled', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    await page.goto('/auth/callback');
    await expect(page.locator('main')).toContainText('turn on javascript to finish signing in.');
    await expect(page.locator('main').getByRole('link', { name: 'back to home' })).toHaveAttribute('href', '/#signup');
  } finally {
    await context.close();
  }
});
