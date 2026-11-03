import { expect, test, type Page } from '@playwright/test';

/** Task 130: a tucked sticky header must never cover page controls or trap keyboard focus. */
const header = (page: Page) => page.locator('header[data-scroll-header]');
const homeLink = (page: Page) => header(page).getByRole('link', { name: 'Cueory home' });

async function scrollTo(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // The delayed marketing promo must not interrupt a scroll, focus or navigation test.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
    } catch {
      // Storage is optional; these tests do not depend on it.
    }
  });
});

test('a tucked header ignores top-of-page taps, then becomes clickable after scrolling up', async ({ page }) => {
  await page.goto('/play');
  await expect(header(page)).toBeVisible();
  await scrollTo(page, 700);
  await expect(header(page)).toHaveClass(/\bis-tucked\b/);
  await expect.poll(() => header(page).evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  // The top 40 px should hit actual page content, not an invisible header or one of its links.
  expect(await page.evaluate(() => {
    const sticky = document.querySelector('header[data-scroll-header]');
    const topContent = document.elementFromPoint(window.innerWidth / 2, 40);
    return topContent !== null && topContent !== sticky && !sticky?.contains(topContent);
  })).toBe(true);

  await scrollTo(page, 250);
  await expect(header(page)).not.toHaveClass(/\bis-tucked\b/);
  await expect.poll(() => header(page).evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('auto');
  await homeLink(page).click();
  await expect(page).toHaveURL(/\/$/);
});

test('keyboard focus restores the header instead of being trapped off-screen', async ({ page }) => {
  await page.goto('/play');
  await scrollTo(page, 700);
  await expect(header(page)).toHaveClass(/\bis-tucked\b/);
  expect(await header(page).evaluate((el) => el.contains(document.activeElement))).toBe(false);

  await homeLink(page).evaluate((link) => (link as HTMLAnchorElement).focus({ preventScroll: true }));
  await expect(homeLink(page)).toBeFocused();
  await expect(header(page)).not.toHaveClass(/\bis-tucked\b/);
  await expect.poll(() => header(page).evaluate((el) => el.getBoundingClientRect().bottom > 0)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(80);
});

test('header tucks again after focus leaves while the page is scrolled', async ({ page }) => {
  await page.goto('/play');
  await scrollTo(page, 700);
  await expect(header(page)).toHaveClass(/\\bis-tucked\\b/);

  await homeLink(page).evaluate((link) => (link as HTMLAnchorElement).focus({ preventScroll: true }));
  await expect(homeLink(page)).toBeFocused();
  await expect(header(page)).not.toHaveClass(/\\bis-tucked\\b/);

  await page.locator('main a').first().focus({ preventScroll: true });
  await expect(header(page)).toHaveClass(/\\bis-tucked\\b/);
});

test('reduced motion leaves the header visible and clickable, even with a stale tucked class', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/play');
  await scrollTo(page, 700);
  await expect(header(page)).not.toHaveClass(/\bis-tucked\b/);
  await expect(header(page)).toBeVisible();

  // Assert the CSS fallback itself, not only the script's normal removal of the tucked class.
  await header(page).evaluate((el) => el.classList.add('is-tucked'));
  await expect.poll(() => header(page).evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('auto');
  await expect.poll(() => header(page).evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  await homeLink(page).click();
  await expect(page).toHaveURL(/\/$/);
});
