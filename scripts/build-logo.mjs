/**
 * Builds the "cueory" wordmark as SVG outlines from Bodoni Moda Medium (500),
 * following the brand guide: lowercase, letter spacing 0, default kerning.
 * Outlines mean the logo never depends on the font loading.
 *
 * Run: node scripts/build-logo.mjs   (re-run only if the brand guide changes)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import opentype from 'opentype.js';

const FONT = 'node_modules/@fontsource/bodoni-moda/files/bodoni-moda-latin-500-normal.woff';
const WORD = 'cueory';
const COLORS = {
  espresso: '#3F2E24', // light logo
  ivory: '#F9F5EF', // light background
  eveningIvory: '#EFE6DA', // dark logo
  charcoal: '#1B1715', // dark background
};

const buf = readFileSync(FONT);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

const size = 1000;
const path = font.getPath(WORD, 0, 0, size, { kerning: true, letterSpacing: 0 });
const box = path.getBoundingBox();
const d = path.toPathData(2);

// Tight box around the letters; the brand guide's clear space (0.25 H) is added by the page layout.
const w = box.x2 - box.x1;
const h = box.y2 - box.y1;
const viewBox = `${box.x1.toFixed(2)} ${box.y1.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`;

const wordmark = (fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="cueory"><path fill="${fill}" d="${d}"/></svg>\n`;

// Square (1:1, the primary aspect ratio) with the wordmark centered at ~70% width.
const square = (bg, fill) => {
  const side = w / 0.7;
  const x = box.x1 - (side - w) / 2;
  const y = box.y1 - (side - h) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x.toFixed(2)} ${y.toFixed(2)} ${side.toFixed(2)} ${side.toFixed(2)}" role="img" aria-label="cueory">` +
    `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${side.toFixed(2)}" height="${side.toFixed(2)}" fill="${bg}"/>` +
    `<path fill="${fill}" d="${d}"/></svg>\n`
  );
};

mkdirSync('src/assets/brand', { recursive: true });
mkdirSync('public/brand', { recursive: true });

// Used inline by the site header; fill follows the text color, so it switches with light/dark mode.
writeFileSync('src/assets/brand/wordmark-path.json', JSON.stringify({ viewBox, d, ratio: w / h }) + '\n');

writeFileSync('public/brand/cueory-wordmark-light.svg', wordmark(COLORS.espresso));
writeFileSync('public/brand/cueory-wordmark-dark.svg', wordmark(COLORS.eveningIvory));
writeFileSync('public/brand/cueory-square-light.svg', square(COLORS.ivory, COLORS.espresso));
writeFileSync('public/brand/cueory-square-dark.svg', square(COLORS.charcoal, COLORS.eveningIvory));
writeFileSync('public/favicon.svg', square(COLORS.charcoal, COLORS.eveningIvory));

console.log(`Wordmark width ÷ height (incl. the y tail) ≈ ${(w / h).toFixed(2)}. The supplied artwork measures ≈ 4.2.`);
