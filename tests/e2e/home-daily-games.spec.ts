import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

// Run the complete six-state matrix once per browser engine, not once for each project's default viewport.
const widths = [390, 820, 1440] as const;
const schemes = ['light', 'dark'] as const;

for (const width of widths) {
  for (const scheme of schemes) {
    test(`home daily games: ${width}px in ${scheme} mode`, async ({ browser }, testInfo) => {
      test.skip(!isDesktopOfEachEngine(testInfo), 'the six responsive checks run once per browser engine');

      const engine = testInfo.project.use.browserName ?? testInfo.project.use.defaultBrowserType ?? 'chromium';
      const context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: { width, height: width === 390 ? 844 : width === 820 ? 1180 : 900 },
        colorScheme: scheme,
        reducedMotion: 'reduce',
        hasTouch: true,
        isMobile: width === 390 && engine !== 'firefox',
      });
      try {
        // The once-only promo would otherwise cover the section while keyboard focus and taps are tested.
        await context.addInitScript(() => {
          try { localStorage.setItem('cueory-promo-seen', String(Date.now())); }
          catch { /* The home page also works without storage. */ }
        });
        const page = await context.newPage();
        const response = await page.goto('/');
        expect(response?.status()).toBe(200);

        const section = page.locator('#daily-games');
        const summary = section.getByTestId('daily-games-summary');
        const link = section.getByTestId('games-link');
        const day = section.getByTestId('daily-games-day');
        await section.scrollIntoViewIfNeeded();
        await expect(summary).toBeVisible();
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', '/play');
        await expect(day).toBeVisible();
        await expect(day).toContainText(/today's set: [a-z]{3} \d{1,2} [a-z]{3}/);
        await expect(day).toContainText('new puzzles arrive at midnight on your device.');

        const bounds = await link.boundingBox();
        expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44);

        const axe = await new AxeBuilder({ page })
          .include('#daily-games')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(axe.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);

        // Shift+Tab then Tab establishes real keyboard focus, rather than accepting a programmatic focus alone.
        await link.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(link).toBeFocused();
        const visibleFocus = await link.evaluate((element) => {
          const style = getComputedStyle(element);
          return element.matches(':focus-visible') &&
            style.outlineStyle !== 'none' &&
            Number.parseFloat(style.outlineWidth) > 0 &&
            style.outlineColor !== 'transparent';
        });
        expect(visibleFocus).toBe(true);

        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/play\/?$/);
        await page.goBack();
        await page.getByTestId('games-link').tap();
        await expect(page).toHaveURL(/\/play\/?$/);
      } finally {
        await context.close();
      }
    });
  }
}


test('the visitor day changes at local midnight, even without a page reload', async ({ browser }, testInfo) => {
  test.skip(!isDesktopOfEachEngine(testInfo), 'a clock test runs once per browser engine');
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    timezoneId: 'America/New_York',
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    // Start well before midnight, then freeze the clock before making assertions.
    // This prevents a slow page load from advancing to the next day first.
    await page.clock.install({ time: new Date('2026-11-11T23:59:00-05:00') });
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await page.clock.pauseAt(new Date('2026-11-11T23:59:58-05:00'));
    const day = page.getByTestId('daily-games-day');
    await expect(day).toContainText("today's set: wed 11 nov.");
    await page.clock.runFor(3_000);
    await expect(day).toContainText("today's set: thu 12 nov.");
    await expect(day).toContainText('new puzzles arrive at midnight on your device.');
  } finally {
    await context.close();
  }
});
