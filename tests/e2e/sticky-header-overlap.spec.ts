import { expect, test, type Locator, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const dist = resolve('dist');

function builtRoutes(folder = dist): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'pagefind' || entry.name === '_astro') continue;
    const file = join(folder, entry.name);
    if (entry.isDirectory()) routes.push(...builtRoutes(file));
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      const name = relative(dist, file).split(sep).join('/');
      if (name === '404.html') routes.push('/sticky-header-page-does-not-exist');
      else if (name === 'index.html') routes.push('/');
      else if (name.endsWith('/index.html')) routes.push(`/${name.slice(0, -'/index.html'.length)}`);
      else routes.push(`/${name.slice(0, -'.html'.length)}`);
    }
  }
  return routes;
}

const routes = [...new Set(builtRoutes())].sort();

async function waitForIslands(page: Page, route: string): Promise<void> {
  try {
    await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0, undefined, {
      timeout: 10_000,
    });
  } catch {
    throw new Error(`${route}: islands did not finish loading within 10 s`);
  }
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
    throw new Error(`${route}: network requests did not settle within 10 s`);
  });
}

async function assertNotCovered(element: Locator, route: string, label: string): Promise<void> {
  const result = await element.evaluate((target) => {
    const header = document.querySelector<HTMLElement>('header[data-scroll-header]');
    if (!header) return { skipped: true as const };
    const headerRect = header.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const visibleHeader = headerRect.height > 0 && headerRect.bottom > 0;
    const overlaps = visibleHeader && targetRect.top < headerRect.bottom && targetRect.bottom > headerRect.top;
    return { skipped: false as const, overlaps, headerBottom: headerRect.bottom, targetTop: targetRect.top };
  });
  expect(result, `${route}: ${label} did not produce a focus target`).not.toEqual({ skipped: true });
  if (!result.skipped) {
    expect(result.overlaps, `${route}: ${label} is covered by the sticky header (header bottom ${result.headerBottom}, target top ${result.targetTop})`).toBe(false);
  }
}

test.describe('Task 270: sticky header overlap', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* storage unavailable */ }
    });
  });

  for (const route of routes) {
    test(`${route}: first heading and focused controls stay below the header`, async ({ page }) => {
      await page.goto(route);
      await waitForIslands(page, route);

      const header = page.locator('header[data-scroll-header]');
      const heading = page.locator('main :is(h1, h2, h3, h4, h5, h6)').first();
      await expect(heading, `${route}: expected a heading in main`).toHaveCount(1);
      if (await header.count() === 0) return;
      await expect(header, `${route}: expected a sticky header`).toHaveCount(1);
      await heading.evaluate((element) => element.scrollIntoView({ block: 'start', inline: 'nearest' }));
      await expect.poll(() => header.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(0);
      await assertNotCovered(heading, route, 'first heading');

      const controls = page.locator('main a[href], main button, main input, main select, main textarea, main [tabindex]:not([tabindex="-1"])');
      const count = await controls.count();
      for (let index = 0; index < count; index++) {
        const control = controls.nth(index);
        if (!(await control.isVisible()) || await control.isDisabled().catch(() => false)) continue;
        await control.evaluate((element) => element.scrollIntoView({ block: 'start', inline: 'nearest' }));
        await control.evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
        await expect(control).toBeFocused();
        await assertNotCovered(control, route, `control ${index}`);
      }
    });
  }
});
