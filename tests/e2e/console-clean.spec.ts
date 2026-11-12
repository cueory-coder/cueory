import { expect, test, type Page } from '@playwright/test';
import { builtPages } from './built-pages';
import { allowedConsoleFinding, consoleAllowances, CONSOLE_MISSING_ROUTE, type ConsoleFinding } from './console-allow';
import { isDesktopOfEachEngine } from './projects';

/**
 * W15-2 (#58): a page should load and hydrate without unhandled JS errors, console errors,
 * broken first-party assets or CSP violations. Run once per desktop engine, across every
 * built page (including the real 404 response), rather than only a hand-picked route list.
 */
const routes = builtPages(CONSOLE_MISSING_ROUTE);

function firstParty(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/** Install the CSP event listener before navigation, so parser-time violations are visible. */
async function installCspListener(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const violations: string[] = [];
    (window as Window & { __cueoryConsoleCsp?: string[] }).__cueoryConsoleCsp = violations;
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(event.effectiveDirective + ': ' + event.blockedURI +
        ' at ' + event.sourceFile + ':' + event.lineNumber);
    });
  });
}

/** Start recording before goto so even requests and script failures during parsing count. */
function collectErrors(page: Page, origin: string): ConsoleFinding[] {
  const findings: ConsoleFinding[] = [];
  page.on('pageerror', (error) => {
    findings.push({ kind: 'pageerror', url: page.url(), message: error.message });
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    findings.push({ kind: 'console', url: message.location().url || page.url(), message: message.text() });
  });
  page.on('requestfailed', (request) => {
    if (!firstParty(request.url(), origin)) return;
    findings.push({ kind: 'requestfailed', url: request.url(),
      message: request.failure()?.errorText ?? 'unknown network failure' });
  });
  page.on('response', (response) => {
    if (!firstParty(response.url(), origin) || response.status() < 400) return;
    findings.push({ kind: 'http', url: response.url(),
      message: 'HTTP ' + response.status() + ' ' + response.request().method() });
  });
  return findings;
}

async function allFindings(page: Page, recorded: ConsoleFinding[]): Promise<ConsoleFinding[]> {
  const violations = await page.evaluate(() =>
    (window as Window & { __cueoryConsoleCsp?: string[] }).__cueoryConsoleCsp ?? []);
  return [
    ...recorded,
    ...violations.map((message) => ({ kind: 'csp' as const, url: page.url(), message })),
  ];
}

function descriptions(route: string, findings: ConsoleFinding[]): string[] {
  return [...new Set(findings
    .filter((finding) => !allowedConsoleFinding(route, finding))
    .map((finding) => finding.kind + ' ' + finding.url + ': ' + finding.message))].sort();
}

for (const route of routes) {
  test(route + ': no console, script, first-party request or CSP errors', async ({ page }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'Desktop-only full-site console sweep');
    const baseURL = testInfo.project.use.baseURL;
    if (!baseURL) throw new Error('The browser project must define its own baseURL.');
    const origin = new URL(baseURL).origin;
    await installCspListener(page);
    const recorded = collectErrors(page, origin);

    const response = await page.goto(route, { waitUntil: 'load' });
    expect(response?.status(), route + ': expected document response')
      .toBe(route === CONSOLE_MISSING_ROUTE ? 404 : 200);
    // Client-only components and secondary sample-data fetches can start after load.
    // Waiting for both hydration and network quiescence exercises those requests too.
    await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0,
      undefined, { timeout: 10_000 });
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.waitForLoadState('networkidle', { timeout: 10_000 });

    expect(descriptions(route, await allFindings(page, recorded)),
      testInfo.project.name + ' ' + route + ': unexpected load failures').toEqual([]);
  });
}

test('the detector records a failing local asset, a script exception and a CSP rejection', async ({ page }, testInfo) => {
  test.skip(!isDesktopOfEachEngine(testInfo), 'Desktop-only detection control');
  const baseURL = testInfo.project.use.baseURL;
  if (!baseURL) throw new Error('The browser project must define its own baseURL.');
  const origin = new URL(baseURL).origin;
  const fixture = '/__console-clean-detector';
  await page.route('**/__console-clean-detector', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html lang="en"><head><title>sample detector</title>' +
      '<meta http-equiv="Content-Security-Policy" content="img-src &#39;none&#39;; script-src &#39;self&#39;">' +
      '</head><body><h1>sample detector</h1>' +
      '<img src="/__console-clean-detector/blocked.png" alt="sample">' +
      '<script src="/__console-clean-detector/broken.js"></script>' +
      '<script src="/__console-clean-detector/throws.js"></script></body></html>',
  }));
  await page.route('**/__console-clean-detector/broken.js', (route) =>
    route.fulfill({ status: 500, contentType: 'application/javascript', body: '' }));
  await page.route('**/__console-clean-detector/throws.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: 'throw new Error("sample detector exception");' }));
  await installCspListener(page);
  const recorded = collectErrors(page, origin);

  const response = await page.goto(fixture);
  expect(response?.status()).toBe(200);
  await page.waitForLoadState('networkidle');
  const issues = await allFindings(page, recorded);
  expect(issues.some((finding) => finding.kind === 'http' &&
    new URL(finding.url).pathname === fixture + '/broken.js' && finding.message === 'HTTP 500 GET')).toBe(true);
  expect(issues.some((finding) => finding.kind === 'pageerror' &&
    finding.message.includes('sample detector exception'))).toBe(true);
  expect(issues.some((finding) => finding.kind === 'csp' &&
    finding.message.includes('img-src'))).toBe(true);
});

test('expected 404 allowances cannot hide a script failure, other route, or wrong HTTP status', () => {
  const host = 'https://cueory-preview.example.test';
  const expected: ConsoleFinding = {
    kind: 'console',
    url: host + CONSOLE_MISSING_ROUTE,
    message: 'Failed to load resource: the server responded with a status of 404 (Not Found)',
  };
  expect(allowedConsoleFinding(CONSOLE_MISSING_ROUTE, expected)).toBe(true);
  expect(allowedConsoleFinding(CONSOLE_MISSING_ROUTE, {
    ...expected, message: 'uncaught app error: sample data not found (404)',
  })).toBe(false);
  expect(allowedConsoleFinding('/', expected)).toBe(false);
  expect(allowedConsoleFinding(CONSOLE_MISSING_ROUTE, {
    ...expected, url: host + '/account',
  })).toBe(false);
  expect(allowedConsoleFinding(CONSOLE_MISSING_ROUTE, {
    ...expected, url: 'not a valid URL',
  })).toBe(false);
  expect(allowedConsoleFinding(CONSOLE_MISSING_ROUTE, {
    ...expected, kind: 'http', message: 'HTTP 500 GET',
  })).toBe(false);
  expect(firstParty(host + '/_astro/main.js', host)).toBe(true);
  expect(firstParty('https://outside.example.test/script.js', host)).toBe(false);
  expect(firstParty('invalid url', host)).toBe(false);
});

test('every recorded exception identifies its exact cause and owner', () => {
  for (const allowance of consoleAllowances) {
    expect(allowance.route).toBeTruthy();
    expect(allowance.resourcePath.startsWith('/')).toBe(true);
    expect(allowance.owner.trim()).not.toBe('');
    expect(allowance.reason.trim()).not.toBe('');
  }
});
