/**
 * Builds every brand file from ONE geometry master (brand-source/cueory-geometry-master-*.json),
 * which was traced from Christian's approved banner. Light and dark files share identical
 * geometry; only the fill colors change (Cueory_Branding_Spec.md, sections 6–7).
 *
 * Run: node scripts/build-brand.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const MASTER = 'brand-source/cueory-geometry-master-v1.0.json';
const master = JSON.parse(readFileSync(MASTER, 'utf8'));
const { upscale: UP, regions, rules, source } = master;
const word = regions.wordmark;
const motto = regions.motto;

const themes = {
  light: { background: '#F9F5EF', wordmark: '#3F2E24', motto: '#6B5243' },
  dark: { background: '#1B1715', wordmark: '#EFE6DA', motto: '#CBB8A4' },
};

// Wordmark path lives in its own upscaled crop space: 0..width*UP, 0..height*UP.
const wW = word.crop[2] * UP;
const wH = word.crop[3] * UP;
const title = '<title>cueory</title>';

const wordmarkSvg = (fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wW} ${wH}" role="img" aria-label="cueory">${title}<path fill="${fill}" fill-rule="evenodd" d="${word.d}"/></svg>\n`;

// Square (1:1): wordmark centered at 79% of the width, matching the supplied square artwork's proportion.
const squareSvg = (bg, fill) => {
  const side = Math.round(wW / 0.79);
  const x = Math.round((side - wW) / 2);
  const y = Math.round((side - wH) / 2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" role="img" aria-label="cueory">${title}` +
    `<rect width="${side}" height="${side}" fill="${bg}"/>` +
    `<path transform="translate(${x} ${y})" fill="${fill}" fill-rule="evenodd" d="${word.d}"/></svg>\n`
  );
};

// Long banner (3:1) in the reference's own 2172 × 724 coordinates.
const place = (region) => `translate(${region.crop[0]} ${region.crop[1]}) scale(${1 / UP})`;
const rect = ([l, t, r, b], fill) => `<rect x="${l}" y="${t}" width="${r - l}" height="${b - t}" fill="${fill}"/>`;
const bannerSvg = (theme) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${source.width} ${source.height}" role="img" aria-label="cueory — by nursing students, for nursing students.">` +
  `<title>cueory — by nursing students, for nursing students.</title>` +
  `<rect width="${source.width}" height="${source.height}" fill="${theme.background}"/>` +
  `<path transform="${place(word)}" fill="${theme.wordmark}" fill-rule="evenodd" d="${word.d}"/>` +
  `<path transform="${place(motto)}" fill="${theme.motto}" fill-rule="evenodd" d="${motto.d}"/>` +
  rect(rules.left, theme.motto) +
  rect(rules.right, theme.motto) +
  `</svg>\n`;

const files = {
  'public/brand/cueory-wordmark-light.svg': wordmarkSvg(themes.light.wordmark),
  'public/brand/cueory-wordmark-dark.svg': wordmarkSvg(themes.dark.wordmark),
  'public/brand/cueory-square-light.svg': squareSvg(themes.light.background, themes.light.wordmark),
  'public/brand/cueory-square-dark.svg': squareSvg(themes.dark.background, themes.dark.wordmark),
  'public/brand/cueory-banner-light.svg': bannerSvg(themes.light),
  'public/brand/cueory-banner-dark.svg': bannerSvg(themes.dark),
  'public/favicon.svg': squareSvg(themes.dark.background, themes.dark.wordmark),
};

mkdirSync('public/brand', { recursive: true });
mkdirSync('src/assets/brand', { recursive: true });
for (const [path, svg] of Object.entries(files)) writeFileSync(path, svg);

// Inline header logo: fill follows the page text color, so it switches with the theme.
writeFileSync('src/assets/brand/wordmark-path.json', JSON.stringify({ viewBox: `0 0 ${wW} ${wH}`, d: word.d }) + '\n');

const sha = (s) => createHash('sha256').update(s).digest('hex');
const manifest = {
  version: master.version,
  status: master.status,
  master: { file: MASTER, sha256: sha(readFileSync(MASTER)) },
  reference: source,
  themes,
  files: Object.fromEntries(Object.entries(files).map(([p, svg]) => [p, sha(svg)])),
};
writeFileSync('public/brand/cueory-brand-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${Object.keys(files).length} files from ${MASTER}`);
