import { expect, test } from '@playwright/test';
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

test.describe('Task 210: visible keyboard focus', () => {
  for (const route of routes) {
    test(`${route} gives each Tab stop a visible focus indicator`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(route === '/visible-focus-page-does-not-exist' ? 404 : 200);

      const controls = await page.locator(selector).evaluateAll((elements) => elements.flatMap((element, index) => {
        const style = getComputedStyle(element);
        if (element.tabIndex < 0 || element.matches(':disabled') || style.display === 'none' || style.visibility === 'hidden' || element.closest('[hidden], [inert]')) return [];
        if (element instanceof HTMLInputElement && element.type === 'radio' && element.name) {
          const group = elements.filter((peer): peer is HTMLInputElement =>
            peer instanceof HTMLInputElement && peer.type === 'radio' && peer.name === element.name && peer.form === element.form,
          );
          if (element !== (group.find((peer) => peer.checked) ?? group[0])) return [];
        }
        return [{ index, label: element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}[${index}]` }];
      }));
      const failures: string[] = [];
      const visited = new Set<number>();
      const maxTabs = Math.max(24, controls.length * 3 + 12);

      for (let step = 0; step < maxTabs && visited.size < controls.length; step++) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate((query) => {
          const element = document.activeElement;
          if (!(element instanceof HTMLElement) || element === document.body || element === document.documentElement) return null;
          const candidates = [...document.querySelectorAll<HTMLElement>(query)];
          const index = candidates.indexOf(element);
          const style = getComputedStyle(element);
          const outlineVisible = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0 && style.outlineColor !== 'transparent';
          const shadowVisible = style.boxShadow !== 'none';
          return { index, visible: element.matches(':focus-visible') && (outlineVisible || shadowVisible) };
        }, selector);
        if (!focused || focused.index < 0) continue;
        visited.add(focused.index);
        if (!focused.visible) failures.push(controls.find(control => control.index === focused.index)?.label ?? `control[${focused.index}]`);
      }

      expect(failures, `${route} has keyboard stops without visible focus`).toEqual([]);
      expect(visited.size, `${route} did not visit every keyboard stop`).toBe(controls.length);
    });
  }
});
