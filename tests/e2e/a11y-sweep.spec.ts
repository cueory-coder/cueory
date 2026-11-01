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
  const selector = 'a[href], button, input, select, textarea, [tabindex]';

  // The browser only Tabs to one radio in a named group. Other hidden,
  // disabled or negative-tabindex elements aren't promised a Tab stop.
  const eligible = await page.evaluate((query) => {
    const controls = [...document.querySelectorAll<HTMLElement>(query)];
    const isReachable = (el: HTMLElement) =>
      el.tabIndex >= 0 &&
      !el.matches(':disabled') &&
      !el.closest('[inert]') &&
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility === 'visible';

    return controls.flatMap((el, index) => {
      if (!isReachable(el)) return [];
      if (el instanceof HTMLInputElement && el.type === 'radio' && el.name) {
        const group = controls.filter(
          (peer): peer is HTMLInputElement =>
            peer instanceof HTMLInputElement &&
            peer.type === 'radio' &&
            peer.name === el.name &&
            peer.form === el.form &&
            isReachable(peer),
        );
        if (el !== (group.find((peer) => peer.checked) ?? group[0])) return [];
      }
      return [{ index, label: el.id ? '#' + el.id : el.getAttribute('aria-label') ?? el.tagName.toLowerCase() + '[' + index + ']' }];
    });
  }, selector);

  const seen = new Set<number>();
  const maxTabs = Math.max(24, eligible.length * 3 + 12);
  let firstIndex: number | null = null;
  let lastIndex: number | null = null;
  let sameElementTabs = 0;
  let finished = false;

  // Use actual Tab presses, not .focus(), to test keyboard outlines and
  // whether the browser scrolls the focused control into view. A native date
  // input can consume several Tab presses inside one document.activeElement.
  for (let step = 0; step < maxTabs; step++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate((query) => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || el === document.body || el === document.documentElement) return null;

      const candidates = [...document.querySelectorAll<HTMLElement>(query)];
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        index: candidates.indexOf(el),
        name: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''),
        visibleFocus: el.matches(':focus-visible')
          && style.outlineStyle !== 'none'
          && Number.parseFloat(style.outlineWidth) > 0
          && style.outlineColor !== 'transparent'
          && !style.outlineColor.endsWith(', 0)'),
        inViewport: rect.width > 0 && rect.height > 0
          && rect.top < innerHeight && rect.bottom > 0
          && rect.left < innerWidth && rect.right > 0,
      };
    }, selector);

    // Chromium may move focus into browser chrome at the end of the page.
    // It may instead wrap back to the first stop. In either case, make sure
    // every eligible element was visited before accepting completion.
    if (!focused) {
      finished = true;
      break;
    }
    if (firstIndex !== null && focused.index === firstIndex && seen.size > 1
        && eligible.every((control) => seen.has(control.index))) {
      finished = true;
      break;
    }
    if (firstIndex === null) firstIndex = focused.index;

    sameElementTabs = focused.index === lastIndex ? sameElementTabs + 1 : 0;
    lastIndex = focused.index;
    if (sameElementTabs > 8) {
      problems.push(focused.name + ': keyboard focus did not advance after repeated Tab presses');
      break;
    }

    seen.add(focused.index);
    if (focused.index === -1) problems.push(focused.name + ': focus target not in the page tab-order elements');
    if (!focused.visibleFocus) problems.push(focused.name + ': keyboard focus has no visible outline');
    if (!focused.inViewport) problems.push(focused.name + ': focus is outside the visible viewport');
  }

  if (!seen.size) problems.push('Tab did not reach an interactive element');
  const missing = eligible.filter((control) => !seen.has(control.index));
  if (missing.length) {
    problems.push('Tab did not reach ' + missing.length + ' eligible controls: ' + missing.map((c) => c.label).join(', '));
  }
  if (!finished) problems.push('Tab traversal did not finish within ' + maxTabs + ' presses');
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


test.describe('keyboard traversal regression cases', () => {
  test('repeated native date-control stops do not skip buttons after the date', async ({ page }) => {
    await page.setContent(
      '<style>:focus-visible { outline: 2px solid black; }</style>' +
      '<label for="exam-date">exam date</label><input id="exam-date" type="date">' +
      '<button id="save">save</button><button id="skip">skip</button>',
    );
    await page.evaluate(() => {
      const date = document.querySelector<HTMLInputElement>('#exam-date')!;
      let internalTabs = 0;
      date.addEventListener('keydown', (event) => {
        // Model two additional internal segments on top of Chromium's native
        // date-input behavior: activeElement remains the same input.
        if (event.key === 'Tab' && !event.shiftKey && internalTabs < 2) {
          event.preventDefault();
          internalTabs++;
        }
      });
      for (const id of ['save', 'skip']) {
        document.getElementById(id)!.addEventListener('focus', (event) => {
          (event.currentTarget as HTMLElement).dataset.visited = 'yes';
        });
      }
    });

    expect(await tabAudit(page)).toEqual([]);
    await expect(page.locator('#save')).toHaveAttribute('data-visited', 'yes');
    await expect(page.locator('#skip')).toHaveAttribute('data-visited', 'yes');
  });

  test('a genuine keyboard trap reports the controls that were not reached', async ({ page }) => {
    await page.setContent(
      '<style>:focus-visible { outline: 2px solid black; }</style>' +
      '<button id="trapped">first</button><button id="later">later</button>',
    );
    await page.evaluate(() => {
      document.getElementById('trapped')!.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') event.preventDefault();
      });
    });

    const problems = await tabAudit(page);
    expect(problems.some((message) => message.includes('keyboard focus did not advance'))).toBe(true);
    expect(problems.some((message) => message.includes('did not reach') && message.includes('#later'))).toBe(true);
  });
});
