import { expect, test, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const dist = resolve('dist');

function builtPages(folder = dist): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'pagefind' || entry.name === '_astro') continue;
    const file = join(folder, entry.name);
    if (entry.isDirectory()) routes.push(...builtPages(file));
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      const name = relative(dist, file).split(sep).join('/');
      if (name === '404.html') routes.push('/visible-focus-page-does-not-exist');
      else if (name === 'index.html') routes.push('/');
      else if (name.endsWith('/index.html')) routes.push(`/${name.slice(0, -'/index.html'.length)}`);
      else routes.push(`/${name.slice(0, -'.html'.length)}`);
    }
  }
  return [...new Set(routes)].sort();
}

const routes = builtPages();
const selector = 'a[href], button, input, select, textarea, [tabindex], details > summary:first-of-type';

async function waitForIslands(page: Page, route: string): Promise<void> {
  try {
    await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0, undefined, { timeout: 10_000 });
  } catch {
    throw new Error(`${route}: islands did not finish loading within 10 s`);
  }
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
    throw new Error(`${route}: network requests did not settle within 10 s`);
  });
}

test.describe('Task 210: visible keyboard focus', () => {
  for (const route of routes) {
    test(`${route} gives each Tab stop a visible focus indicator`, async ({ page }) => {
      await page.addInitScript(() => {
        try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* storage unavailable */ }
      });

      const response = await page.goto(route);
      expect(response?.status()).toBe(route === '/visible-focus-page-does-not-exist' ? 404 : 200);
      await waitForIslands(page, route);

      const controls = await page.evaluate((query) => {
        const elements = [...document.querySelectorAll<HTMLElement>(query)];
        const isReachable = (el: HTMLElement) =>
          el.tabIndex >= 0 &&
          !el.matches(':disabled') &&
          !el.closest('[hidden], [inert]') &&
          el.getClientRects().length > 0 &&
          getComputedStyle(el).display !== 'none' &&
          getComputedStyle(el).visibility === 'visible';

        return elements.flatMap((el, index) => {
          if (!isReachable(el)) return [];
          if (el instanceof HTMLInputElement && el.type === 'radio' && el.name) {
            const group = elements.filter(
              (peer): peer is HTMLInputElement =>
                peer instanceof HTMLInputElement &&
                peer.type === 'radio' &&
                peer.name === el.name &&
                peer.form === el.form &&
                isReachable(peer),
            );
            if (el !== (group.find((peer) => peer.checked) ?? group[0])) return [];
          }
          const style = getComputedStyle(el);
          return [{
            index,
            label: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}[${index}]`,
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            outlineColor: style.outlineColor,
            outlineOffset: style.outlineOffset,
            boxShadow: style.boxShadow,
          }];
        });
      }, selector);

      const failures: string[] = [];
      const visited = new Set<number>();
      const maxTabs = Math.max(24, controls.length * 3 + 20);
      // The crossword's skipped controls only need one backward audit per page, not one for every grid re-entry.
      let crosswordBacktracked = false;

      const inspectFocus = async () => {
        const focused = await page.evaluate(({ query, baselines }) => {
          const element = document.activeElement;
          if (!(element instanceof HTMLElement) || element === document.body || element === document.documentElement) return null;
          const candidates = [...document.querySelectorAll<HTMLElement>(query)];
          const index = candidates.indexOf(element);
          const previous = baselines.find((control) => control.index === index);
          const style = getComputedStyle(element);

          const color = style.outlineColor;
          const transparent = color === 'transparent' ||
            (color.startsWith('rgba(') && Number.parseFloat(color.slice(color.lastIndexOf(',') + 1)) === 0);
          const outlineVisible = style.outlineStyle !== 'none' &&
            Number.parseFloat(style.outlineWidth) > 0 && !transparent;
          const outlineChanged = !previous ||
            style.outlineStyle !== previous.outlineStyle ||
            style.outlineWidth !== previous.outlineWidth ||
            style.outlineColor !== previous.outlineColor ||
            style.outlineOffset !== previous.outlineOffset;
          const shadowChanged = style.boxShadow !== 'none' && style.boxShadow !== previous?.boxShadow;

          return {
            index,
            visible: element.matches(':focus-visible') && ((outlineVisible && outlineChanged) || shadowChanged),
            isCrosswordCell: element.getAttribute('data-cell') !== null || element.classList.contains('crossword-cell'),
          };
        }, { query: selector, baselines: controls });

        if (!focused || focused.index < 0) return null;
        visited.add(focused.index);
        if (!focused.visible) {
          failures.push(controls.find((c) => c.index === focused.index)?.label ?? `control[${focused.index}]`);
        }
        return focused;
      };

      for (let step = 0; step < maxTabs && visited.size < controls.length; step++) {
        await page.keyboard.press('Tab');
        const focused = await inspectFocus();

        // On /play, the crossword widget captures Tab to navigate word cells and only releases on Escape.
        // CuewordGame.tsx moves focus directly to the check button on Escape, jumping over the preceding
        // 26 letters, erase and cue buttons. We inspect the check button destination, then traverse backward
        // with Shift+Tab through the skipped controls before pressing Escape again from the grid to return to
        // the check button, allowing normal forward Tab traversal to proceed from there.
        // If focus later re-enters the grid, Escape again but do not repeat the already-audited backward walk.
        if (route === '/play' && focused?.isCrosswordCell) {
          await page.keyboard.press('Escape');
          const checkFocus = await inspectFocus();
          if (checkFocus && !crosswordBacktracked) {
            crosswordBacktracked = true;
            let backwardSteps = 0;
            while (backwardSteps < 35) {
              await page.keyboard.press('Shift+Tab');
              backwardSteps++;
              const backFocus = await inspectFocus();
              if (!backFocus || backFocus.isCrosswordCell) {
                // Stepped back into the crossword grid or out of the skipped controls; press Escape
                // to return focus directly to the check button so normal forward Tab can resume.
                if (backFocus?.isCrosswordCell) {
                  await page.keyboard.press('Escape');
                } else {
                  for (let fwd = 0; fwd < backwardSteps; fwd++) {
                    await page.keyboard.press('Tab');
                  }
                }
                await inspectFocus();
                break;
              }
            }
          }
        }
      }

      expect(failures, `${route} has keyboard stops without visible focus`).toEqual([]);
      expect(visited.size, `${route} did not visit every keyboard stop`).toBe(controls.length);
    });
  }
});
