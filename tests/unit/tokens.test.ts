import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, readColorTokens } from './contrast';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
const c = readColorTokens(css);

// [foreground, background, minimum ratio]. 4.5 = WCAG AA body text; 3 = focus outlines.
const pairs: Array<[string, string, number]> = [
  ['ink', 'page', 4.5],
  ['ink', 'study', 4.5],
  ['ink', 'surface', 4.5],
  ['ink', 'sage-soft', 4.5],
  ['ink-soft', 'page', 4.5],
  ['ink-soft', 'study', 4.5],
  ['ink-soft', 'surface', 4.5],
  ['sage', 'page', 4.5],
  ['sage', 'surface', 4.5],
  ['accent', 'page', 4.5],
  ['accent', 'study', 4.5],
  ['accent-strong', 'page', 4.5],
  ['on-accent', 'accent', 4.5],
  ['on-accent', 'accent-strong', 4.5],
  ['correct', 'study', 4.5],
  ['incorrect', 'study', 4.5],
  ['focus', 'page', 3],
  ['focus', 'study', 3],
];

describe('design tokens', () => {
  it('defines every color the components use', () => {
    for (const [fg, bg] of pairs) {
      expect(c[fg], `--color-${fg} is missing`).toBeDefined();
      expect(c[bg], `--color-${bg} is missing`).toBeDefined();
    }
  });

  it.each(pairs)('%s on %s is readable (at least %s:1)', (fg, bg, min) => {
    expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(min);
  });
});
