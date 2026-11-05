import { expect, test } from '@playwright/test';
import { site } from '../../src/config/site';

// The site-wide welcome panel is tested elsewhere. Keep it from interrupting
// a privacy-page link or keyboard interaction halfway through this page spec.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // The policy must remain readable when browser storage is unavailable.
    }
  });
});

test.describe('Task 422: privacy page', () => {
  test('explains each kind of data in a readable, organized document', async ({ page }) => {
    await page.goto('/privacy');
    const main = page.getByRole('main');

    await expect(main.getByRole('heading', { level: 1 })).toHaveText('privacy, in plain language');
    for (const heading of [
      'The short version',
      'Your progress on this device',
      'Launch-updates emails',
      'Lesson videos',
      'Visit statistics',
      'If you create an account',
      'Who handles data for us',
      'Questions',
    ]) {
      await expect(main.getByRole('heading', { level: 2, name: heading, exact: true })).toBeVisible();
    }

    // Changing or removing a storage feature must not silently drop its disclosure.
    const storageKeys = await main.locator('code').allTextContents();
    for (const key of [
      'cueory-theme',
      'cueory-progress',
      'cueory-resume',
      'cueory-game-stats',
      'cueory-auth',
    ]) {
      expect(storageKeys, `missing privacy disclosure for ${key}`).toContain(key);
    }

    await expect(main.getByText('youtube-nocookie.com', { exact: true })).toBeVisible();
  });

  test('offers working links to view or manage device progress and daily games', async ({ page }) => {
    await page.goto('/privacy');
    const main = page.getByRole('main');

    const progress = main.locator('a[href="/progress"]').first();
    await expect(progress).toBeVisible();
    await progress.click();
    await expect(page).toHaveURL(/\/progress\/?$/);
    await expect(page.getByRole('main')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/privacy\/?$/);

    const games = page.getByRole('main').locator('a[href="/play"]');
    await expect(games).toBeVisible();
    await games.click();
    await expect(page).toHaveURL(/\/play\/?$/);
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('provides a usable contact address without preloading a lesson video', async ({ page }) => {
    const videoRequests: string[] = [];
    page.on('request', (request) => {
      const host = new URL(request.url()).hostname;
      if (host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com') ||
          host === 'youtube.com' || host.endsWith('.youtube.com')) {
        videoRequests.push(request.url());
      }
    });

    await page.goto('/privacy');
    const main = page.getByRole('main');
    const email = main.locator(`a[href="mailto:${site.contactEmail}"]`);
    await expect(email).toHaveText(site.contactEmail);
    await expect(main.locator('iframe')).toHaveCount(0);
    expect(videoRequests).toEqual([]);
  });
});
