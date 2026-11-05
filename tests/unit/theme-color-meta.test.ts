import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The two `theme-color` metas in Layout.astro are the one place a color is written outside tokens.css (a meta tag
// cannot read a CSS variable). This test pins them to the page-background token of each palette, so a palette change
// in tokens.css fails the build until the metas follow (CLAUDE.md, "Never use a color ... directly in a component").
const layout = readFileSync(new URL('../../src/layouts/Layout.astro', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

function pageColor(block: string): string {
  const m = /--color-page:\s*(#[0-9a-fA-F]{6})/.exec(block);
  if (!m) throw new Error('no --color-page in block');
  return m[1].toLowerCase();
}

const lightBlock = tokens.slice(0, tokens.indexOf('@media (prefers-color-scheme: dark)'));
const darkBlock = tokens.slice(tokens.indexOf('@media (prefers-color-scheme: dark)'));

describe('theme-color metas follow the page-background tokens', () => {
  it('light meta matches the Daytime page color', () => {
    const m = /<meta name="theme-color" content="(#[0-9a-fA-F]{6})" media="\(prefers-color-scheme: light\)"/.exec(layout);
    expect(m, 'light theme-color meta').not.toBeNull();
    expect(m![1].toLowerCase()).toBe(pageColor(lightBlock));
  });
  it('dark meta matches the Evening page color', () => {
    const m = /<meta name="theme-color" content="(#[0-9a-fA-F]{6})" media="\(prefers-color-scheme: dark\)"/.exec(layout);
    expect(m, 'dark theme-color meta').not.toBeNull();
    expect(m![1].toLowerCase()).toBe(pageColor(darkBlock));
  });
});
