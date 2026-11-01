import { describe, expect, it } from 'vitest';
import { supabaseSettings, type SupabaseSettings } from '../../src/islands/supabaseenv';

const VALID_URL = 'https://abcdefghijklmnop.supabase.co';
const VALID_KEY = 'sb_publishable_abcdefghijklmnopqrstuvwxyz0123456789';

function enabled(result: SupabaseSettings) {
  if (!result.enabled) throw new Error(`Expected enabled, got: ${result.reason}`);
  return result;
}

function disabled(result: SupabaseSettings) {
  if (result.enabled) throw new Error('Expected disabled, got enabled');
  return result;
}

// ── Valid configuration ───────────────────────────────────────────────────────

describe('valid configuration', () => {
  it('returns enabled when both url and key are valid', () => {
    const result = enabled(supabaseSettings({
      PUBLIC_SUPABASE_URL: VALID_URL,
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
    }));
    expect(result.url).toBe(VALID_URL);
    expect(result.key).toBe(VALID_KEY);
  });

  it('strips a trailing slash from the url', () => {
    const result = enabled(supabaseSettings({
      PUBLIC_SUPABASE_URL: VALID_URL + '/',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
    }));
    expect(result.url).toBe(VALID_URL);
  });

  it('trims whitespace from the key', () => {
    const result = enabled(supabaseSettings({
      PUBLIC_SUPABASE_URL: VALID_URL,
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: `  ${VALID_KEY}  `,
    }));
    expect(result.key).toBe(VALID_KEY);
  });
});

// ── Missing fields ────────────────────────────────────────────────────────────

describe('missing fields', () => {
  it('returns disabled when PUBLIC_SUPABASE_URL is absent', () => {
    const r = disabled(supabaseSettings({ PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY }));
    expect(r.reason).toContain('no project address');
  });

  it('returns disabled when PUBLIC_SUPABASE_URL is empty', () => {
    const r = disabled(supabaseSettings({ PUBLIC_SUPABASE_URL: '', PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY }));
    expect(r.reason).toContain('no project address');
  });

  it('returns disabled when PUBLIC_SUPABASE_PUBLISHABLE_KEY is absent', () => {
    const r = disabled(supabaseSettings({ PUBLIC_SUPABASE_URL: VALID_URL }));
    expect(r.reason).toContain('no publishable key');
  });

  it('returns disabled when PUBLIC_SUPABASE_PUBLISHABLE_KEY is empty', () => {
    const r = disabled(supabaseSettings({ PUBLIC_SUPABASE_URL: VALID_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' }));
    expect(r.reason).toContain('no publishable key');
  });

  it('returns disabled when both fields are absent', () => {
    const r = disabled(supabaseSettings({}));
    expect(r.reason).not.toBe('');
  });
});

// ── Malformed URL ─────────────────────────────────────────────────────────────

describe('malformed url', () => {
  it('refuses http instead of https', () => {
    const r = disabled(supabaseSettings({
      PUBLIC_SUPABASE_URL: 'http://abcdefghijklmnop.supabase.co',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
    }));
    expect(r.reason).toContain('https');
    expect(r.reason).toContain('http');
  });

  it('refuses a url with an extra path', () => {
    const r = disabled(supabaseSettings({
      PUBLIC_SUPABASE_URL: VALID_URL + '/rest/v1',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
    }));
    expect(r.reason).toContain('path');
  });

  it('refuses a url with a query string', () => {
    const r = disabled(supabaseSettings({
      PUBLIC_SUPABASE_URL: VALID_URL + '?foo=bar',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
    }));
    expect(r.reason).toContain('misconfigured');
  });

  it('refuses a plain hostname without supabase.co', () => {
    const r = disabled(supabaseSettings({
      PUBLIC_SUPABASE_URL: 'https://example.com',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
    }));
    expect(r.reason).toContain('misconfigured');
  });

  it('refuses a deeply nested supabase.co hostname', () => {
    const r = disabled(supabaseSettings({
      PUBLIC_SUPABASE_URL: 'https://a.b.supabase.co',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
    }));
    expect(r.reason).toContain('misconfigured');
  });

  it('refuses a non-url string', () => {
    const r = disabled(supabaseSettings({
      PUBLIC_SUPABASE_URL: 'not-a-url',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
    }));
    expect(r.reason).toContain('misconfigured');
  });
});

// ── Secret and legacy key detection ──────────────────────────────────────────

describe('secret key detection', () => {
  it('refuses a secret key and says never to put it in a PUBLIC_ variable', () => {
    const r = disabled(supabaseSettings({
      PUBLIC_SUPABASE_URL: VALID_URL,
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abcdefghijklmnopqrstuvwxyz',
    }));
    expect(r.reason).toContain('secret key');
    expect(r.reason).toContain('PUBLIC_');
    // Must not echo the key value
    expect(r.reason).not.toContain('sb_secret_abcdefghijklmnopqrstuvwxyz');
  });

  it('refuses a legacy JWT (anon key) and says never to put it in a PUBLIC_ variable', () => {
    const r = disabled(supabaseSettings({
      PUBLIC_SUPABASE_URL: VALID_URL,
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.sig',
    }));
    expect(r.reason).toContain('legacy JWT');
    expect(r.reason).toContain('PUBLIC_');
    expect(r.reason).not.toContain('eyJ');
  });

  it('detects a secret key even when the url is missing', () => {
    const r = disabled(supabaseSettings({
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_xyz',
    }));
    expect(r.reason).toContain('secret key');
  });
});

// ── Malformed publishable key ────────────────────────────────────────────────

describe('malformed publishable key', () => {
  it('refuses a key that does not start with sb_publishable_', () => {
    const r = disabled(supabaseSettings({
      PUBLIC_SUPABASE_URL: VALID_URL,
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'some_random_key_value',
    }));
    expect(r.reason).toContain('publishable key');
    // Must not echo the value
    expect(r.reason).not.toContain('some_random_key_value');
  });
});
