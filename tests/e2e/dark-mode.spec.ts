import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Task 94: audit the Evening palette on EVERY built page.
 * npm run verify builds dist/ before Playwright runs. Reading dist/ avoids
 * silently missing future pages (including noindex preview pages).
 * The separate Task 74 test owns the general keyboard/skip-link sweep.
 */
const dist = resolve('dist');
const missingPage = '/task-94-evening-page-does-not-exist';

function builtPages(folder = dist): string[] {
  const routes: string[] = [];

  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === '_astro' || entry.name === 'pagefind') continue;
    const file = join(folder, entry.name);

    if (entry.isDirectory()) {
      routes.push(...builtPages(file));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    const name = relative(dist, file).split(sep).join('/');
    if (name === '404.html') routes.push(missingPage);
    else if (name === 'index.html') routes.push('/');
    else if (name.endsWith('/index.html')) routes.push('/' + name.slice(0, -'/index.html'.length));
    else routes.push('/' + name.slice(0, -'.html'.length));
  }

  return routes;
}

const pages = [...new Set(builtPages())].sort();
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

/**
 * Inspect the computed backgrounds of the actual body and every visible
 * element in the main, site header and footer. This catches a component
 * accidentally using a fixed Daytime color even when the root tokens are
 * correctly set to Evening.
 *
 * Ivory and Bronze are deliberately NOT forbidden: both have legitimate
 * Evening uses (primary ink and accent). Other Daytime-only colors are not
 * part of the Evening palette in docs/BRAND.md.
 */
async function checkEveningColors(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const forbidden: Record<string, string> = {
      'rgb(234,220,207)': 'Linen',
      'rgb(211,183,161)': 'Taupe',
      'rgb(139,111,91)': 'Mocha',
      'rgb(62,44,35)': 'Espresso',
    };

    const body = getComputedStyle(document.body).backgroundColor.replace(/\s+/g, '').toLowerCase();
    if (forbidden[body]) problems.push('body: Daytime ' + forbidden[body] + ' background (' + body + ')');

    for (const regionName of ['main', 'header', 'footer']) {
      const region = document.querySelector(regionName);
      if (!region) {
        problems.push(regionName + ': missing landmark');
        continue;
      }

      const found = new Set<string>();
      for (const element of [region, ...region.querySelectorAll('*')]) {
        if (!element.getClientRects().length) continue;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const bg = style.backgroundColor.replace(/\s+/g, '').toLowerCase();
        const daytime = forbidden[bg];
        if (!daytime) continue;
        const name = element.tagName.toLowerCase() + (element.id ? '#' + element.id : '');
        found.add(regionName + ' ' + name + ': Daytime ' + daytime + ' background (' + bg + ')');
      }
      problems.push(...found);
    }

    return problems;
  });
}

test.describe('Task 94: full-site Evening palette audit', () => {
  for (const route of pages) {
    test(route + ': forced dark mode, contrast and backgrounds', async ({ page }, testInfo) => {
      // D-48 phone and desktop. Tablet is covered by Task 74; the existing
      // phone-evening project would duplicate this explicitly forced-dark run.
      test.skip(
        testInfo.project.name !== 'phone' && testInfo.project.name !== 'desktop',
        'Task 94 runs once at phone size and once at desktop size',
      );

      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      await page.addInitScript(() => {
        try {
          // The promo tests own its timing and focus. Don't let a delayed
          // promo cover the page while this color-contrast audit runs.
          localStorage.setItem('cueory-promo-seen', String(Date.now()));
          // First verify the DEVICE-dark palette before explicitly choosing
          // the footer's "dark" option.
          localStorage.removeItem('cueory-theme');
        } catch {
          // Device-dark mode must still work without localStorage.
        }
      });

      const findings: string[] = [];
      const response = await page.goto(route);
      const expectedStatus = route === missingPage ? 404 : 200;
      if (response?.status() !== expectedStatus) {
        findings.push('HTTP status: expected ' + expectedStatus + ', got ' + (response?.status() ?? 'none'));
      }

      const deviceMode = await page.evaluate(() => ({
        darkMedia: matchMedia('(prefers-color-scheme: dark)').matches,
        pageColor: getComputedStyle(document.documentElement).getPropertyValue('--color-page').trim().toLowerCase(),
      }));
      if (!deviceMode.darkMedia) findings.push('device colorScheme was not dark');
      if (deviceMode.pageColor !== '#1c1917') {
        findings.push('device-dark --color-page: expected Evening Charcoal, got ' + deviceMode.pageColor);
      }

      const darkChoice = page.locator('footer [data-theme-picker] input[type="radio"][value="dark"]');
      if ((await darkChoice.count()) !== 1) {
        findings.push('footer: missing Dark theme radio');
      } else {
        await darkChoice.check();
        if (!(await darkChoice.isChecked())) findings.push('footer: Dark choice did not remain checked');
      }

      const selected = await page.evaluate(() => ({
        choice: document.documentElement.dataset.theme,
        stored: (() => {
          try { return localStorage.getItem('cueory-theme'); } catch { return null; }
        })(),
        page: getComputedStyle(document.documentElement).getPropertyValue('--color-page').trim().toLowerCase(),
        surface: getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim().toLowerCase(),
        ink: getComputedStyle(document.documentElement).getPropertyValue('--color-ink').trim().toLowerCase(),
        scheme: getComputedStyle(document.documentElement).colorScheme,
      }));

      if (selected.choice !== 'dark') findings.push('html[data-theme]: expected dark, got ' + selected.choice);
      if (selected.stored !== 'dark') findings.push('footer Dark choice was not saved on this device');
      if (selected.page !== '#1c1917') findings.push('Evening page is not Charcoal: ' + selected.page);
      if (selected.surface !== '#3a2d24') findings.push('Evening surface is not Walnut: ' + selected.surface);
      if (selected.ink !== '#f9f5ef') findings.push('Evening ink is not Ivory: ' + selected.ink);
      if (selected.scheme !== 'dark') findings.push('browser color-scheme is not dark: ' + selected.scheme);

      // The questions page fetches its sample JSON after React mounts. Auditing
      // only "loading the questions…" would miss real question/choice contrast.
      // Wait for the rendered player and actual answer controls. If JSON fails,
      // the readiness assertion fails rather than giving a false clean result.
      if (route === '/learn/study-skills/questions') {
        const player = page.getByTestId('questions');
        await expect(
          player.locator('fieldset legend'),
          'question content must finish loading before the Evening audit',
        ).toBeVisible({ timeout: 15000 });
        await expect(
          player.locator('fieldset input[type="radio"], fieldset input[type="checkbox"]').first(),
          'at least one question choice must be visible before the Evening audit',
        ).toBeVisible();
      }

      findings.push(...await checkEveningColors(page));

      // WCAG AA includes axe's color-contrast rule. Do not turn it off.
      const result = await new AxeBuilder({ page }).withTags(axeTags).analyze();
      for (const violation of result.violations) {
        const targets = violation.nodes.flatMap((node) => node.target).slice(0, 5).join(', ');
        findings.push('axe ' + violation.id + ': ' + violation.help + ' (' + targets + ')');
      }

      // Keep one test per route so a pre-existing failure can be recorded as
      // test.fixme ONLY for that route/project, with its exact rule ID. List
      // those findings in the PR; never skip this whole audit or fix pages here.
      expect(findings, testInfo.project.name + ' ' + route + ': Evening-mode findings').toEqual([]);
    });
  }
});
