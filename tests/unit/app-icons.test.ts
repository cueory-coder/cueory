import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const file = (path: string) => readFileSync(new URL(path, root));
const manifest = JSON.parse(file('public/manifest.webmanifest').toString());
const brand = JSON.parse(file('brand-source/v1.0/manifest.json').toString());
const names = ['icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

describe('Task 92 app icons and install files', () => {
  it('describes cueory with a root start URL, standalone display and approved colors', () => {
    expect(manifest.name).toBe('cueory');
    expect(manifest.short_name).toBe('cueory');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe(brand.colors.ivory);
    expect(manifest.background_color).toBe(brand.colors.ivory);
    expect(manifest.icons).toEqual([
      ...[180, 192, 512].map(size => ({ src: `/icons/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
  });

  it('ships exactly four icons under the combined 200 KB budget', () => {
    expect(readdirSync(new URL('public/icons/', root)).sort()).toEqual([...names].sort());
    const bytes = names.reduce((sum, name) => sum + statSync(new URL(`public/icons/${name}`, root)).size, 0);
    expect(bytes).toBeLessThan(200_000);
  });

  it.each([180, 192, 512])('keeps the approved %ipx icon unchanged', async size => {
    const png = file(`public/icons/icon-${size}.png`);
    expect(png.equals(file(`public/brand/v1/icon-${size}.png`))).toBe(true);
    const metadata = await sharp(png).metadata();
    expect([metadata.width, metadata.height]).toEqual([size, size]);
  });

  it('keeps all maskable artwork inside the central 40% safe radius on opaque Ivory', async () => {
    const { data, info } = await sharp(file('public/icons/icon-maskable-512.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([512, 512]);
    const ivory = [249, 245, 239];
    let ink = 0;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const at = (y * info.width + x) * 4;
        expect(data[at + 3]).toBe(255);
        const isArtwork = ivory.some((value, channel) => data[at + channel] !== value);
        if (isArtwork) {
          ink += 1;
          expect(Math.hypot(x + 0.5 - 256, y + 0.5 - 256)).toBeLessThanOrEqual(512 * 0.4);
        }
      }
    }
    expect(ink).toBeGreaterThan(0);
  });

  it('rebuilds the checked-in manifest and icons exactly from approved source files', () => {
    const output = mkdtempSync(join(tmpdir(), 'cueory-app-icons-'));
    try {
      execFileSync(process.execPath, [fileURLToPath(new URL('scripts/build-app-icons.mjs', root)), '--out-dir', output]);
      expect(readFileSync(join(output, 'manifest.webmanifest')).equals(file('public/manifest.webmanifest'))).toBe(true);
      for (const name of names) expect(readFileSync(join(output, 'icons', name)).equals(file(`public/icons/${name}`)), name).toBe(true);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });
});
