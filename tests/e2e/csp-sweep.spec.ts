import { expect, test, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const dist = resolve('dist');
const missingPage = '/csp-sweep-page-does-not-exist';

// Match the accessibility sweep's built HTML inventory, including previews and
// the actual 404 response. A missing build fails instead of skipping the sweep.
function builtPages(folder = dist): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'pagefind' || entry.name === '_astro') return [];
    const file = join(folder, entry.name);
    if (entry.isDirectory()) return builtPages(file);
    if (!entry.isFile() || !entry.name.endsWith('.html')) return [];
    const name = relative(dist, file).split(sep).join('/');
    if (name === '404.html') return [missingPage];
    if (name === 'index.html') return ['/'];
    if (name.endsWith('/index.html')) return [`/${name.slice(0, -'/index.html'.length)}`];
    return [`/${name.slice(0, -'.html'.length)}`];
  });
}

async function watchCsp(page: Page): Promise<string[]> {
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' && /content[ -]security[ -]policy|\bcsp\b/i.test(message.text())) {
      consoleErrors.push(message.text());
    }
  });
  // Install before navigation so even violations from the first parser scripts
  // and styles are recorded. Console wording alone varies between engines.
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { __cueoryCspViolations: violations });
    document.addEventListener('securitypolicyviolation', event => {
      violations.push(`${event.effectiveDirective}: ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}`);
    });
  });
  return consoleErrors;
}

async function violations(page: Page, consoleErrors: string[]): Promise<string[]> {
  const events = await page.evaluate(() =>
    (window as Window & { __cueoryCspViolations?: string[] }).__cueoryCspViolations ?? []);
  return [...events, ...consoleErrors];
}

test.describe('Task 191: every built route obeys CSP', () => {
  for (const route of [...new Set(builtPages())].sort()) {
    test(`${route}: no policy violations during page load and hydration`, async ({ page }) => {
      const consoleErrors = await watchCsp(page);
      const response = await page.goto(route);
      expect(response?.status(), `${route}: HTTP response`).toBe(route === missingPage ? 404 : 200);
      const policy = response?.headers()['content-security-policy'] ??
        await page.locator('meta[http-equiv="content-security-policy" i]').getAttribute('content');
      expect(policy, `${route}: an enforced CSP must be present`).toBeTruthy();
      await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
      await page.waitForLoadState('networkidle');
      expect(await violations(page, consoleErrors), `${route}: CSP findings`).toEqual([]);
    });
  }
});

test('CSP detector catches a deliberately blocked inline style', async ({ page }) => {
  const consoleErrors = await watchCsp(page);
  await page.route('**/__csp-detector-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><meta http-equiv="Content-Security-Policy" content="style-src \'none\'">' +
      '<title>CSP detector fixture</title><style>body { color: red; }</style><h1>fixture</h1>',
  }));
  await page.goto('/__csp-detector-fixture');
  await expect.poll(async () => (await violations(page, consoleErrors)).length).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __cueoryCspViolations?: string[] }).__cueoryCspViolations
      ?.some(message => message.startsWith('style-src-elem: inline')) ?? false)).toBe(true);
});
