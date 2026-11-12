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
        await section.scrollIntoViewIfNed();
        await expect(summary).toBeVisible();
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', '/play');

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
      });
  }
}
