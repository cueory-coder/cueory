/** Task 75: guard Cueory's Cloudflare headers and Astro CSP against silent relaxation. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const headersText = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
const astroText = readFileSync(new URL('../../astro.config.mjs', import.meta.url), 'utf8');

function readHeaders(text: string): Map<string, string> {
  const rows = text.split(/\r?\n/).map((row) => row.trim()).filter((row) => row && !row.startsWith('#'));
  if (rows[0] !== '/*') throw new Error('Missing site-wide Cloudflare /* rule');
  const headers = new Map<string, string>();
  for (const row of rows.slice(1)) {
    const match = /^([A-Za-z-]+):\s+(.+)$/.exec(row);
    if (!match) throw new Error('Unexpected Cloudflare header or path rule: ' + row);
    const name = match[1]!.toLowerCase();
    if (headers.has(name)) throw new Error('Duplicate header: ' + name);
    headers.set(name, match[2]!);
  }
  return headers;
}

function readCsp(text: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of text.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean);
    if (!name) continue;
    if (directives.has(name)) throw new Error('Duplicate CSP directive: ' + name);
    directives.set(name, sources);
  }
  return directives;
}

/** Read only a literal array. An expression or new configuration shape needs explicit review. */
function readLiteralArray(text: string, name: 'directives' | 'resources'): string[] {
  const found = new RegExp('\\b' + name + ':\\s*\\[([\\s\\S]*?)\\]\\s*,').exec(text);
  if (!found) throw new Error('Missing CSP ' + name + ' list');
  return found[1]!.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'))
    .map((line) => {
      const match = /^(["'\x60])([\s\S]*?)\1,?$/.exec(line);
      if (!match) throw new Error('Non-literal CSP ' + name + ' entry: ' + line);
      return match[2]!;
    });
}

function rejectUnsafeSources(directives: Map<string, string[]>): void {
  for (const [name, sources] of directives) {
    for (const source of sources) {
      if (source.includes('*')) throw new Error('Wildcard in CSP ' + name);
      if (source === "'unsafe-eval'" || source === "'unsafe-inline'") {
        throw new Error('Unsafe CSP source in ' + name);
      }
    }
  }
}

function checkHeaderPolicy(text: string): void {
  const headers = readHeaders(text);
  expect(Object.fromEntries(headers)).toEqual({
    'content-security-policy': "frame-ancestors 'none'; frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; upgrade-insecure-requests",
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    'cross-origin-opener-policy': 'same-origin',
  });

  const csp = readCsp(headers.get('content-security-policy') ?? '');
  rejectUnsafeSources(csp);
  expect(Object.fromEntries(csp)).toEqual({
    'frame-ancestors': ["'none'"],
    'frame-src': ['https://www.youtube-nocookie.com'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'upgrade-insecure-requests': [],
  });
}

function checkConnectSources(sources: string[]): void {
  const baseline = ["'self'", 'https://cloudflareinsights.com'];
  const extra = sources.filter((source) => !baseline.includes(source));
  const validSupabase = /^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.supabase\.co$/;
  if (!baseline.every((source) => sources.includes(source)) ||
      new Set(sources).size !== sources.length ||
      extra.length > 1 || extra.some((source) => !validSupabase.test(source))) {
    throw new Error('Unexpected connect-src origin');
  }
}

function checkAstroPolicy(text: string): void {
  const csp = readCsp(readLiteralArray(text, 'directives').join(';'));
  rejectUnsafeSources(csp);
  expect([...csp.keys()].sort()).toEqual([
    'default-src', 'img-src', 'font-src', 'connect-src', 'frame-src',
    'object-src', 'base-uri', 'form-action',
  ].sort());
  expect(csp.get('default-src')).toEqual(["'self'"]);
  expect(csp.get('img-src')).toEqual(["'self'", 'data:']);
  expect(csp.get('font-src')).toEqual(["'self'"]);
  expect(csp.get('frame-src')).toEqual(['https://www.youtube-nocookie.com']);
  expect(csp.get('object-src')).toEqual(["'none'"]);
  expect(csp.get('base-uri')).toEqual(["'self'"]);
  checkConnectSources(csp.get('connect-src') ?? []);

  // Only the newsletter form origin can be computed, and it must come from URL.origin.
  expect(csp.get('form-action')).toEqual(["'self'" + '$' + '{formOrigin}']);
  expect(text).toMatch(/const formOrigin = newsletter\.formAction \? \x60 \x24\{new URL\(newsletter\.formAction\)\.origin\}\x60 : '';/);

  const resources = readLiteralArray(text, 'resources');
  rejectUnsafeSources(new Map([['script-src', resources]]));
  expect(resources).toEqual(["'self'", "'wasm-unsafe-eval'", 'https://static.cloudflareinsights.com']);
  expect(text).toMatch(/\bhashes:\s*\[\s*themeHeadScriptHash\s*\]/);
}

describe('security headers (Task 75)', () => {
  it('preserves every current Cloudflare header and locked frame policy', () => {
    checkHeaderPolicy(headersText);
  });

  it('preserves Astro CSP directives, script sources, and narrow newsletter form action', () => {
    checkAstroPolicy(astroText);
  });

  it('refuses a wildcard frame source in the header', () => {
    expect(() => checkHeaderPolicy(headersText.replace(
      'frame-src https://www.youtube-nocookie.com', 'frame-src *',
    ))).toThrow();
  });

  it('refuses removal of a protective header', () => {
    expect(() => checkHeaderPolicy(headersText.replace(
      '  X-Frame-Options: DENY\n', '',
    ))).toThrow();
  });

  it('refuses a wildcard in an Astro source list', () => {
    expect(() => checkAstroPolicy(astroText.replace(
      "img-src 'self' data:", "img-src 'self' data: *",
    ))).toThrow();
  });

  it('refuses a new third-party connection, even alongside allowed sources', () => {
    expect(() => checkAstroPolicy(astroText.replace(
      "connect-src 'self' https://cloudflareinsights.com",
      "connect-src 'self' https://cloudflareinsights.com https://elsewhere.example",
    ))).toThrow('Unexpected connect-src origin');
  });

  it('permits one exact Supabase project origin (Task 55), but not two', () => {
    const updated = astroText.replace(
      "connect-src 'self' https://cloudflareinsights.com",
      "connect-src 'self' https://cloudflareinsights.com https://project123.supabase.co",
    );
    expect(() => checkAstroPolicy(updated)).not.toThrow();
    expect(() => checkAstroPolicy(updated.replace(
      'https://project123.supabase.co',
      'https://project123.supabase.co https://other123.supabase.co',
    ))).toThrow('Unexpected connect-src origin');
  });

  it('refuses JavaScript eval while retaining the narrower WebAssembly allowance', () => {
    expect(() => checkAstroPolicy(astroText.replace(
      "\"'wasm-unsafe-eval'\"", "\"'wasm-unsafe-eval'\", \"'unsafe-eval'\"",
    ))).toThrow();
  });

  it('refuses extra origins in the frame policy and duplicate CSP directives', () => {
    expect(() => checkAstroPolicy(astroText.replace(
      'frame-src https://www.youtube-nocookie.com',
      'frame-src https://www.youtube-nocookie.com https://www.youtube.com',
    ))).toThrow();
    expect(() => checkAstroPolicy(astroText.replace(
      "\"object-src 'none'\",",
      "\"object-src 'none'\",\n        \"object-src 'none'\",",
    ))).toThrow('Duplicate CSP directive');
  });
});
