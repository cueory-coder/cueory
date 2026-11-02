/**
 * Builds the static share card images for Task 103 (D-pending): one 1200×630 PNG per tool group and card style in
 * public/share/. Nothing personal goes in them.
 *
 * - Background and words: drawn by Chromium (Playwright, already a dev dependency) so the self-hosted Lato and
 *   Bodoni Moda in public/fonts/ are used, the same files the site serves.
 * - Logo: Christian's official artwork from public/brand/v1/ (BRAND.md), composited on top by sharp. It is never typed
 *   in a font, traced, recolored, stretched, faded or given an effect: the Ivory file goes on dark cards and the
 *   Espresso file on the ivory card, scaled to exactly half of the 480px web copy (both sides, so the shape is kept).
 *
 * Run from the repository root after `npx playwright install chromium`:
 *
 *   node scripts/build-share-cards.mjs
 *
 * SHARE_CARDS_CHROMIUM=/path/to/chrome uses a specific Chromium build instead of Playwright's own.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const OUT_DIR = 'public/share';
const W = 1200;
const H = 630;
const STYLES = ['scene', 'ivory', 'bronze-coin'];

/** Brand colors (BRAND.md) and the scene colors Christian chose for share cards (2026-11-01). */
const C = {
  ivory: '#f9f5ef',
  sand: '#cbb8a4',
  taupe: '#d3b7a1',
  bronze: '#6b5243',
  espresso: '#3e2c23',
  walnut: '#231911',
  wine: '#59171b',
  studyGreen: '#051f20',
  coinDeep: '#7d6249',
  coinMid: '#b89473',
  coinLight: '#e2c6a2',
};

/** The approved motto, exactly as BRAND.md writes it. */
const MOTTO = 'by nursing students, for nursing students.';

/** Tool groups: every game shares one set of cards, study skills has its own. */
const GROUPS = [
  { id: 'games', scene: C.wine, name: 'daily games', glyph: 'G' },
  { id: 'study', scene: C.studyGreen, name: 'study skills', glyph: 'S' },
];

/** The official logo: Ivory art on dark cards, Espresso art on the ivory card. */
const LOGO = {
  ivory: 'public/brand/v1/logo-full-dark-480.png',
  espresso: 'public/brand/v1/logo-full-light-480.png',
};
/** Each file's one ink color (BRAND.md: Ivory art and Espresso art). */
const LOGO_INK = { ivory: [249, 245, 239], espresso: [62, 44, 35] };
const LOGO_WIDTH = 240; // half of the 480px web copy; at least 96px (AGENTS.md) and the header size (BRAND.md)
const LOGO_LEFT = 72;
const LOGO_TOP = 64;

const font = (file) => `data:font/woff2;base64,${readFileSync(`public/fonts/${file}`).toString('base64')}`;
const FONTS = `
  @font-face { font-family: 'Lato'; font-weight: 400; src: url(${font('lato-latin-400-normal.woff2')}) format('woff2'); }
  @font-face { font-family: 'Lato'; font-weight: 700; src: url(${font('lato-latin-700-normal.woff2')}) format('woff2'); }
  @font-face { font-family: 'Bodoni Moda'; font-weight: 400 900; src: url(${font('bodoni-moda-latin-opsz-normal.woff2')}) format('woff2'); }
`;

const BASE = `
  * { margin: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body { position: relative; font-family: 'Lato', sans-serif; line-height: 1.5; -webkit-font-smoothing: antialiased; }
  .serif { font-family: 'Bodoni Moda', serif; font-weight: 500; line-height: 1.1; letter-spacing: -0.025em; }
`;

