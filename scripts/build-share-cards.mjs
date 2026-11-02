/**
 * Generates static share card images for Task 103 (D-pending).
 *
 * Produces one 1200×630 PNG per (tool-group × style) in public/share/.
 * No personal data. Run from the repository root (sharp is an Astro transitive dep):
 *
 *   node scripts/build-share-cards.mjs
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const OUT_DIR = 'public/share';
const W = 1200;
const H = 630;

const COLORS = {
  ivory: '#f9f5ef',
  espresso: '#3e2c23',
  walnut: '#231911',
  wine: '#4a0e0e',
  studyGreen: '#051f20',
  studyLeaf: '#163832',
  bronze1: '#7d6249',
  bronze2: '#b89473',
  bronze3: '#e2c6a2',
  soft: '#d3b7a1',
  line: '#d3b7a1',
};

/** Tool groups: all games share the same card; study gets its own. */
const GROUPS = [
  { id: 'games', scene: COLORS.wine, name: 'daily games', glyph: 'G' },
  { id: 'study', scene: COLORS.studyGreen, name: 'study skills', glyph: 'S' },
];

/** Build an SVG string for a given group and style. */
function makeSvg(group, style) {
  const { scene, name, glyph } = group;
  if (style === 'scene') return makeSceneCard(scene, name);
  if (style === 'ivory') return makeIvoryCard(name);
  return makeBronzeCoinCard(glyph, name);
}

function makeSceneCard(bg, name) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <!-- subtle texture: two diagonal bands at low opacity -->
  <rect x="-200" y="350" width="1800" height="120" fill="white" fill-opacity="0.03" transform="rotate(-18 600 315)"/>
  <rect x="-200" y="500" width="1800" height="60"  fill="white" fill-opacity="0.025" transform="rotate(-18 600 315)"/>
  <!-- wordmark stand-in: 'cueory' in Lato, upper-left -->
  <text x="60" y="80" font-family="Lato, sans-serif" font-size="32" font-weight="700" fill="${COLORS.ivory}" fill-opacity="0.6" letter-spacing="6">cueory</text>
  <!-- main label -->
  <text x="${W / 2}" y="${H / 2 + 20}" text-anchor="middle" font-family="Lato, sans-serif" font-size="96" font-weight="700" fill="${COLORS.ivory}" letter-spacing="-2">${name}</text>
  <!-- tagline -->
  <text x="${W / 2}" y="${H / 2 + 90}" text-anchor="middle" font-family="Lato, sans-serif" font-size="32" fill="${COLORS.ivory}" fill-opacity="0.55">daily medical study</text>
</svg>`;
}

function makeIvoryCard(name) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${COLORS.ivory}"/>
  <!-- decorative large display number / glyph (Bodoni editorial feel) -->
  <text x="60" y="480" font-family="'Bodoni Moda', 'Bodoni 72', Didot, Georgia, serif" font-size="480" font-style="italic" fill="${COLORS.espresso}" fill-opacity="0.06" letter-spacing="-20">7</text>
  <!-- divider -->
  <line x1="60" y1="80" x2="60" y2="500" stroke="${COLORS.line}" stroke-width="2"/>
  <!-- wordmark -->
  <text x="88" y="120" font-family="Lato, sans-serif" font-size="28" font-weight="700" fill="${COLORS.espresso}" fill-opacity="0.45" letter-spacing="5">cueory</text>
  <!-- main label -->
  <text x="88" y="390" font-family="'Bodoni Moda', 'Bodoni 72', Didot, Georgia, serif" font-size="88" fill="${COLORS.espresso}">${name}</text>
  <!-- tagline -->
  <text x="88" y="470" font-family="Lato, sans-serif" font-size="30" fill="${COLORS.espresso}" fill-opacity="0.5">daily medical study</text>
</svg>`;
}

function makeBronzeCoinCard(glyph, name) {
  const cx = W / 2, cy = H / 2;
  const r = 210;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="coin" cx="38%" cy="32%" r="65%">
      <stop offset="0%"   stop-color="${COLORS.bronze3}"/>
      <stop offset="45%"  stop-color="${COLORS.bronze2}"/>
      <stop offset="100%" stop-color="${COLORS.bronze1}"/>
    </radialGradient>
    <radialGradient id="shadow" cx="50%" cy="50%" r="50%">
      <stop offset="60%"  stop-color="black" stop-opacity="0"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.35"/>
    </radialGradient>
    <filter id="softshadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="24" flood-color="black" flood-opacity="0.5"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="${COLORS.walnut}"/>
  <!-- subtle warm glow behind coin -->
  <circle cx="${cx}" cy="${cy}" r="${r + 60}" fill="${COLORS.bronze1}" fill-opacity="0.12"/>
  <!-- coin body -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#coin)" filter="url(#softshadow)"/>
  <!-- coin edge ring -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${COLORS.bronze3}" stroke-width="6" stroke-opacity="0.6"/>
  <circle cx="${cx}" cy="${cy}" r="${r - 14}" fill="none" stroke="${COLORS.bronze1}" stroke-width="2" stroke-opacity="0.5"/>
  <!-- inner shadow -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#shadow)"/>
  <!-- glyph (Bodoni editorial) -->
  <text x="${cx}" y="${cy + 52}" text-anchor="middle" font-family="'Bodoni Moda', 'Bodoni 72', Didot, Georgia, serif" font-size="160" font-style="italic" fill="${COLORS.espresso}" fill-opacity="0.75">${glyph}</text>
  <!-- wordmark, lower left -->
  <text x="60" y="${H - 44}" font-family="Lato, sans-serif" font-size="26" font-weight="700" fill="${COLORS.ivory}" fill-opacity="0.4" letter-spacing="4">cueory</text>
  <!-- name label, lower right -->
  <text x="${W - 60}" y="${H - 44}" text-anchor="end" font-family="Lato, sans-serif" font-size="26" fill="${COLORS.ivory}" fill-opacity="0.5">${name}</text>
</svg>`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const STYLES = ['scene', 'ivory', 'bronze-coin'];
  const tasks = [];
  for (const group of GROUPS) {
    for (const style of STYLES) {
      tasks.push({ group, style });
    }
  }

  for (const { group, style } of tasks) {
    const svg = makeSvg(group, style);
    const outPath = `${OUT_DIR}/${group.id}-${style}.png`;
    await sharp(Buffer.from(svg))
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    console.log(`wrote ${outPath}`);
  }

  console.log(`done — ${tasks.length} images in ${OUT_DIR}/`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
