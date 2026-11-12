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
const OG_GAMES = [
  { id: 'pillo', scene: C.wine },
  { id: 'crossword', scene: C.studyGreen },
  { id: 'word-path', scene: C.ivory },
  { id: 'sudoku', scene: C.ivory },
  { id: 'hello-cards', scene: C.wine },
];

const GROUPS = [
  { id: 'games', scene: C.wine, name: 'daily games', glyph: 'G' },
  { id: 'study', scene: C.studyGreen, name: 'study skills', glyph: 'S' },
];

/** The official logo: Ivory art on dark cards, Espresso art on the ivory card. */
const LOGO = {
  ivory: 'public/brand/v1/logo-full-dark-960.png',
  espresso: 'public/brand/v1/logo-full-light-960.png',
};
/** Each file's one ink color (BRAND.md: Ivory art and Espresso art). */
const LOGO_INK = { ivory: [249, 245, 239], espresso: [62, 44, 35] };
// The cards are previewed at about 280px wide (--container-share-card), so the logo is 36% of the card: about 101px
// there, never under the 96px minimum (AGENTS.md), and 432px on the full 1200px card.
const LOGO_WIDTH = 432;
const LOGO_HEIGHT = Math.round((151 * LOGO_WIDTH) / 480); // the full logo's proportions (480 x 151 web copy)
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
        .rule { position: absolute; left: ${LOGO_LEFT}px; top: ${LOGO_TOP + LOGO_HEIGHT + 32}px; width: 96px; height: 2px; background: ${C.taupe}; }
        h1 { position: absolute; left: ${LOGO_LEFT}px; bottom: 150px; font-size: 136px; }
        p { position: absolute; left: ${LOGO_LEFT}px; bottom: 84px; font-size: 32px; color: ${C.bronze}; }`,
      body: `<div class="rule"></div><h1 class="serif">${group.name}</h1><p>${MOTTO}</p>`,
    };
  }
  return {
    logo: 'ivory',
    css: `body { background: ${C.walnut}; color: ${C.ivory}; }
      .glow { position: absolute; left: ${W / 2 - 230 + 140}px; top: 40px; width: 460px; height: 460px; border-radius: 50%; background: ${C.coinDeep}; opacity: 0.12; }
      .coin { position: absolute; left: ${W / 2 - 170 + 140}px; top: 100px; width: 340px; height: 340px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        background: radial-gradient(circle at 38% 32%, ${C.coinLight} 0%, ${C.coinMid} 45%, ${C.coinDeep} 100%);
        box-shadow: inset 0 -10px 28px rgb(35 25 17 / 0.45), inset 0 8px 18px rgb(249 245 239 / 0.25), 0 14px 40px rgb(0 0 0 / 0.45);
        border: 6px solid rgb(226 198 162 / 0.6); }
      .coin span { font-size: 168px; color: ${C.espresso}; line-height: 1; padding-bottom: 12px; }
      p { position: absolute; left: 280px; right: 0; top: 476px; text-align: center; font-size: 40px; font-weight: 700; }`,
    body: `<div class="glow"></div><div class="coin"><span class="serif">${group.glyph}</span></div><p>${group.name}</p>`,
  };
}

function html(group, style) {
  const { css, body } = card(group, style);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${BASE}${css}</style></head><body>${body}</body></html>`;
}

