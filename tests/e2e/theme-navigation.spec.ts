import { expect, test, type Page } from '@playwright/test';
import { THEME_STORAGE_KEY } from '../../src/scripts/theme';

const routes = ['/', '/learn/study-skills', '/privacy'];

async function openPicker(page: Page) {
  const toggle = page.locator('[data-footer-toggle]');
  await toggle.scrollIntoViewIfNeeded();
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  const picker = page.locator('[data-theme-picker]');
  await expect(picker).toBeVisible();
  return picker;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cueory-promo-seen', String(Date.now()));
  });
});

for (const choice of ['light', 'dark'] as const) {
  test(`${choice} choice survives page types and reloads, overriding the device`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: choice === 'light' ? 'dark' : 'light' });
    await page.goto('/');
    await (await openPicker(page)).getByRole('radio', { name: choice, exact: true }).check();

    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('data-theme', choice);
      await expect((await openPicker(page)).getByRole('radio', { name: choice, exact: true })).toBeChecked();
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', choice);
      await expect((await openPicker(page)).getByRole('radio', { name: choice, exact: true })).toBeChecked();
      expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBe(choice);
    }
  });
}

test('with no saved choice, device changes apply across page types and reloads', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/learn/study-skills');
  expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBeNull();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  await expect((await openPicker(page)).getByRole('radio', { name: 'follow device', exact: true })).toBeChecked();
  const darkPageColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(darkPageColor);
  const lightPageColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(darkPageColor);

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect((await openPicker(page)).getByRole('radio', { name: 'follow device', exact: true })).toBeChecked();
    await page.reload();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    await expect((await openPicker(page)).getByRole('radio', { name: 'follow device', exact: true })).toBeChecked();
    expect(await page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY)).toBeNull();
  }

  await page.goto('/learn/study-skills');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(darkPageColor);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(lightPageColor);
});
