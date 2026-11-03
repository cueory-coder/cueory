import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPlainScript } from '../../src/scripts/swbuild';

const source = readFileSync(new URL('../../src/scripts/swoff.ts', import.meta.url), 'utf8');
const plain = buildPlainScript([
  readFileSync(new URL('../../src/scripts/offlineplan.ts', import.meta.url), 'utf8'),
  source,
]);

describe('switched-off service worker', () => {
  it('keeps only install and activate lifecycle handlers', () => {
    expect(plain).toContain("addEventListener('install'");
    expect(plain).toContain("addEventListener('activate'");
    expect(plain).not.toMatch(/addEventListener\(['"]fetch['"]/);
  });

  it('removes its own cache family and unregisters after activation', () => {
    expect(plain).toContain('startsWith(OURS)');
    expect(plain).toContain('registration.unregister()');
    expect(plain).toContain('skipWaiting()');
  });
});