/** Text-free game identity art. These motifs need no font and use only the approved BRAND.md palette. */
function ogMotif(gameId) {
  switch (gameId) {
    case 'pillo':
      return `<svg viewBox="0 0 1200 630" aria-hidden="true">
        <rect x="250" y="75" width="700" height="480" rx="56" fill="${C.sand}"/>
        <rect x="278" y="103" width="644" height="424" rx="42" fill="${C.ivory}"/>
        ${[0, 1].flatMap((row) => [0, 1, 2, 3].map((col) => {
          const x = 317 + col * 158;
          const y = 158 + row * 190;
          const left = col % 2 ? C.bronze : C.wine;
          const right = col % 2 ? C.wine : C.bronze;
          return `<circle cx="${x + 48}" cy="${y + 62}" r="62" fill="${C.taupe}"/>
            <path d="M${x + 23} ${y + 39}h25v46h-25a23 23 0 0 1 0-46Z" fill="${left}"/>
            <path d="M${x + 48} ${y + 39}h25a23 23 0 0 1 0 46h-25Z" fill="${right}"/>`;
        })).join('')}
      </svg>`;
    case 'crossword': {
      const blocks = new Set(['0,0','0,1','0,7','0,8','1,0','1,4','1,8','2,2','2,6','3,3','3,5','4,1','4,4','4,7','5,3','5,5','6,2','6,6','7,0','7,4','7,8','8,0','8,1','8,7','8,8']);
      const cells = Array.from({ length: 81 }, (_, index) => {
        const row = Math.floor(index / 9);
        const col = index % 9;
        const dark = blocks.has(`${row},${col}`);
        const dot = !dark && (row + col) % 5 === 0
          ? `<circle cx="${384 + col * 54}" cy="${99 + row * 54}" r="8" fill="${C.bronze}"/>`
          : '';
        return `<rect x="${359 + col * 54}" y="${74 + row * 54}" width="50" height="50" fill="${dark ? C.espresso : C.ivory}"/>${dot}`;
      }).join('');
      return `<svg viewBox="0 0 1200 630" aria-hidden="true">
        <rect x="323" y="38" width="554" height="554" rx="28" fill="${C.sand}"/>${cells}
      </svg>`;
    }
    case 'word-path': {
      const points = [[190,445],[315,300],[460,390],[595,205],[735,330],[875,175],[1015,300]];
      return `<svg viewBox="0 0 1200 630" aria-hidden="true">
        <circle cx="160" cy="120" r="42" fill="${C.taupe}"/>
        <circle cx="1040" cy="500" r="54" fill="${C.sand}"/>
        <polyline points="${points.map((point) => point.join(',')).join(' ')}" fill="none" stroke="${C.bronze}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
        ${points.map(([x, y], index) => `<circle cx="${x}" cy="${y}" r="58" fill="${index % 2 ? C.studyGreen : C.wine}"/>
          <circle cx="${x}" cy="${y}" r="34" fill="${C.ivory}"/>
          <circle cx="${x}" cy="${y}" r="13" fill="${index % 2 ? C.bronze : C.sand}"/>`).join('')}
      </svg>`;
    }
    case 'sudoku': {
      const lines = Array.from({ length: 10 }, (_, index) => {
        const at = 330 + index * 60;
        const width = index % 3 === 0 ? 10 : 3;
        return `<line x1="${at}" y1="45" x2="${at}" y2="585" stroke="${C.espresso}" stroke-width="${width}"/>
          <line x1="330" y1="${45 + index * 60}" x2="870" y2="${45 + index * 60}" stroke="${C.espresso}" stroke-width="${width}"/>`;
      }).join('');
      const marks = [[0,1],[0,5],[1,3],[1,8],[2,0],[2,6],[3,2],[3,7],[4,4],[5,1],[5,6],[6,2],[6,8],[7,0],[7,5],[8,3],[8,7]];
      return `<svg viewBox="0 0 1200 630" aria-hidden="true">
        <rect x="302" y="17" width="596" height="596" rx="24" fill="${C.sand}"/>
        <rect x="330" y="45" width="540" height="540" fill="${C.ivory}"/>${lines}
        ${marks.map(([row, col], index) => `<circle cx="${360 + col * 60}" cy="${75 + row * 60}" r="15" fill="${index % 3 === 0 ? C.wine : C.bronze}"/>`).join('')}
      </svg>`;
    }
    case 'hello-cards':
      return `<svg viewBox="0 0 1200 630" aria-hidden="true">
        <rect x="210" y="110" width="500" height="360" rx="34" fill="${C.sand}"/>
        <rect x="210" y="110" width="500" height="22" fill="${C.bronze}"/>
        <circle cx="305" cy="215" r="34" fill="${C.wine}"/>
        <rect x="370" y="190" width="240" height="18" rx="9" fill="${C.taupe}"/>
        <rect x="370" y="254" width="220" height="18" rx="9" fill="${C.taupe}"/>
        <rect x="370" y="318" width="200" height="18" rx="9" fill="${C.bronze}"/>
        <rect x="490" y="160" width="500" height="360" rx="34" fill="${C.ivory}"/>
        <rect x="490" y="160" width="500" height="22" fill="${C.studyGreen}"/>
        <circle cx="585" cy="265" r="34" fill="${C.studyGreen}"/>
        <rect x="650" y="240" width="240" height="18" rx="9" fill="${C.sand}"/>
        <rect x="650" y="304" width="220" height="18" rx="9" fill="${C.sand}"/>
        <rect x="650" y="368" width="200" height="18" rx="9" fill="${C.bronze}"/>
        <circle cx="935" cy="465" r="22" fill="${C.bronze}"/>
      </svg>`;
  }
  throw new Error(`unknown game preview: ${gameId}`);
}

function ogHtml(game) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
    body { background: ${game.scene}; }
    svg { display: block; width: 1200px; height: 630px; }
  </style></head><body>${ogMotif(game.id)}</body></html>`;
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
    for (const game of OG_GAMES) {
      await page.setContent(ogHtml(game));
      const background = await page.screenshot({ type: 'png' });
      const outPath = `${OUT_DIR}/${game.id}-og.png`;
      await sharp(background).png({ compressionLevel: 9 }).toFile(outPath);
      console.log(`wrote ${outPath}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
