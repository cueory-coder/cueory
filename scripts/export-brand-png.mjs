/**
 * Exports PNG copies of the vector brand files (for social profiles, docs, email).
 * Renderer: Playwright's Chromium (version pinned in package-lock.json), sRGB, device scale 1.
 *
 * Run: node scripts/export-brand-png.mjs
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const exports = [
  ['public/brand/cueory-banner-light.svg', 'public/brand/cueory-banner-light-3000x1000.png', 3000, 1000],
  ['public/brand/cueory-banner-dark.svg', 'public/brand/cueory-banner-dark-3000x1000.png', 3000, 1000],
  ['public/brand/cueory-square-light.svg', 'public/brand/cueory-square-light-1024.png', 1024, 1024],
  ['public/brand/cueory-square-dark.svg', 'public/brand/cueory-square-dark-1024.png', 1024, 1024],
];

const browser = await chromium.launch();
for (const [src, out, width, height] of exports) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const svg = readFileSync(src, 'utf8').replace('<svg ', `<svg width="${width}" height="${height}" `);
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width, height } });
  await page.close();
  console.log(out);
}
await browser.close();
