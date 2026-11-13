import { expect, test } from '@playwright/test';
import { builtPages } from './built-pages';
import { tabAudit } from './tab-audit';

const missingPage = '/quality-page-does-not-exist';
const routes = builtPages(missingPage);

test('quality sweep has built pages', () => {
  expect(routes).toContain('/');
  expect(routes).toContain(missingPage);
});

// Each configured viewport runs both palettes, including hydrated client-only pages.
// Keep every failure in the report; a failed target check must not hide focus or overflow findings.
for (const route of routes) {
  for (const palette of ['light', 'dark'] as const) {
    test(`${route}: targets, focus and overflow (${palette})`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: palette, reducedMotion: 'reduce' });
      await page.addInitScript(() => {
        localStorage.removeItem('cueory-theme');
        localStorage.setItem('cueory-promo-seen', String(Date.now()));
      });
      const response = await page.goto(route);
      expect(response?.status()).toBe(route === missingPage ? 404 : 200);
      await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      const findings = await page.evaluate(() => {
        const problems: string[] = [];
        if (document.documentElement.scrollWidth > innerWidth) {
          problems.push(`horizontal overflow: ${document.documentElement.scrollWidth}px > ${innerWidth}px`);
        }
        const controls = document.querySelectorAll<HTMLElement>(
          'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="checkbox"], [role="radio"], [role="switch"]',
        );
        for (const el of controls) {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          // The keyboard-only skip link is measured when focused by tabAudit below.
          if (el.matches('a.sr-only[href="#main"]')) continue;
          if (!rect.width || !rect.height || style.visibility !== 'visible' || el.closest('[inert]') || el.matches(':disabled')) continue;
          // Measure the associated label for native check/radio inputs: the full label is tappable.
          const target = el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type)
            ? [...(el.labels ?? [])].find(label => label.getBoundingClientRect().width >= 44 && label.getBoundingClientRect().height >= 44) ?? el
            : el;
          const box = target.getBoundingClientRect();
          if (box.width < 44 || box.height < 44) {
            const name = el.getAttribute('aria-label') || el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 70) || el.id || el.tagName;
            problems.push(`${el.tagName.toLowerCase()} ${name}: target ${box.width.toFixed(1)}×${box.height.toFixed(1)}px`);
          }
        }
        return problems;
      });
      findings.push(...await tabAudit(page, true));
      await testInfo.attach('quality-findings', { body: JSON.stringify({ route, palette, viewport: page.viewportSize(), findings }, null, 2), contentType: 'application/json' });
      expect(findings, `${route} ${palette} ${testInfo.project.name}`).toEqual([]);
    });
  }
}
