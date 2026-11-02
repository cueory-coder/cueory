import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tokensUrl = new URL('../../src/styles/tokens.css', import.meta.url);
const globalUrl = new URL('../../src/styles/global.css', import.meta.url);
const tokens = readFileSync(tokensUrl, 'utf8');
const global = readFileSync(globalUrl, 'utf8');

// ---------- tokens.css ----------

describe('tokens.css motion tokens', () => {
  const motionTokens = [
    '--ease-soft',
    '--ease-emphasis',
    '--duration-fast',
    '--duration-base',
    '--duration-slow',
    '--shadow-card',
    '--shadow-card-hover',
  ] as const;

  it.each(motionTokens)('%s is defined in @theme', (token) => {
    // Find the @theme block and confirm the token is inside it.
    const themeBlock = tokens.match(/@theme\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s)?.[1] ?? '';
    expect(themeBlock).toContain(token);
  });

  it('Evening palette overrides --shadow-card and --shadow-card-hover', () => {
    // Both dark blocks (media query and data-theme) should override the shadows.
    const darkMediaBlock =
      tokens.match(/@media\s*\(prefers-color-scheme:\s*dark\)[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const darkThemeBlock = tokens.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(darkMediaBlock).toContain('--shadow-card');
    expect(darkMediaBlock).toContain('--shadow-card-hover');
    expect(darkThemeBlock).toContain('--shadow-card');
    expect(darkThemeBlock).toContain('--shadow-card-hover');
  });

  it('no raw hex colors are added inside the @theme motion/depth additions', () => {
    // The motion/depth tokens must use only var() references, never raw hex.
    // We check just the motion+depth portion of @theme (between the "-- Motion"
    // comment and the closing brace that ends the block).
    const themeContent = tokens.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const motionIdx = themeContent.indexOf('-- Motion');
    const motionSection = motionIdx >= 0 ? themeContent.slice(motionIdx) : '';
    const hexMatches = motionSection.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexMatches).toEqual([]);
  });
});

// ---------- global.css ----------

describe('global.css utility classes', () => {
  const utilityClasses = [
    '.lift',
    '.press',
    '.flip',
    '.flip-inner',
    '.flip-face',
    '.flip-back',
    '.is-flipped',
    '.progress-track',
    '.progress-fill',
    '.skeleton',
    '.enter',
    '.segmented',
    '.segmented-option',
  ] as const;

  it.each(utilityClasses)('%s is defined', (cls) => {
    expect(global).toContain(cls);
  });

  const animatedClasses = [
    '.lift',
    '.press',
    '.flip-inner',
    '.flip-face',
    '.flip-back',
    '.progress-fill',
    '.skeleton',
    '.enter',
    '.segmented-option',
  ] as const;

  it.each(animatedClasses)('%s has a prefers-reduced-motion: reduce rule', (cls) => {
    // For each occurrence of "prefers-reduced-motion: reduce" in global.css, extract the
    // 3000 characters that follow it and check whether the class name appears. Nested braces
    // make a precise block extractor fragile, so a window-based search is more robust.
    const marker = 'prefers-reduced-motion: reduce';
    let pos = 0;
    let found = false;
    while (!found) {
      const idx = global.indexOf(marker, pos);
      if (idx === -1) break;
      const window = global.slice(idx, idx + 3000);
      if (window.includes(cls)) found = true;
      pos = idx + 1;
    }
    expect(found, `${cls} must appear in at least one reduced-motion block`).toBe(true);
  });

  it('@view-transition is defined', () => {
    expect(global).toContain('@view-transition');
    expect(global).toContain('navigation: auto');
  });

  it('view transitions are off under prefers-reduced-motion: reduce', () => {
    const reducedBlocks = [
      ...global.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\s*\}/g),
    ].map((m) => m[1]);
    const hasViewTransitionReset = reducedBlocks.some(
      (block) =>
        block.includes('::view-transition-old') ||
        block.includes('::view-transition-group') ||
        block.includes('animation: none'),
    );
    expect(hasViewTransitionReset).toBe(true);
  });

  it('no raw hex colors were added to the utility section', () => {
    // The utility section starts after the last @keyframes block.
    const utilitySection = global.slice(global.lastIndexOf('@keyframes ill-flag'));
    const hexMatches = utilitySection.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexMatches).toEqual([]);
  });
});
