/** Body font and line spacing (Christian, 2026-11-01): Lato for body and interface text, line spacing at least 1.5. */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8');
const tokens = read('src/styles/tokens.css');
const global = read('src/styles/global.css');

/** Text styles set in the serif display font (marketing headlines), kept tight on purpose. */
const DISPLAY = new Set(['hero', 'display', 'display-lg', 'display-fit', 'title', 'title-lg']);

describe('typography', () => {
  it('uses Lato for body and interface text', () => {
    expect(tokens).toMatch(/--font-body: "Lato", /);
    expect(tokens).not.toContain('Inter Variable');
    expect(global).not.toContain('@fontsource-variable/inter');
  });

  it('self-hosts the four Lato files it declares, with the license', () => {
    for (const file of ['400-normal', '400-italic', '700-normal', '700-italic']) {
      expect(global).toContain(`/fonts/lato-latin-${file}.woff2`);
      expect(existsSync(fileURLToPath(new URL(`../../public/fonts/lato-latin-${file}.woff2`, import.meta.url)))).toBe(true);
    }
    expect(read('public/fonts/lato-OFL.txt')).toContain('SIL Open Font License');
  });

  it('gives every non-display text style a line height of at least 1.5', () => {
    const heights = [...tokens.matchAll(/--text-([a-z0-9-]+)--line-height: ([0-9.]+);/g)];
    expect(heights.length).toBeGreaterThan(5);
    for (const [, name, value] of heights) {
      if (DISPLAY.has(name)) continue;
      expect(Number(value), name).toBeGreaterThanOrEqual(1.5);
    }
  });
});
