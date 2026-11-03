/**
 * Task 92: install icons from Christian's approved PNG exports only (D-55).
 * Normal icons are byte-for-byte copies. The maskable icon only scales and pads
 * the existing 512px icon on the guide's Ivory background, without recoloring.
 * sharp is already supplied by Astro; this adds no dependency.
 *
 * node scripts/build-app-icons.mjs
 * node scripts/build-app-icons.mjs --out-dir /path/to/temporary/public
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== '--out-dir')) {
  throw new Error('usage: node scripts/build-app-icons.mjs [--out-dir DIRECTORY]');
}
const output = args.length ? resolve(args[1]) : fileURLToPath(new URL('public/', root));
const brand = JSON.parse(readFileSync(new URL('brand-source/v1.0/manifest.json', root), 'utf8'));
const background = brand.colors.ivory;
const sizes = [180, 192, 512];
mkdirSync(resolve(output, 'icons'), { recursive: true });

for (const size of sizes) {
  const source = readFileSync(new URL(`public/brand/v1/icon-${size}.png`, root));
  const metadata = await sharp(source).metadata();
  if (metadata.width !== size || metadata.height !== size) {
    throw new Error(`approved icon-${size}.png has unexpected dimensions`);
  }
  writeFileSync(resolve(output, `icons/icon-${size}.png`), source);
}

// 384px includes the existing icon's own padding. Even its square artwork box
// then fits inside the maskable safe circle (radius 40% of the 512px canvas).
const paddedSource = await sharp(readFileSync(new URL('public/brand/v1/icon-512.png', root)))
  .resize(384, 384)
  .png()
  .toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 3, background } })
  .composite([{ input: paddedSource, left: 64, top: 64 }])
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(resolve(output, 'icons/icon-maskable-512.png'));

writeFileSync(resolve(output, 'manifest.webmanifest'), `${JSON.stringify({
  name: 'cueory',
  short_name: 'cueory',
  start_url: '/',
  display: 'standalone',
  theme_color: background,
  background_color: background,
  icons: [
    ...sizes.map(size => ({ src: `/icons/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2)}\n`);
