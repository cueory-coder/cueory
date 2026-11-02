import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BASE_CONNECT_SRC, connectSrc } from '../../src/islands/supabasecsp';

describe('connect-src', () => {
  it("is today's policy when the build has no account settings", () => {
    expect(connectSrc({})).toBe("connect-src 'self' https://cloudflareinsights.com");
    expect(connectSrc({})).toBe(BASE_CONNECT_SRC);
  });

  it('adds exactly one project origin when the settings are valid', () => {
    const value = connectSrc({
      PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example_not_a_real_key',
    });
    expect(value).toBe("connect-src 'self' https://cloudflareinsights.com https://abcdefghijklmnopqrst.supabase.co");
    expect(value).not.toContain('*');
  });

  it('adds nothing for settings the reader refuses', () => {
    for (const env of [
      { PUBLIC_SUPABASE_URL: 'https://evil.example.com', PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' },
      { PUBLIC_SUPABASE_URL: 'http://abcdefghijklmnopqrst.supabase.co', PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' },
      { PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_x' },
      { PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' },
    ]) {
      expect(connectSrc(env)).toBe(BASE_CONNECT_SRC);
    }
  });

  it('is what astro.config.mjs uses', () => {
    const config = readFileSync(fileURLToPath(new URL('../../astro.config.mjs', import.meta.url)), 'utf8');
    expect(config).toContain('connectSrc(publicEnv)');
    expect(config).not.toMatch(/"connect-src[^"]*"/);
  });
});
