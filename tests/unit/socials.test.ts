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

  it('shows Instagram, TikTok and YouTube, and keeps X and Facebook hidden until Christian confirms them', () => {
    const shown = socials.filter((social) => social.href).map((social) => social.id);
    expect(shown).toEqual(['instagram', 'tiktok', 'youtube']);
  });

  it('uses Simple Icons pinned to an exact version, at build time only', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(pkg.devDependencies['simple-icons']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies?.['simple-icons']).toBeUndefined();
  });
});
