import { expect, test, type Locator, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

// Task 232's specified CSS viewport models the reflow width. It does not claim
// to set browser chrome zoom or replace the separate 320/390 px phone sweep.
const dist = resolve('dist');
function builtRoutes(directory = dist): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '_astro' || entry.name === 'pagefind') return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return builtRoutes(path);
    if (!entry.isFile() || !entry.name.endsWith('.html')) return [];
    const name = relative(dist, path).split(sep).join('/');
    if (name === '404.html') return ['/reflow-route-does-not-exist'];
    if (name === 'index.html') return ['/'];
    return [`/${name.replace(/(?:\/index)?\.html$/, '')}`];
  });
}
const routes = [...new Set(builtRoutes())].sort();

async function waitForIslands(page: Page) {
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

async function horizontalClipping(control: Locator): Promise<string[]> {
  return control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const label = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''} (${element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 60) ?? ''})`;
    const problems: string[] = [];
    // One CSS pixel permits fractional border/rounding differences for controls.
    if (rect.left < -1 || rect.right > width + 1) problems.push(`${label}: outside viewport (${rect.left}, ${rect.right})`);
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (!['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)) continue;
      const parentRect = parent.getBoundingClientRect();
      const left = parentRect.left + parent.clientLeft;
      const right = left + parent.clientWidth;
      if (rect.left < left - 1 || rect.right > right + 1) {
        problems.push(`${label}: clipped by ${parent.tagName.toLowerCase()}${parent.id ? `#${parent.id}` : ''}`);
      }
    }
    return problems;
  });
}

test.describe('640 CSS px reflow', () => {
  // One desktop project is sufficient for this fixed-width sweep. Repeating it
  // in every device project would run the same geometry checks four times.
  test.use({ viewport: { width: 640, height: 900 }, reducedMotion: 'reduce' });
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'fixed-width desktop reflow sweep');
    await page.addInitScript(() => {
      try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* blocked storage */ }
    });
  });

  for (const route of routes) test(`${route}: no horizontal overflow or clipped controls`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(route === '/reflow-route-does-not-exist' ? 404 : 200);
    await waitForIslands(page);
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(dimensions.viewport).toBe(640);
    expect(dimensions.scroll, `${route}: document overflows horizontally`).toBeLessThanOrEqual(dimensions.client);

    const controls = page.locator('a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]');
    const problems: string[] = [];
    for (const control of await controls.all()) {
      if (!(await control.isVisible())) continue;
      if (await control.evaluate((element) => !!element.closest('[inert], [hidden], [aria-hidden="true"]'))) continue;
      await control.scrollIntoViewIfNeeded();
      problems.push(...await horizontalClipping(control));
    }
    expect(problems, `${route}\n${problems.join('\n')}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('the clipping check distinguishes fitting and overflowing controls', async ({ page }) => {
    await page.setContent('<button id="fits">fits</button><div style="width:80px; overflow:hidden"><button id="clipped" style="width:160px">clipped</button></div><button id="outside" style="position:absolute;left:700px">outside</button>');
    expect(await horizontalClipping(page.locator('#fits'))).toEqual([]);
    expect((await horizontalClipping(page.locator('#clipped'))).some((problem) => problem.includes('clipped by div'))).toBe(true);
    expect((await horizontalClipping(page.locator('#outside'))).some((problem) => problem.includes('outside viewport'))).toBe(true);
  });
});
