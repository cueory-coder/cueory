import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex, readColorTokens } from './contrast';

const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
const [daytimeCss, eveningCss] = css.split('@media (prefers-color-scheme: dark)');
const [eveningDeviceCss, eveningPickedCss] = eveningCss.split(':root[data-theme="dark"]');
const daytime = readColorTokens(daytimeCss);
const evening = { ...daytime, ...readColorTokens(eveningDeviceCss) };

describe('picture export tokens (Task 178)', () => {
  it('defines every --export-* size the exporter reads', () => {
    const source = readFileSync(new URL('../../src/islands/anatomyscene.ts', import.meta.url), 'utf8');
    const names = [...source.matchAll(/'(--export-[a-z-]+)'/g)].map((m) => m[1]!);
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) expect(css).toMatch(new RegExp(`${name}:\\s*[0-9.]+;`));
  });
});

describe('evening palette copies', () => {
  it('has one copy for Follow device and one for a Dark pick', () => {
    expect(eveningDeviceCss).toContain(':root:not([data-theme="light"])');
    expect(eveningPickedCss).toBeDefined();
  });

  it('keeps both copies identical', () => {
    expect(readColorTokens(eveningPickedCss)).toEqual(readColorTokens(eveningDeviceCss));
  });
});

// Exact brand-guide v1.0 colors (§4.1 and §4.2; D-55). Tokens may only use these. The older #3f2e24, #1b1715 and
// #efe6da are retired (§4.3).
const brand = {
  daytime: ['#f9f5ef', '#eadccf', '#d3b7a1', '#8b6f5b', '#3e2c23', '#6b5243'],
  evening: ['#1c1917', '#3a2d24', '#6b5243', '#cbb8a4', '#f9f5ef'],
};

// Palette-independent type, spacing and layout tokens live in the shared @theme block. Color tokens are
// palette-dependent and must be declared in both the Daytime block and the Evening override.
describe('palette token parity', () => {
  it('gives every Daytime color token an Evening value', () => {
    const daytimeColors = Object.keys(daytime);
    const eveningColors = Object.keys(readColorTokens(eveningDeviceCss));
    expect(eveningColors).toEqual(expect.arrayContaining(daytimeColors));
  });
});

