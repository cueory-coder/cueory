import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

for (const theme of ['light', 'dark'] as const) {
  test(`continue progress uses brand colors and readable text in ${theme}`, async ({ page, browserName }) => {
    await page.addInitScript((theme) => {
      localStorage.setItem('cueory-theme', theme);
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-resume', JSON.stringify({
        version: 1, savedAt: Date.now(), tool: 'cards',
        page: '/learn/study-skills/cards', itemIndex: 1, totalItems: 4,
        answers: {}, timer: null, phase: 'working',
      }));
    }, theme);
    await page.goto('/');
    await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), theme);
    const strip = page.getByRole('complementary', { name: 'continue studying' });
    const progress = strip.getByRole('progressbar', { name: 'saved study progress' });
    await expect(progress).toBeVisible();
    await expect(progress).toHaveAttribute('value', '2');
    await expect(progress).toHaveAttribute('max', '4');
    await expect(strip).toContainText('2/4');
    await expect(strip.getByRole('link')).toHaveAttribute('href', '/learn/study-skills/cards');

    const colors = await progress.evaluate((element) => {
      const style = getComputedStyle(element);
      const probe = document.createElement('span');
      element.parentElement!.append(probe);
      probe.style.backgroundColor = 'var(--color-button-hover)';
      const track = getComputedStyle(probe).backgroundColor;
      probe.style.backgroundColor = 'var(--color-on-button)';
      const fill = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { appearance: style.appearance, actualTrack: style.backgroundColor, track, fill };
    });
    expect(colors.appearance).toBe('none');
    expect(colors.actualTrack).toBe(colors.track);
    expect(colors.fill).not.toBe(colors.track);
    // Native progress needs explicit engine-specific fill rules, not accent-color:
    // Chromium can substitute its own green when relying only on the accent.
    const fillPseudo = browserName === 'firefox' ? '::-moz-progress-bar' : '::-webkit-progress-value';
    const fillRules = await page.evaluate((fillPseudo) => {
      const rules: string[] = [];
      const walk = (list: CSSRuleList) => {
        for (const rule of Array.from(list)) {
          if (rule instanceof CSSStyleRule && rule.selectorText.includes(fillPseudo)) {
            rules.push(rule.style.getPropertyValue('background-color').trim());
          }
          if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) walk(sheet.cssRules);
      return rules;
    }, fillPseudo);
    // An engine may discard an unsupported other-engine pseudo selector from CSSOM.
    expect(fillRules).toContain('var(--color-on-button)');
    const result = await new AxeBuilder({ page }).include('aside[aria-label="continue studying"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations.map((violation) => violation.id)).toEqual([]);
  });
}



// S8: the same behavior at phone, tablet and desktop sizes in both palettes.
// The original two palette tests above keep their brand-color checks unchanged.
for (const width of [390, 820, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`continue link works by keyboard and tap at ${width}px in ${theme}`, async ({ browser }, testInfo) => {
      test.skip(!isDesktopOfEachEngine(testInfo), 'six responsive cases run once per browser engine');
      const engine = testInfo.project.use.browserName ?? testInfo.project.use.defaultBrowserType ?? 'chromium';
      const context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: { width, height: width === 390 ? 844 : width === 820 ? 1180 : 900 },
        colorScheme: theme,
        reducedMotion: 'reduce',
        hasTouch: true,
        isMobile: width === 390 && engine !== 'firefox',
      });
      try {
        await context.addInitScript(() => {
          try {
            localStorage.setItem('cueory-promo-seen', String(Date.now()));
            localStorage.setItem('cueory-resume', JSON.stringify({
              version: 1, savedAt: Date.now(), tool: 'cards',
              page: '/learn/study-skills/cards', itemIndex: 1, totalItems: 4,
              answers: {}, timer: null, phase: 'working',
            }));
          } catch { /* blocked storage is separately covered by unit tests */ }
        });
        const page = await context.newPage();
        const response = await page.goto('/');
        expect(response?.status()).toBe(200);
        const bar = page.getByRole('complementary', { name: 'continue studying' });
        const link = bar.getByRole('link', { name: 'continue cards, question 2 of 4' });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', '/learn/study-skills/cards');
        await expect(bar.getByRole('progressbar', { name: 'saved study progress' })).toHaveAttribute('value', '2');
        const bounds = await link.boundingBox();
        expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44);
        const axe = await new AxeBuilder({ page }).include('aside[aria-label="continue studying"]')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(axe.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await link.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(link).toBeFocused();
        const visibleFocus = await link.evaluate((element) => {
          const style = getComputedStyle(element);
          return element.matches(':focus-visible') && style.outlineStyle !== 'none' &&
            Number.parseFloat(style.outlineWidth) > 0 && style.outlineColor !== 'transparent';
        });
        expect(visibleFocus).toBe(true);
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/learn\/study-skills\/cards\/?$/);
        await page.goBack();
        await bar.getByRole('link').tap();
        await expect(page).toHaveURL(/\/learn\/study-skills\/cards\/?$/);
      } finally {
        await context.close();
      }
    });
  }
}
