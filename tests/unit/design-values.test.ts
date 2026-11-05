import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Finding = { kind: 'color' | 'font' | 'size'; path: string; line: number; text: string };
type Exception = { kind: Finding['kind']; path: string; matches: (text: string) => boolean; reason: string };

const src = new URL('../../src/', import.meta.url);
const files = readdirSync(src, { recursive: true, encoding: 'utf8' })
  .map(file => file.replaceAll('\\', '/'))
  .filter(file => /\.(astro|tsx|ts|css)$/.test(file) && file !== 'styles/tokens.css');

function withoutComments(source: string): string {
  // Mask comments with spaces rather than removing them so reported line numbers stay correct.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\r\n]/g, ' '))
    .replace(/(^|[ \t])\/\/[^\r\n]*/gm, comment => comment.replace(/[^\r\n]/g, ' '));
}

const exceptions: Exception[] = [
  {
    kind: 'color',
    path: 'layouts/Layout.astro',
    matches: text => text.includes('meta name="theme-color"'),
    reason: 'browser chrome metadata cannot consume a CSS custom property',
  },
  {
    kind: 'font',
    path: 'styles/global.css',
    matches: text => /font-family:\s*"(?:Lato|Bodoni Moda)"/.test(text),
    reason: '@font-face declarations require the actual family name',
  },
  {
    kind: 'size',
    path: 'components/SiteHeader.astro',
    matches: text => /@media .*40rem/.test(text),
    reason: 'the header breakpoint is a media-query boundary',
  },
  {
    kind: 'size',
    path: 'scripts/reveal.ts',
    matches: text => text.includes("rootMargin: '0px 0px -8% 0px'"),
    reason: 'IntersectionObserver margins are viewport geometry, not design tokens',
  },
  {
    kind: 'size',
    path: 'islands/LabelItBoard.tsx',
    matches: text => text.includes('clamp(0px, calc('),
    reason: 'label boxes are positioned from submitted image percentages at runtime',
  },
  {
    kind: 'size',
    path: 'islands/AnatomyLab.tsx',
    matches: text => /^const narrow = typeof window\.matchMedia === 'function' && window\.matchMedia\('\(max-width: 767px\)'\)\.matches;$/.test(text.trim()),
    reason: 'the phone-only anatomy bulk-download confirmation uses a specific viewport breakpoint, not a design size',
  },
  {
    kind: 'size',
    path: 'styles/pillo.css',
    matches: text => /^@media \(width (?:<|>=) 40rem\) \{$/.test(text.trim()),
    reason: 'the Pillo board changes layout at a responsive media-query breakpoint',
  },
  {
    kind: 'size',
    path: 'styles/global.css',
    matches: text =>
      /@media .*\b(?:40|48|64)rem\b/.test(text) ||
      /text-decoration-thickness: [12]px/.test(text) ||
      /--scene-fade-(?:top|bottom): 0px/.test(text) ||
      /background-size: 220px 220px/.test(text) ||
      /^(?:border(?:-[^:]+)?|block-size|text-decoration-thickness|max-block-size):/.test(text.trim()) ||
      /^inset\b/.test(text.trim()) ||
      /env\(safe-area-inset-[^,]+, 0px\)/.test(text) ||
      /(?:backdrop-filter: blur\([12]px\)|@supports .*blur\(1px\)|transform: translate(?:X|Y)?\([^)]*px)/.test(text),
    reason: 'responsive, safe-area, hairline, texture-tile, blur and animation geometry are CSS primitives',
  },
];

function exceptionFor(finding: Finding): Exception | undefined {
  return exceptions.find(exception => exception.kind === finding.kind && exception.path === finding.path && exception.matches(finding.text.trim()));
}

function designValueKinds(text: string): Finding['kind'][] {
  const kinds = new Set<Finding['kind']>();
  const withoutAnchorHrefs = text.replace(/\bhref\s*=\s*(?:"#[^"]*"|'#[^']*')/gi, '');
  if (/(?:^|[=:,\s])#[0-9a-fA-F]{3,8}\b/.test(withoutAnchorHrefs)) kinds.add('color');
  if (/\b(?:rgb|rgba|hsl|hsla)\(\s*(?:\d|#)/.test(text)) kinds.add('color');
  if (/\bfont-family\s*:\s*(?!var\s*\(|inherit\b|initial\b|unset\b|revert\b)(?:["']|[A-Za-z_][\w-]*)/i.test(text)) kinds.add('font');
  if (/(?:^|[\s:;,(])\d+(?:\.\d+)?(?:px|rem)\b/.test(text)) kinds.add('size');
  if (/\b[\w:-]+-\[[^\]]*(?:px|rem)[^\]]*\]/.test(text)) kinds.add('size');
  return [...kinds];
}

describe('design values', () => {
  it('keeps components on tokens, with documented CSS exceptions', () => {
    const violations: Finding[] = [];

    for (const path of files) {
      const source = withoutComments(readFileSync(new URL(path, src), 'utf8'));
      source.split('\n').forEach((text, index) => {
        const line = index + 1;
        const findings: Finding[] = designValueKinds(text).map(kind => ({ kind, path, line, text }));

        for (const finding of findings) {
          const exception = exceptionFor(finding);
          if (!exception) violations.push(finding);
          else expect(exception.reason.length, `${finding.path}:${finding.line}`).toBeGreaterThan(0);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('allows only the documented 40rem Pillo breakpoints', () => {
    const finding = (text: string): Finding => ({ kind: 'size', path: 'styles/pillo.css', line: 1, text });
    expect(exceptionFor(finding('  @media (width < 40rem) {'))?.reason).toBeTruthy();
    expect(exceptionFor(finding('  @media (width >= 40rem) {'))?.reason).toBeTruthy();
    expect(exceptionFor(finding('  @media (width < 41rem) {'))).toBeUndefined();
    expect(exceptionFor(finding('  padding: 40rem;'))).toBeUndefined();
  });

  it('limits the anatomy phone breakpoint exception to its exact viewport condition', () => {
    const finding = (text: string): Finding => ({ kind: 'size', path: 'islands/AnatomyLab.tsx', line: 1, text });
    const breakpoint = "const narrow = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;";
    expect(exceptionFor(finding(breakpoint))?.reason).toBeTruthy();
    expect(exceptionFor(finding(breakpoint.replace('767px', '768px')))).toBeUndefined();
    expect(exceptionFor(finding('padding: 767px;'))).toBeUndefined();
  });

  it('detects real raw design values and accepts token references', () => {
    expect(designValueKinds('color: #fff')).toContain('color');
    expect(designValueKinds('<a href="#abc">section</a>')).not.toContain('color');
    expect(designValueKinds('<a href="#abc" style="color: #fff">section</a>')).toContain('color');
    expect(designValueKinds("<a href='#abc' style='background: #123'>section</a>")).toContain('color');
    expect(designValueKinds('background: rgba(2, 3, 4, 0.5)')).toContain('color');
    expect(designValueKinds('font-family: "Arial"')).toContain('font');
    expect(designValueKinds('font-family: Arial, serif')).toContain('font');
    expect(designValueKinds('font-family: system-ui')).toContain('font');
    expect(designValueKinds('font-family: var(--font-body)')).not.toContain('font');
    expect(designValueKinds('font-family: inherit')).not.toContain('font');
    expect(designValueKinds('padding: 16px')).toContain('size');
    expect(designValueKinds('class="w-[24px]"')).toContain('size');
    expect(designValueKinds('color: var(--ink)')).toEqual([]);
  });

  it('keeps source line numbers when masking block and line comments', () => {
    const source = '/* first comment\nsecond comment */\npadding: 16px;\n// comment\ncolor: #fff';
    const masked = withoutComments(source).split('\n');
    expect(masked).toHaveLength(5);
    expect(masked[0]?.trim()).toBe('');
    expect(masked[1]?.trim()).toBe('');
    expect(masked[2]).toBe('padding: 16px;');
    expect(masked[3]?.trim()).toBe('');
    expect(designValueKinds(masked[4] ?? '')).toContain('color');
  });

});
