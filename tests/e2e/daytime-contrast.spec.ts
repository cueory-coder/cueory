import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { isEveningProject } from './projects';

const dist = resolve('dist');
const missingPage = '/daytime-contrast-page-does-not-exist';

function builtPages(folder = dist): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'pagefind' || entry.name === '_astro') continue;
    const file = join(folder, entry.name);
    if (entry.isDirectory()) routes.push(...builtPages(file));
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      const name = relative(dist, file).split(sep).join('/');
      if (name === '404.html') routes.push(missingPage);
      else if (name === 'index.html') routes.push('/');
      else if (name.endsWith('/index.html')) routes.push(`/${name.slice(0, -'/index.html'.length)}`);
      else routes.push(`/${name.slice(0, -'.html'.length)}`);
    }
  }
  return routes;
}

const pages = [...new Set(builtPages())].sort();
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

test.describe('Task 233: Daytime contrast sweep', () => {
  for (const route of pages) {
    test(`${route} has no light-palette contrast violations`, async ({ page }, testInfo) => {
      test.skip(isEveningProject(testInfo), 'Evening palette is covered by the existing dark-theme sweep.');
      await page.addInitScript(() => {
        try {
          localStorage.setItem('cueory-theme', 'light');
          localStorage.setItem('cueory-promo-seen', String(Date.now()));
        } catch {
          // Storage may be blocked, but the test should still report the page state.
        }
      });
      const response = await page.goto(route);
      expect(response?.status()).toBe(route === missingPage ? 404 : 200);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
      expect(results.violations.map((violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`,
      )).toEqual([]);
    });
  }
});
