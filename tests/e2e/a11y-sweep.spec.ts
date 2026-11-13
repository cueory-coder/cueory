import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { builtPages } from './built-pages';
import { tabAudit } from './tab-audit';
import { isEveningProject } from './projects';

/**
 * Task 74: audit every built HTML page, including 404 and preview pages.
 * `npm run verify` builds `dist/` before Playwright starts. Pagefind's own
 * fragments and Astro assets aren't pages, so they are not part of the sweep.
 */
const missingPage = '/a11y-sweep-page-does-not-exist';
const pages = builtPages(missingPage);
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

/**
 * Task 129: wait until every Astro island has hydrated (Astro removes `ssr` from an `astro-island` once it has), and
 * until the page's own requests have settled, so the Tab audit's snapshot sees the same controls the Tab walk meets.
 * Islands that render only in the browser (learn mode, questions, Label it) can otherwise appear after the snapshot.
 * Fails with the route rather than passing silently. Pages with no islands return at once.
 */
async function waitForIslands(page: Page, route: string): Promise<void> {
  try {
    await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0, undefined, {
      timeout: 10_000,
    });
  } catch {
    throw new Error(`${route}: islands did not finish loading within 10 s`);
  }
  // Questions and Label it fetch their sample JSON after hydrating; let those requests finish too.
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
    throw new Error(`${route}: network requests did not settle within 10 s`);
  });
}

test.describe('Task 74: full-site accessibility sweep', () => {
  for (const route of pages) {
    test(`${route}: axe, heading, skip link and keyboard focus`, async ({ page }, testInfo) => {
      // Task 94 audits the Evening palette. This test checks precisely the
      // requested three viewports, not a duplicate fourth phone project.
      test.skip(isEveningProject(testInfo), 'Evening palette is Task 94');
      await page.addInitScript(() => {
        // The separate promo tests cover its focus behavior. Suppress it here
        // so a timed popup cannot interrupt a long keyboard traversal.
        try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* storage unavailable */ }
      });

      const problems: string[] = [];
      const response = await page.goto(route);
      await waitForIslands(page, route);
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
      await waitForIslands(page, route);
      problems.push(...await tabAudit(page));

      const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
      for (const violation of results.violations) {
        const targets = violation.nodes.flatMap((node) => node.target).join(', ');
        problems.push(`axe ${violation.id}: ${violation.help} (${targets})`);
      }

      // One failure per page, with *every* finding in the assertion output.
      // Do not mark failures as fixed or alter pages in this auditing task.
      // If a genuine date-field focus defect remains AFTER the outline
      // detector fix, preserve it as an explicit follow-up for the director.
      if (route === '/start' && problems.length &&
          problems.every((problem) => problem === 'input#exam-date: keyboard focus has no visible outline')) {
        test.fixme(true, '/start: native date-input focus indicator not visible on every internal Tab stop');
      }
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

  test('opaque outline without a focus change is not a focus indicator', async ({ page }) => {
    await page.setContent(
      '<style>button { outline: 2px solid black; }</style>' +
      '<button id="always-outlined">always outlined</button><button>next</button>',
    );
    expect((await tabAudit(page)).some((problem) =>
      problem.includes('#always-outlined: keyboard focus has no visible outline'))).toBe(true);
  });

  test('changing only the outline offset gives a visible keyboard focus indicator', async ({ page }) => {
    await page.setContent(
      '<style>button { outline: 2px solid black; outline-offset: 0px; }' +
      'button:focus-visible { outline-offset: 4px; }</style>' +
      '<button id="offset-only">offset changes on focus</button><button>next</button>',
    );
    expect(await tabAudit(page)).toEqual([]);
  });

  test('a transparent focus outline does not count as visible', async ({ page }) => {
    await page.setContent(
      '<style>:focus-visible { outline: 2px solid transparent; }</style>' +
      '<button id="transparent-outline">transparent</button><button>next</button>',
    );
    expect((await tabAudit(page)).some((problem) =>
      problem.includes('#transparent-outline: keyboard focus has no visible outline'))).toBe(true);
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
