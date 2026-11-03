import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

// Match the existing accessibility sweep's built-page inventory, including the real 404 response.
const dist = resolve('dist');
function builtPages(folder = dist): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '_astro' || entry.name === 'pagefind') return [];
    const file = join(folder, entry.name);
    if (entry.isDirectory()) return builtPages(file);
    if (!entry.isFile() || !entry.name.endsWith('.html')) return [];
    const name = relative(dist, file).split(sep).join('/');
    if (name === '404.html') return ['/body-line-height-page-does-not-exist'];
    if (name === 'index.html') return ['/'];
    return [name.endsWith('/index.html')
      ? `/${name.slice(0, -'/index.html'.length)}`
      : `/${name.slice(0, -'.html'.length)}`];
  });
}

for (const route of [...new Set(builtPages())].sort()) {
  test(`${route}: Lato body text has at least 1.5 line height`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.status()).toBe(route === '/body-line-height-page-does-not-exist' ? 404 : 200);
    await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);

    const findings = await page.evaluate(() => {
      return [...document.querySelectorAll<HTMLElement>('p, li, dd')].flatMap((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (!element.textContent?.trim() || !rect.width || !rect.height ||
            style.visibility !== 'visible' || element.closest('[hidden], [inert]')) return [];
        // Headings and decorative display text use a different family and are outside this body-text rule.
        const firstFamily = style.fontFamily.split(',')[0].trim().replaceAll(/['"]/g, '');
        if (firstFamily.toLowerCase() !== 'lato') return [];
        const fontSize = Number.parseFloat(style.fontSize);
        const lineHeight = Number.parseFloat(style.lineHeight);
        if (Number.isFinite(fontSize) && Number.isFinite(lineHeight) && lineHeight + 0.01 >= fontSize * 1.5) return [];
        return [{
          element: element.id ? `#${element.id}` : element.tagName.toLowerCase(),
          text: element.textContent.trim().replaceAll(/\s+/g, ' ').slice(0, 100),
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
        }];
      });
    });
    expect(findings, `${route}: body text below the 1.5 line-height minimum`).toEqual([]);
  });
}
