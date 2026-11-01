import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { socials } from '../../src/config/site';

describe('social profiles (D-54)', () => {
  it('lists each platform once, with an https address or none at all', () => {
    expect(new Set(socials.map((social) => social.id)).size).toBe(socials.length);
    for (const social of socials) {
      if (social.href) expect(new URL(social.href).protocol, social.id).toBe('https:');
    }
  });

  it("shows the six profiles Christian confirmed on 1 Nov 2026 (D-65), with Instagram at @cueory.app", () => {
    const shown = socials.filter((social) => social.href).map((social) => social.id);
    expect(shown).toEqual(['instagram', 'tiktok', 'youtube', 'x', 'facebook', 'pinterest']);
    const href = Object.fromEntries(socials.map((social) => [social.id, social.href]));
    expect(href.instagram).toBe('https://www.instagram.com/cueory.app/');
    expect(href.tiktok).toBe('https://www.tiktok.com/@cueory');
    expect(href.youtube).toBe('https://www.youtube.com/@cueory');
    expect(href.x).toBe('https://x.com/cueory');
    expect(href.pinterest).toBe('https://www.pinterest.com/cueoryapp/');
    expect(href.facebook).toBe('https://www.facebook.com/people/Cueory/61596065312423/');
  });

  it('never puts an account email or anything but a profile address in the settings', () => {
    const source = readFileSync(new URL('../../src/config/site.ts', import.meta.url), 'utf8');
    const block = source.slice(source.indexOf('export const socials'), source.indexOf('] as const;', source.indexOf('export const socials')));
    expect(block).not.toMatch(/@gmail|password|pass:/i);
  });

  it('uses Simple Icons pinned to an exact version, at build time only', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(pkg.devDependencies['simple-icons']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies?.['simple-icons']).toBeUndefined();
  });
});
