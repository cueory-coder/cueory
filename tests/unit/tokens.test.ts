import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex, readColorTokens } from './contrast';

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

/*
  Marketing pages (D-41): text sits on draped silk, an embossed logo and frosted panels, so the checks above (flat
  token pairs) aren't enough. These compose the worst case for each palette: the darkest Daytime point (Linen, both fold
  layers, the grain at its strongest) and the lightest Evening point (Walnut plus grain), then require WCAG AA.
*/
describe('marketing background (D-41)', () => {
  const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
  const mix = (top: string, alpha: number, bottom: string) => {
    const [t, b] = [parseHex(top), parseHex(bottom)];
    return toHex(t.map((c, i) => alpha * c + (1 - alpha) * b[i]!));
  };
  const number = (chunk: string, name: string) => Number(new RegExp(`--${name}:\\s*([\\d.]+)`).exec(chunk)![1]);
  const rgb = (chunk: string, name: string) => toHex(new RegExp(`--${name}:\\s*(\\d+) (\\d+) (\\d+)`).exec(chunk)!.slice(1).map(Number));

  /** The grain tile's color and strongest opacity, from its feColorMatrix. */
  const grain = (file: string) => {
    const svg = readFileSync(new URL(`../../public/textures/${file}`, import.meta.url), 'utf8');
    const v = /values="([^"]+)"/.exec(svg)![1]!.trim().split(/\s+/).map(Number);
    return { color: toHex([v[4]! * 255, v[9]! * 255, v[14]! * 255]), alpha: v[18]!, bytes: Buffer.byteLength(svg) };
  };

  const day = {
    fold: number(daytimeCss, 'silk-fold-alpha'),
    foldColor: rgb(daytimeCss, 'silk-fold-rgb'),
    veil: rgb(daytimeCss, 'veil-rgb'),
    veilAlpha: number(daytimeCss, 'veil-alpha'),
    grain: grain('grain-day.svg'),
  };
  const eve = {
    fold: number(eveningDeviceCss, 'silk-fold-alpha'),
    foldColor: rgb(eveningDeviceCss, 'silk-fold-rgb'),
    veil: rgb(eveningDeviceCss, 'veil-rgb'),
    veilAlpha: number(eveningDeviceCss, 'veil-alpha'),
    grain: grain('grain-evening.svg'),
  };

  it('uses only brand colors for panels and grain, the same in both Evening copies', () => {
    expect(brand.daytime).toContain(day.veil);
    expect(brand.evening).toContain(eve.veil);
    expect(brand.daytime).toContain(day.foldColor);
    expect(brand.evening).toContain(eve.foldColor);
    expect(day.grain.color).toBe(daytime.ink);
    expect(eve.grain.color).toBe(evening.ink);
    expect(rgb(eveningPickedCss, 'veil-rgb')).toBe(eve.veil);
    expect(number(eveningPickedCss, 'silk-fold-alpha')).toBe(eve.fold);
    expect(rgb(eveningPickedCss, 'silk-fold-rgb')).toBe(eve.foldColor);
  });

  it('keeps the texture tiny (under 30 KB together)', () => {
    expect(day.grain.bytes + eve.grain.bytes).toBeLessThan(30 * 1024);
  });

  const darkestDay = mix(
    day.grain.color,
    day.grain.alpha,
    mix(day.foldColor, day.fold, mix(day.foldColor, day.fold / 2, daytime['silk-shade']!)),
  );
  const lightestEvening = mix(eve.grain.color, eve.grain.alpha, evening['silk-sheen']!);
  const surfaces: Array<[string, Record<string, string>, string]> = [
    ['Daytime silk at its darkest', daytime, darkestDay],
    ['Daytime embossed logo', daytime, daytime.emboss!],
    ['Daytime frosted panel', daytime, mix(day.veil, day.veilAlpha, darkestDay)],
    ['Evening silk at its lightest', evening, lightestEvening],
    ['Evening embossed logo', evening, mix(eve.grain.color, eve.grain.alpha, evening.emboss!)],
    ['Evening frosted panel', evening, mix(eve.veil, eve.veilAlpha, lightestEvening)],
  ];

  it.each(surfaces)('%s keeps text readable (AA) and buttons visible', (_name, colors, background) => {
    expect(contrastRatio(colors.ink!, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors['ink-soft']!, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.button!, background)).toBeGreaterThanOrEqual(3);
  });
});

