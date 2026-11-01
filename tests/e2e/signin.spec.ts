import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The normal verification build has no account settings. All four configured projects run these tests,
// covering phone, tablet, desktop, and the evening palette without contacting an auth provider.
test.describe('sign in with accounts off', () => {
  test('renders a plain, unindexed page with a working launch-updates link', async ({ page }) => {
    const errors: string[] = [];
    const remoteRequests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (/supabase|accounts\.google/.test(url.hostname)) remoteRequests.push(request.url());
    });
    await page.goto('/signin?next=%2F%2Fevil.com');
    await expect(page.getByRole('heading', { level: 1, name: 'sign in', exact: true })).toBeVisible();
    await expect(page).toHaveTitle('sign in · cueory');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.getByTestId('signin-unavailable')).toContainText('accounts open soon');
    await expect(page.locator('main form')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveClass(/silk/);
    await expect(page.locator('main .veil')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const updates = page.getByRole('link', { name: 'get launch updates', exact: true });
    await expect(updates).toHaveAttribute('href', '/#signup');
    await updates.click();
    await expect(page).toHaveURL(/\/#signup$/);
    await expect(page.locator('#signup')).toBeVisible();
    expect(errors).toEqual([]);
    expect(remoteRequests).toEqual([]);
  });

  test('reaches every visible control with the keyboard and shows focus', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByTestId('signin-unavailable')).toBeVisible();
    const controls = page.locator('a[href]:visible, button:visible, input:visible, select:visible, textarea:visible');
    const count = await controls.count();
    const reached = new Set<number>();
    const recordFocus = async () => {
      for (let index = 0; index < count; index++) {
        if (await controls.nth(index).evaluate(element => element === document.activeElement)) {
          reached.add(index);
          expect(await controls.nth(index).evaluate(element => {
            const style = getComputedStyle(element);
            return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
          })).toBe(true);
        }
      }
    };
    for (let press = 0; press < count + 4; press++) {
      await page.keyboard.press('Tab');
      await recordFocus();
      // Native radio groups use arrows within the group, with a single Tab stop.
      if (await page.locator('input[type="radio"]:focus').count()) {
        for (let radio = 0; radio < 3; radio++) {
          await page.keyboard.press('ArrowRight');
          await recordFocus();
        }
      }
    }
    expect(reached.size).toBe(count);
  });

  test('passes accessibility checks', async ({ page }) => {
    await page.goto('/signin');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map(result => `${result.id}: ${result.help}`)).toEqual([]);
  });
});
