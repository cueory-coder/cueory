import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { studyModes } from '../../src/config/modes';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

function builtPath(href: string): string {
  const pathname = new URL(href, 'https://cueory.test').pathname;
  return join(dist, pathname === '/' ? 'index.html' : `${pathname.slice(1)}.html`);
}

describe.skipIf(!existsSync(dist))('study mode destinations', () => {
  it('points every open mode at a built route', () => {
    for (const mode of studyModes) {
      if (!mode.link) continue;
      expect(mode.link.href, mode.id).toMatch(/^\/[a-z0-9][a-z0-9/?-]*$/);
      expect(existsSync(builtPath(mode.link.href)), `${mode.id}: ${mode.link.href}`).toBe(true);
    }
  });
});