/** Which logo goes on each style, and the HTML for the card behind it. */
function card(group, style) {
  if (style === 'scene') {
    return {
      logo: 'ivory',
      css: `body { background: ${group.scene}; color: ${C.ivory}; }
        .band { position: absolute; left: -200px; width: 1800px; background: ${C.ivory}; transform: rotate(-18deg); }
        .band-wide { top: 470px; height: 120px; opacity: 0.03; }
        .band-thin { top: 620px; height: 60px; opacity: 0.025; }
        .text { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding-top: 60px; }
        h1 { font-size: 112px; }
        p { margin-top: 24px; font-size: 32px; color: ${C.sand}; }`,
      body: `<div class="band band-wide"></div><div class="band band-thin"></div>
        <div class="text"><h1 class="serif">${group.name}</h1><p>${MOTTO}</p></div>`,
    };
  }
  if (style === 'ivory') {
    return {
      logo: 'espresso',
      css: `body { background: ${C.ivory}; color: ${C.espresso}; }
        .rule { position: absolute; left: ${LOGO_LEFT}px; top: 196px; width: 96px; height: 2px; background: ${C.taupe}; }
        h1 { position: absolute; left: ${LOGO_LEFT}px; bottom: 150px; font-size: 136px; }
        p { position: absolute; left: ${LOGO_LEFT}px; bottom: 84px; font-size: 32px; color: ${C.bronze}; }`,
      body: `<div class="rule"></div><h1 class="serif">${group.name}</h1><p>${MOTTO}</p>`,
    };
  }
  return {
    logo: 'ivory',
    css: `body { background: ${C.walnut}; color: ${C.ivory}; }
      .glow { position: absolute; left: ${W / 2 - 230}px; top: 40px; width: 460px; height: 460px; border-radius: 50%; background: ${C.coinDeep}; opacity: 0.12; }
      .coin { position: absolute; left: ${W / 2 - 170}px; top: 100px; width: 340px; height: 340px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        background: radial-gradient(circle at 38% 32%, ${C.coinLight} 0%, ${C.coinMid} 45%, ${C.coinDeep} 100%);
        box-shadow: inset 0 -10px 28px rgb(35 25 17 / 0.45), inset 0 8px 18px rgb(249 245 239 / 0.25), 0 14px 40px rgb(0 0 0 / 0.45);
        border: 6px solid rgb(226 198 162 / 0.6); }
      .coin span { font-size: 168px; color: ${C.espresso}; line-height: 1; padding-bottom: 12px; }
      p { position: absolute; left: 0; right: 0; top: 476px; text-align: center; font-size: 40px; font-weight: 700; }`,
    body: `<div class="glow"></div><div class="coin"><span class="serif">${group.glyph}</span></div><p>${group.name}</p>`,
  };
}

function html(group, style) {
  const { css, body } = card(group, style);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${BASE}${css}</style></head><body>${body}</body></html>`;
}

/**
 * The official logo file at LOGO_WIDTH, the way scripts/build-brand-v1.mjs scales it: resizing changes only the
 * transparency (how much ink covers each pixel), and every pixel is put back to the file's exact ink color.
 */
async function logoImage(variant) {
  const meta = await sharp(LOGO[variant]).metadata();
  const height = Math.round((meta.height * LOGO_WIDTH) / meta.width);
  const { data, info } = await sharp(LOGO[variant])
    .resize({ width: LOGO_WIDTH, height, fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [r, g, b] = LOGO_INK[variant];
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const logos = { ivory: await logoImage('ivory'), espresso: await logoImage('espresso') };
  const browser = await chromium.launch({ executablePath: process.env.SHARE_CARDS_CHROMIUM || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    for (const group of GROUPS) {
      for (const style of STYLES) {
        await page.setContent(html(group, style));
        const missing = await page.evaluate(async (faces) => {
          await Promise.all(faces.map((face) => document.fonts.load(face)));
          await document.fonts.ready;
          return faces.filter((face) => !document.fonts.check(face));
        }, ['400 20px Lato', '700 20px Lato', '500 20px "Bodoni Moda"']);
        if (missing.length) throw new Error(`fonts did not load: ${missing.join(', ')}`);
        const background = await page.screenshot({ type: 'png' });
        const outPath = `${OUT_DIR}/${group.id}-${style}.png`;
        await sharp(background)
          .composite([{ input: logos[card(group, style).logo], left: LOGO_LEFT, top: LOGO_TOP }])
          .png({ compressionLevel: 9 })
          .toFile(outPath);
        console.log(`wrote ${outPath}`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