/*
  ☰ side panel, account menu and the glassy hero button (D-46). They are see-through glass, so text is checked on the
  glass mixed over the worst page color behind it: the lightest point for light text, the darkest for dark text.
*/
describe('glass button and side panel (D-46)', () => {
  const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
  const mix = (top: string, alpha: number, bottom: string) => {
    const [t, b] = [parseHex(top), parseHex(bottom)];
    return toHex(t.map((c, i) => alpha * c + (1 - alpha) * b[i]!));
  };
  const number = (chunk: string, name: string) => Number(new RegExp(`--${name}:\\s*([\\d.]+)`).exec(chunk)![1]);
  const rgb = (chunk: string, name: string) =>
    toHex(new RegExp(`--${name}:\\s*(\\d+) (\\d+) (\\d+)`).exec(chunk)!.slice(1).map(Number));
  const glass = (chunk: string) => ({
    fill: rgb(chunk, 'glass-rgb'),
    alpha: number(chunk, 'glass-alpha'),
    hover: rgb(chunk, 'glass-hover-rgb'),
    hoverAlpha: number(chunk, 'glass-hover-alpha'),
    rim: rgb(chunk, 'glass-rim-rgb'),
    panel: rgb(chunk, 'panel-rgb'),
    panelAlpha: number(chunk, 'panel-alpha'),
  });
  const day = glass(daytimeCss);
  const eve = glass(eveningDeviceCss);

  it('uses only brand colors, the same in both Evening copies', () => {
    for (const hex of [day.fill, day.hover, day.rim, day.panel]) expect(brand.daytime).toContain(hex);
    for (const hex of [eve.fill, eve.hover, eve.rim, eve.panel]) expect(brand.evening).toContain(hex);
    expect(glass(eveningPickedCss)).toEqual(eve);
  });

  // Every page color the glass can sit on: plain pages, silk, frosted panels.
  const dayBackgrounds = [daytime.page!, daytime['silk-base']!, daytime['silk-shade']!, daytime.surface!];
  const eveBackgrounds = [evening.page!, evening['silk-base']!, evening['silk-sheen']!, evening.surface!];
  const cases: Array<[string, Record<string, string>, ReturnType<typeof glass>, string[]]> = [
    ['Daytime', daytime, day, dayBackgrounds],
    ['Evening', evening, eve, eveBackgrounds],
  ];

  it.each(cases)('%s glass button text is readable (AA) on every background, also on hover', (_n, colors, g, bgs) => {
    for (const bg of bgs) {
      expect(contrastRatio(colors['on-button']!, mix(g.fill, g.alpha, bg))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors['on-button']!, mix(g.hover, g.hoverAlpha, bg))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(cases)('%s side panel text, notes and focus outline are readable on every background', (_n, colors, g, bgs) => {
    for (const bg of bgs) {
      const panel = mix(g.panel, g.panelAlpha, bg);
      expect(contrastRatio(colors['panel-ink']!, panel)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors['panel-ink-soft']!, panel)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('rows in the dark panels never lighten on hover, so their notes keep the contrast checked above', () => {
    // Codex review of #24: a light hover layer dropped the Taupe "coming soon" note below AA.
    const styles = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
    for (const selector of ['.account-link:hover', '.menu-link:hover', '.menu-small-link:hover']) {
      const rule = new RegExp(`${selector.replace(/[.:]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(styles);
      expect(rule, `${selector} rule`).not.toBeNull();
      expect(rule![1]).not.toMatch(/background/);
    }
  });

  it('corner buttons keep their icon visible (3:1) on the frosted circle', () => {
    for (const [colors, chunk, bgs] of [
      [daytime, daytimeCss, dayBackgrounds],
      [evening, eveningDeviceCss, eveBackgrounds],
    ] as const) {
      for (const bg of bgs) {
        const circle = mix(rgb(chunk, 'veil-rgb'), number(chunk, 'veil-alpha'), bg);
        expect(contrastRatio(colors.ink!, circle)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
