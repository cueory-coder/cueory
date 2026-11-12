import { expect, test } from '@playwright/test';

test.use({ reducedMotion: 'no-preference' });

test('prints every home section before scrolling and preserves the screen reveal', async ({ page }) => {
  // Keep the optional marketing panel from covering the page under test.
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); }
    catch { /* Blocked storage does not prevent the page from rendering. */ }
  });

  const response = await page.goto('/');
  expect(response?.status()).toBe(200);

  const waiting = page.locator('[data-reveal-section][data-reveal="waiting"]');
  await expect.poll(() => waiting.count()).toBeGreaterThan(0);
  // Visibility assertions alone do not detect a fully transparent section.
  await expect(waiting.first()).toHaveCSS('opacity', '0');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.emulateMedia({ media: 'print' });

  const sections = page.locator('[data-reveal-section]');
  await expect.poll(() => sections.evaluateAll(elements => elements.flatMap(element => {
    const style = getComputedStyle(element);
    const problems: string[] = [];
    if (style.opacity !== '1') problems.push('opacity: ' + style.opacity);
    if (style.translate !== 'none') problems.push('translate: ' + style.translate);
    if (style.transitionDuration !== '0s') problems.push('transition-duration: ' + style.transitionDuration);
    return problems;
  }))).toEqual([]);

  await page.emulateMedia({ media: 'screen' });

  // Printing does not consume the once-only reveal or change the screen style.
  await expect.poll(() => waiting.count()).toBeGreaterThan(0);
  await expect(waiting.first()).toHaveCSS('opacity', '0');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
