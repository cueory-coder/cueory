import { expect, test } from '@playwright/test';

for (const surface of ['menu', '404'] as const) {
  test(`${surface} search retries a failed module download without reloading the page`, async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* storage may be disabled */ }
    });
    let unavailable = true;
    let requests = 0;
    let releaseFailure!: () => void;
    const firstFailure = new Promise<void>((resolve) => { releaseFailure = resolve; });
    await page.route('**/pagefind/pagefind.js', async (route) => {
      requests++;
      if (unavailable) {
        // Focus preloads search. Keep that attempt pending until fill also requests it.
        await firstFailure;
        await route.abort('failed');
      } else await route.continue();
    });

    await page.goto(surface === 'menu' ? '/learn/study-skills' : '/search-retry-missing-page');
    if (surface === 'menu') await page.getByRole('button', { name: 'open site menu', exact: true }).click();
    const root = page.locator(surface === 'menu' ? '[data-site-search]' : '[data-404-search]');
    const input = root.getByRole('searchbox');
    const status = root.locator(surface === 'menu' ? '[data-search-status]' : '[data-404-status]');
    const results = root.getByRole('list', { name: 'search results' });

    await input.fill('cards');
    releaseFailure();
    await expect(status).toContainText(/search isn’t available right now/i);
    expect(requests).toBe(1);
    await expect(results).toBeHidden();

    unavailable = false;
    await input.fill('study');
    await expect(results.getByRole('link').first()).toBeVisible();
    await expect(status).not.toContainText(/isn’t available/i);
    expect(requests).toBe(2);
    await expect(input).toBeFocused();
  });
}
