import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const dist = resolve('dist');

function builtPages(folder = dist): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'pagefind' || entry.name === '_astro') continue;
    const file = join(folder, entry.name);
    if (entry.isDirectory()) routes.push(...builtPages(file));
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      const name = relative(dist, file).split(sep).join('/');
      if (name === '404.html') routes.push('/tap-targets-page-does-not-exist');
      else if (name === 'index.html') routes.push('/');
      else if (name.endsWith('/index.html')) routes.push(`/${name.slice(0, -'/index.html'.length)}`);
      else routes.push(`/${name.slice(0, -'.html'.length)}`);
    }
  }
  return routes;
}

const pages = [...new Set(builtPages())].sort();

test.describe('Task 209: main-content tap targets', () => {
  test('the build supplies routes to the sweep', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const route of pages) {
    test(`${route} has usable button and link targets`, async ({ page }) => {
      const response = await page.goto(route);
      const expectedStatus = route === '/tap-targets-page-does-not-exist' ? 404 : 200;
      expect(response?.status(), `${route} should return HTTP ${expectedStatus}`).toBe(expectedStatus);
      await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
      await page.waitForLoadState('networkidle').catch(() => undefined);

      const smallTargets = await page.locator('main a[href], main button').evaluateAll((elements) =>
        elements.flatMap((element) => {
          const el = element as HTMLElement;
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          if (el.matches(':disabled, [aria-disabled="true"]') || style.visibility === 'hidden' ||
              style.display === 'none' || rect.width === 0 || rect.height === 0) return [];

          // Inline prose links are intentionally exempt. A link with a visual box, padding, or a button role is a
          // deliberate control and must still meet the minimum target size.
          const inlineTextLink = el.tagName === 'A' && style.display === 'inline' &&
            el.getAttribute('role') !== 'button' &&
            [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].every((value) => value === '0px') &&
            style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.borderStyle === 'none';
          if (inlineTextLink) return [];
          // Task 97 explicitly permits 24 px square letter targets on the fixed 11×11 Suture board.
          // This is limited to that grid. All other interactive controls still require 44 px.
          const sutureLetterCell = el.matches('button[data-cell]') && !!el.closest('[data-testid="suture"]');
          const minimum = sutureLetterCell ? 24 : 44;
          if (rect.width >= minimum && rect.height >= minimum) return [];
          return [{
            tag: el.tagName.toLowerCase(),
            label: (el.textContent ?? el.getAttribute('aria-label') ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100,
            minimum,
          }];
        }),
      );

      expect(smallTargets, `${route} has undersized main controls`).toEqual([]);
    });
  }
});