describe('retired colors (brand guide v1.0 §4.3)', () => {
  it('appear nowhere in the tokens', () => {
    expect(css.toLowerCase()).not.toMatch(/#3f2e24|#1b1715|#efe6da|63 46 36|27 23 21|239 230 218/);
  });
});

// [foreground, background, minimum ratio]. 4.5 = WCAG AA text; 3 = borders, focus outlines and buttons.
const pairs: Array<[string, string, number]> = [
  ['ink', 'page', 4.5],
  ['ink', 'surface', 4.5],
  ['ink', 'line', 4.5], // Coming-soon course status badges, in Daytime and Evening.
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
  // The promo panel's light pill button (D-59), and its hover.
  ['on-panel-button', 'panel-ink', 4.5],
  ['on-panel-button', 'panel-ink-soft', 4.5],
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
  Marketing pages (D-41): text sits on draped silk and frosted panels, so the checks above (flat
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
    ['Daytime frosted panel', daytime, mix(day.veil, day.veilAlpha, darkestDay)],
    ['Evening silk at its lightest', evening, lightestEvening],
    ['Evening frosted panel', evening, mix(eve.veil, eve.veilAlpha, lightestEvening)],
  ];

  it.each(surfaces)('%s keeps text readable (AA) and buttons visible', (_name, colors, background) => {
    expect(contrastRatio(colors.ink!, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors['ink-soft']!, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.button!, background)).toBeGreaterThanOrEqual(3);
  });

  /*
    "ways to study" merry-go-round (D-50, D-60): its cards are the frosted panels checked above, so their words are
    covered as long as nothing fades a card. It moves, scales and turns the cards, and gives side cards the second ink,
    but never masks, fades or blurs the row or a card. (The illustrations inside the cards are decoration and may use
    opacity.)
  */
  it('never masks, fades or blurs the carousel row or its cards', () => {
    const globalCss = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
    const rules = [...globalCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(([, selector, body]) => [selector!.replace(/\/\*[\s\S]*?\*\//g, '').trim(), body!] as const)
      .filter(([selector]) => /\.(modes-track|mode-card)\b/.test(selector) && !/\.ill[\w-]*\s*$/.test(selector));
    expect(rules.length).toBeGreaterThanOrEqual(4);
    for (const [selector, body] of rules) {
      expect(body, selector).not.toMatch(/(^|[\s;{])(-webkit-)?(mask[\w-]*|opacity|filter)\s*:/);
    }
  });

  /*
    Silk scenes down the home page (D-53): each is the hero's cloth with the folds at another angle and the light from
    another side, on Ivory or the tint (Linen; Evening: Walnut). The tint is a color the checks above already use for
    the worst points (Linen in the darkest Daytime point, Walnut in the lightest Evening one), and a scene can only
    change angles, light and base, so every scene stays within the contrast checked above.
  */
  it('tints the silk scenes only with colors the worst-case checks already cover', () => {
    expect([daytime['silk-base'], daytime['silk-shade']]).toContain(daytime['silk-tint']);
    expect([evening['silk-base'], evening['silk-sheen']]).toContain(evening['silk-tint']);
    expect(readColorTokens(eveningPickedCss)['silk-tint']).toBe(evening['silk-tint']);
  });

  it('lets a silk scene change only its angles, light, base and fades', () => {
    const globalCss = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
    const scenes = [...globalCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(([, selector, body]) => [selector!.replace(/\/\*[\s\S]*?\*\//g, '').trim(), body!] as const)
      .filter(([selector]) => /^\.scene-[\w-]+$/.test(selector));
    expect(scenes.length).toBeGreaterThanOrEqual(3);
    for (const [selector, body] of scenes) {
      const declarations = body.split(';').map((d) => d.trim()).filter(Boolean);
      for (const declaration of declarations) {
        expect(declaration, selector).toMatch(/^--scene-(light|angle|cross|fade-top|fade-bottom|base):/);
        if (declaration.startsWith('--scene-base')) expect(declaration, selector).toMatch(/var\(--color-silk-(base|tint)\)$/);
      }
    }
  });

  // The study-mode preview (D-51) is drawn in the frosted panels' color but fully opaque, over a darkened page.
  it.each([
    ['Daytime', daytime, day.veil],
    ['Evening', evening, eve.veil],
  ] as const)('%s study-mode preview panel keeps its text readable', (_name, colors, panel) => {
    expect(contrastRatio(colors.ink!, panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors['ink-soft']!, panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.control!, panel)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(colors.button!, panel)).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ['Daytime', daytime, darkestDay],
    ['Evening', evening, lightestEvening],
  ] as const)('%s carousel chips stay readable on the silk, with a visible outline', (_name, colors, silk) => {
    expect(contrastRatio(colors.ink!, silk)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.control!, silk)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(colors['on-button']!, colors.button!)).toBeGreaterThanOrEqual(4.5);
  });
});

/*
  ☰ side panel, account menu and the glassy hero button (D-46). They are see-through glass, so text is checked on the
  glass mixed over the worst page color behind it: the lightest point for light text, the darkest for dark text.
*/
describe('home page polish (D-62)', () => {
  it('gives frosted panels a 16 px radius and one soft shadow, and the glassy button a smaller one', () => {
    expect(daytimeCss).toMatch(/--radius-xl:\s*1rem;/);
    const shadow = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(daytimeCss)![1]!;
    // One layer: no comma outside the color's own parentheses.
    for (const name of ['shadow-soft', 'shadow-button']) expect(shadow(name).replace(/\([^)]*\)/g, '')).not.toContain(',');
    const blur = (value: string) => Number(/\s(\d+)px\s+rgb/.exec(value)![1]);
    expect(blur(shadow('shadow-button'))).toBeLessThan(blur(shadow('shadow-soft')));
  });

  it('lets a section rise between 8 and 12 px as it fades in', () => {
    const rise = Number(/--rise-reveal:\s*([\d.]+)rem;/.exec(daytimeCss)![1]) * 16;
    expect(rise).toBeGreaterThanOrEqual(8);
    expect(rise).toBeLessThanOrEqual(12);
  });
});

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
      const rule = new RegExp(`${selector.replace(/[\\.:]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(styles);
      expect(rule, `${selector} rule`).not.toBeNull();
      expect(rule![1]).not.toMatch(/background/);
    }
  });

  /*
    The promo panel (D-59) floats over the whole page, so anything can be behind it, not just page colors: its text is
    checked on the panel mixed over the lightest color of each palette (Ivory; Evening Ivory).
  */
  it.each([
    ['Daytime', daytime, day, '#f9f5ef'],
    ['Evening', evening, eve, '#f9f5ef'],
  ] as const)('%s promo panel keeps its text, button and focus outline readable over anything', (_n, colors, g, lightest) => {
    const panel = mix(g.panel, g.panelAlpha, lightest);
    expect(contrastRatio(colors['panel-ink']!, panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors['panel-ink-soft']!, panel)).toBeGreaterThanOrEqual(4.5);
    // The light pill and the focus outline (both panel ink) stand out from the panel.
    expect(contrastRatio(colors['panel-ink']!, panel)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(colors['on-panel-button']!, colors['panel-ink']!)).toBeGreaterThanOrEqual(4.5);
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
