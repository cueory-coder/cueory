import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, readColorTokens } from './contrast';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
const [daytimeCss, eveningCss] = css.split('@media (prefers-color-scheme: dark)');
const [eveningDeviceCss, eveningPickedCss] = eveningCss.split(':root[data-theme="dark"]');
const daytime = readColorTokens(daytimeCss);
const evening = { ...daytime, ...readColorTokens(eveningDeviceCss) };

describe('evening palette copies', () => {
  it('has one copy for Follow device and one for a Dark pick', () => {
    expect(eveningDeviceCss).toContain(':root:not([data-theme="light"])');
    expect(eveningPickedCss).toBeDefined();
  });

  it('keeps both copies identical', () => {
    expect(readColorTokens(eveningPickedCss)).toEqual(readColorTokens(eveningDeviceCss));
  });
});

// Exact brand-guide colors. Tokens may only use these.
const brand = {
  daytime: ['#f9f5ef', '#eadccf', '#d3b7a1', '#8b6f5b', '#3f2e24', '#6b5243'],
  evening: ['#1b1715', '#3a2d24', '#6b5243', '#cbb8a4', '#efe6da'],
};

// [foreground, background, minimum ratio]. 4.5 = WCAG AA text; 3 = borders, focus outlines and buttons.
const pairs: Array<[string, string, number]> = [
  ['ink', 'page', 4.5],
  ['ink', 'surface', 4.5],
  ['ink', 'soft', 4.5],
  ['ink-soft', 'page', 4.5],
  ['ink-soft', 'surface', 4.5],
  ['on-button', 'button', 4.5],
  ['on-button', 'button-hover', 4.5],
  ['control', 'page', 3],
  ['control', 'surface', 3],
  ['focus', 'page', 3],
  ['focus', 'surface', 3],
  ['button', 'page', 3],
  ['button', 'surface', 3],
];

describe.each([
  ['daytime', daytime, brand.daytime],
  ['evening', evening, brand.evening],
] as const)('%s palette', (_name, colors, allowed) => {
  it('uses only exact brand colors', () => {
    for (const [token, hex] of Object.entries(colors)) {
      expect(allowed, `--color-${token} is ${hex}`).toContain(hex.toLowerCase());
    }
  });

  it('defines every color the components use', () => {
    for (const [fg, bg] of pairs) {
      expect(colors[fg], `--color-${fg} is missing`).toBeDefined();
      expect(colors[bg], `--color-${bg} is missing`).toBeDefined();
    }
  });

  it.each(pairs)('%s on %s is readable (at least %s:1)', (fg, bg, min) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe('components', () => {
  // Tailwind "arbitrary values" such as text-[3.5rem] skip the tokens, so they are not allowed.
  const srcDir = new URL('../../src/', import.meta.url);
  const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter((f) => /\.(astro|tsx)$/.test(f));

  it.each(files)('%s uses only token-based classes', (file) => {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    expect(source.match(/[\w:]+-\[[^\]\s]+\]/g) ?? []).toEqual([]);
  });
});
