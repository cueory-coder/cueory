import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { site } from '../../src/config/site';

const root = new URL('../../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const paths = (svg: string) => [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
const fills = (svg: string) => [...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toUpperCase());

const manifest = JSON.parse(read('public/brand/cueory-brand-manifest.json'));

describe('brand assets (Cueory_Branding_Spec.md)', () => {
  it('motto is exact and lowercase', () => {
    expect(site.tagline).toBe('by nursing students, for nursing students.');
  });

  it('uses the approved, frozen geometry master v1.0 (changing it needs Christian\'s approval)', () => {
    expect(manifest.master.file).toBe('brand-source/cueory-geometry-master-v1.0.json');
    expect(sha(readFileSync(new URL(manifest.master.file, root)))).toBe(
      '4982f24f4bae805840320267d522d2046c4332069349338dfcdf1dd3703adea6',
    );
  });

  it('were built from the recorded geometry master and reference banner', () => {
    expect(sha(readFileSync(new URL(manifest.master.file, root)))).toBe(manifest.master.sha256);
    expect(sha(readFileSync(new URL('brand-source/cueory-banner-reference-light.png', root)))).toBe(
      '056266ef0b4687918de8e3b1b952562c13f415ad03d3327d17b0beec01a962e0',
    );
    for (const [file, hash] of Object.entries(manifest.files)) {
      expect(sha(read(file)), `${file} changed without rebuilding`).toBe(hash);
    }
  });

  it.each(['wordmark', 'square', 'banner'])('%s: light and dark use identical geometry', (kind) => {
    const light = read(`public/brand/cueory-${kind}-light.svg`);
    const dark = read(`public/brand/cueory-${kind}-dark.svg`);
    expect(paths(light)).toEqual(paths(dark));
    expect(light.replace(/fill="#[0-9A-Fa-f]{6}"/g, '')).toBe(dark.replace(/fill="#[0-9A-Fa-f]{6}"/g, ''));
  });

  it('uses only the spec colors', () => {
    expect(fills(read('public/brand/cueory-banner-light.svg'))).toEqual(['#F9F5EF', '#3F2E24', '#6B5243', '#6B5243', '#6B5243']);
    expect(fills(read('public/brand/cueory-banner-dark.svg'))).toEqual(['#1B1715', '#EFE6DA', '#CBB8A4', '#CBB8A4', '#CBB8A4']);
  });

  it('logo files are outlines with an accessible name, no fonts or scripts', () => {
    for (const file of Object.keys(manifest.files)) {
      const svg = read(file);
      expect(svg).toMatch(/aria-label="cueory/);
      expect(svg).not.toMatch(/<text|<script|<image|font-family|href=/);
    }
  });

  it('banner is 3:1', () => {
    expect(read('public/brand/cueory-banner-light.svg')).toContain('viewBox="0 0 2172 724"');
  });
});
