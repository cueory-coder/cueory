import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { site } from '../../src/config/site';

/*
  Brand v1.0 (brand-source/v1.0/Cueory_Brand_Guide.md; D-55). The logo is Christian's PNG artwork. The web copies in
  public/brand/v1/ are built from it by scripts/build-brand-v1.mjs, which records every file in
  brand-source/v1.0/manifest.json. These tests fail if a file changes without rebuilding, or if anything drifts from
  the guide's exact colors.
*/

const root = new URL('../../', import.meta.url);
const file = (p: string) => readFileSync(new URL(p, root));
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

interface Export {
  mode?: 'light' | 'dark';
  color?: string;
  background?: string;
  width: number;
  height: number;
  sha256: string;
}
interface Manifest {
  revision: string;
  colors: Record<'ivory' | 'espresso' | 'charcoal', string>;
  sources: Record<string, { role: string; sha256: string }>;
  families: Record<string, { sources: { light: string; dark: string }; overlap: number; files: Record<string, Export> }>;
  icons: Record<string, Export>;
}

const manifest = JSON.parse(file('brand-source/v1.0/manifest.json').toString()) as Manifest;
const exports = Object.entries(manifest.families).flatMap(([, family]) => Object.entries(family.files));
const hex = (rgb: ArrayLike<number>) =>
  `#${Array.from(rgb.length > 3 ? Array.from(rgb).slice(0, 3) : rgb, (c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

describe('brand v1.0', () => {
  it('motto is exact and lowercase', () => {
    expect(site.tagline).toBe('by nursing students, for nursing students.');
  });

  it('uses the guide\'s exact logo colors (§4.1)', () => {
    expect(manifest.revision).toBe('v1.0');
    expect(manifest.colors).toEqual({ ivory: '#F9F5EF', espresso: '#3E2C23', charcoal: '#1C1917' });
  });

  it('keeps every file Christian supplied, unchanged', () => {
    const supplied = readdirSync(new URL('brand-source/v1.0/', root)).filter((name) => name !== 'manifest.json');
    expect(supplied.sort()).toEqual(Object.keys(manifest.sources).sort());
    for (const [name, source] of Object.entries(manifest.sources)) {
      expect(sha(file(`brand-source/v1.0/${name}`)), `${name} changed`).toBe(source.sha256);
    }
  });

  it('has a light and a dark copy of each export, the same size, that are the same drawing', () => {
    for (const [name, family] of Object.entries(manifest.families)) {
      expect(family.overlap, name).toBeGreaterThanOrEqual(0.85);
      const light = Object.values(family.files).filter((f) => f.mode === 'light');
      const dark = Object.values(family.files).filter((f) => f.mode === 'dark');
      expect(light.length, name).toBeGreaterThan(0);
      expect(dark.map((f) => [f.width, f.height])).toEqual(light.map((f) => [f.width, f.height]));
    }
  });

  it('serves exactly the files in the manifest', () => {
    const served = readdirSync(new URL('public/brand/v1/', root)).sort();
    expect(served).toEqual([...exports.map(([name]) => name), ...Object.keys(manifest.icons)].sort());
    expect(existsSync(new URL('public/brand/cueory-brand-manifest.json', root))).toBe(false);
    expect(existsSync(new URL('public/favicon.svg', root))).toBe(false);
  });

  it.each(exports)('%s matches its manifest entry and is one exact brand color', async (name, entry) => {
    const png = file(`public/brand/v1/${name}`);
    expect(sha(png), `${name} changed without rebuilding`).toBe(entry.sha256);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([entry.width, entry.height]);
    expect(info.channels).toBe(4);
    expect(entry.color).toBe(entry.mode === 'light' ? manifest.colors.espresso : manifest.colors.ivory);
    const colors = new Set<string>();
    let transparent = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) transparent += 1;
      else colors.add(hex(data.subarray(i, i + 3)));
    }
    // One color, no box: the artwork sits on any background (silk included) and the cruet's top half stays empty.
    expect([...colors]).toEqual([entry.color]);
    expect(transparent).toBeGreaterThan(0);
  });

  it.each(Object.entries(manifest.icons))('%s is the Daytime emblem on Ivory', async (name, entry) => {
    const png = file(`public/brand/v1/${name}`);
    expect(sha(png), `${name} changed without rebuilding`).toBe(entry.sha256);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(info.height);
    expect(info.width).toBe(entry.width);
    // Corners are the background; the emblem's middle reaches full Espresso.
    expect(hex(data.subarray(0, 3))).toBe(manifest.colors.ivory);
    let darkest = 255 * 3;
    for (let i = 0; i < data.length; i += info.channels) darkest = Math.min(darkest, data[i]! + data[i + 1]! + data[i + 2]!);
    expect(darkest).toBe(62 + 44 + 35);
  });

  it('the logo component uses only files from the manifest', () => {
    const component = file('src/components/Wordmark.astro').toString();
    const named = [...component.matchAll(/name: '([\w-]+)', widths: \[([\d, ]+)\]/g)].flatMap(([, family, widths]) =>
      widths!.split(',').flatMap((w) => ['light', 'dark'].map((mode) => `${family}-${mode}-${w.trim()}.png`)),
    );
    expect(named.length).toBeGreaterThan(0);
    for (const name of named) expect(exports.map(([n]) => n), name).toContain(name);
  });
});
