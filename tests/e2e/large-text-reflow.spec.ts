import { expect, test, type Page } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const dist = resolve('dist');

function builtPages(folder = dist): string[] {
  const routes: string[] = [];
  if (!existsSync(folder)) return routes;
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'pagefind' || entry.name === '_astro') continue;
    const file = join(folder, entry.name);
    if (entry.isDirectory()) routes.push(...builtPages(file));
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      const name = relative(dist, file).split(sep).join('/');
      if (name === '404.html') routes.push('/task-280-missing-page');
      else if (name === 'index.html') routes.push('/');
      else if (name.endsWith('/index.html')) routes.push(`/${name.slice(0, -'/index.html'.length)}`);
      else routes.push(`/${name.slice(0, -'.html'.length)}`);
    }
  }
  return routes;
}

async function settleIslands(page: Page, route: string): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0, undefined, { timeout: 10_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
    throw new Error(`${route}: network requests did not settle within 10 s`);
  });
}

const routes = builtPages();

test.describe('Task 280: large-text reflow', () => {
  for (const route of routes) {
    test(`${route} has no sideways scroll or clipped visible controls at 32px root text`, async ({ page }) => {
      await page.goto(route);
      await page.evaluate(() => {
        document.documentElement.style.setProperty('font-size', '32px', 'important');
      });
      await settleIslands(page, route);
      await expect(page.locator('html')).toHaveCSS('font-size', '32px');

      const findings = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        const clipped = [...document.querySelectorAll<HTMLElement>('a, button, input, select, textarea, [role="button"]')]
          .filter((element) => {
            const style = getComputedStyle(element);
            return element.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          })
          .map((element) => {
            const box = element.getBoundingClientRect();
            return { name: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName.toLowerCase(), left: box.left, right: box.right };
          })
          .filter(({ left, right }) => left < -1 || right > width + 1);
        // Diagnostic only: surface the elements extending past the 32px-text viewport
        // without loosening either accessibility assertion.
        const overflowCandidates = [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((element) => {
            const style = getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && (box.right > width + 1 || box.left < -1);
          })
          .map((element) => {
            const box = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              tag: element.tagName.toLowerCase(),
              id: element.id,
              classes: typeof element.className === 'string' ? element.className.slice(0, 90) : '',
              left: Math.round(box.left),
              right: Math.round(box.right),
              overflowX: style.overflowX,
            };
          })
          .sort((a, b) => b.right - a.right)
          .slice(0, 12);
        // A document can overflow even when no descendant box crosses the viewport:
        // intrinsic scroll boxes, pseudo-elements, or html/body widths can cause it.
        // These are diagnostics only; the strict assertions below are unchanged.
        const rootMetrics = [document.documentElement, document.body, document.querySelector('main'), document.querySelector('footer')]
          .filter((element): element is HTMLElement => element instanceof HTMLElement)
          .map((element) => {
            const box = element.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(),
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              left: Math.round(box.left),
              right: Math.round(box.right),
              overflowX: getComputedStyle(element).overflowX,
            };
          });
        const scrollBoxes = [...document.querySelectorAll<HTMLElement>('body, body *')]
          .filter((element) => {
            const style = getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden' && element.scrollWidth > element.clientWidth + 1;
          })
          .map((element) => {
            const box = element.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(),
              classes: typeof element.className === 'string' ? element.className.slice(0, 65) : '',
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              excess: element.scrollWidth - element.clientWidth,
              left: Math.round(box.left),
              right: Math.round(box.right),
              overflowX: getComputedStyle(element).overflowX,
            };
          })
          .sort((a, b) => b.excess - a.excess)
          .slice(0, 8);
        return { scrollWidth: document.documentElement.scrollWidth, width, clipped, overflowCandidates, rootMetrics, scrollBoxes };
      });

      expect(
        findings.scrollWidth,
        `${route}: horizontal overflow. Out-of-bounds elements: ${JSON.stringify(findings.overflowCandidates)}. Root metrics: ${JSON.stringify(findings.rootMetrics)}. Scroll boxes: ${JSON.stringify(findings.scrollBoxes)}`,
      ).toBeLessThanOrEqual(findings.width);
      expect(findings.clipped, `${route}: clipped visible controls`).toEqual([]);
    });
  }
});
