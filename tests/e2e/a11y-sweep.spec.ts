import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Task 74: audit every built HTML page, including 404 and preview pages.
 * `npm run verify` builds `dist/` before Playwright starts. Pagefind's own
 * fragments and Astro assets aren't pages, so they are not part of the sweep.
 */
const dist = resolve('dist');

function builtPages(folder = dist): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'pagefind' || entry.name === '_astro') continue;
    const file = join(folder, entry.name);
    if (entry.isDirectory()) {
      routes.push(...builtPages(file));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      const name = relative(dist, file).split(sep).join('/');
      // Exercise the actual not-found response, not just a direct HTML file.
      if (name === '404.html') routes.push('/a11y-sweep-page-does-not-exist');
      else if (name === 'index.html') routes.push('/');
      else if (name.endsWith('/index.html')) routes.push(`/${name.slice(0, -'/index.html'.length)}`);
      else routes.push(`/${name.slice(0, -'.html'.length)}`);
    }
  }
  return routes;
}

// A missing build should fail loudly instead of silently omitting pages.
const pages = [...new Set(builtPages())].sort();
const missingPage = '/a11y-sweep-page-does-not-exist';
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function tabAudit(page: Page): Promise<string[]> {
  const problems: string[] = [];
  const seen = new Set<number>();
  const possibleStops = await page.locator('a[href], button, input, select, textarea, [tabindex]').count();
  let finished = false;

  // Tab, rather than calling .focus(), so :focus-visible and browser scrolling
  // are tested under the same conditions as actual keyboard navigation.
  for (let step = 0; step <= possibleStops + 2; step++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || el === document.body || el === document.documentElement) return null;

      const candidates = [...document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex]',
      )];
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        index: candidates.indexOf(el),
        name: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`,
        visibleFocus: el.matches(':focus-visible')
          && style.outlineStyle !== 'none'
          && Number.parseFloat(style.outlineWidth) > 0
          && style.outlineColor !== 'transparent'
          && !style.outlineColor.endsWith(', 0)'),
        inViewport: rect.width > 0 && rect.height > 0
          && rect.top < innerHeight && rect.bottom > 0
          && rect.left < innerWidth && rect.right > 0,
      };
    });

    if (!focused || seen.has(focused.index)) {
      finished = true;
      break;
    }
    seen.add(focused.index);
    if (focused.index === -1) problems.push(`${focused.name}: focus target not in the page's tab-order elements`);
    if (!focused.visibleFocus) problems.push(`${focused.name}: keyboard focus has no visible outline`);
    if (!focused.inViewport) problems.push(`${focused.name}: focus is outside the visible viewport`);
  }

  if (!seen.size) problems.push('Tab did not reach an interactive element');
  if (!finished) problems.push(`Tab order did not finish after ${possibleStops + 3} steps`);
  return problems;
}

test.describe('Task 74: full-site accessibility sweep', () => {
  for (const route of pages) {
    test(`${route}: axe, heading, skip link and keyboard focus`, async ({ page }, testInfo) => {
      // Task 94 audits the Evening palette. This test checks precisely the
      // requested three viewports, not a duplicate fourth phone project.
      test.skip(testInfo.project.name === 'phone-evening', 'Evening palette is Task 94');
      await page.addInitScript(() => {
        // The separate promo tests cover its focus behavior. Suppress it here
        // so a timed popup cannot interrupt a long keyboard traversal.
        try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* storage unavailable */ }
      });

      const problems: string[] = [];
      const response = await page.goto(route);
      const expectedStatus = route === missingPage ? 404 : 200;
      if (response?.status() !== expectedStatus) {
        problems.push(`HTTP status: expected ${expectedStatus}, received ${response?.status() ?? 'none'}`);
      }
      const headings = await page.locator('h1').count();
      if (headings !== 1) problems.push(`Expected one h1; found ${headings}`);

      const skip = page.locator('a[href="#main"]', { hasText: 'skip to content' });
      const main = page.locator('main#main');
      if (await skip.count() !== 1 || await main.count() !== 1) {
        problems.push('Missing or duplicated skip link / main#main target');
      } else {
        await page.keyboard.press('Tab');
        if (!(await skip.evaluate((el) => el === document.activeElement))) {
          problems.push('Skip link is not first in the keyboard tab order');
        } else {
          if (!(await skip.isVisible())) problems.push('Focused skip link is not visible');
          await page.keyboard.press('Enter');
          const hash = await page.evaluate(() => location.hash);
          if (hash !== '#main') problems.push(`Skip link did not navigate to #main (hash: ${hash})`);
        }
      }

      // Reset navigation after the skip-link check, so the tab sweep starts
      // at the first interactive element rather than halfway down the page.
      await page.goto(route);
      problems.push(...await tabAudit(page));

      const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
      for (const violation of results.violations) {
        const targets = violation.nodes.flatMap((node) => node.target).join(', ');
        problems.push(`axe ${violation.id}: ${violation.help} (${targets})`);
      }

      // One failure per page, with *every* finding in the assertion output.
      // Do not mark failures as fixed or alter pages in this auditing task.
      expect(problems, `${testInfo.project.name} ${route}: accessibility findings`).toEqual([]);
    });
  }
});
