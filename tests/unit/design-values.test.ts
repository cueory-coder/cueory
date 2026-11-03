import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Finding = { kind: 'color' | 'font' | 'size'; path: string; line: number; text: string };
type Exception = { kind: Finding['kind']; path: string; matches: (text: string) => boolean; reason: string };

const src = new URL('../../src/', import.meta.url);
const files = readdirSync(src, { recursive: true, encoding: 'utf8' })
  .map(file => file.replaceAll('\\', '/'))
  .filter(file => /\.(astro|tsx|ts|css)$/.test(file) && file !== 'styles/tokens.css');

function withoutComments(source: string): string {
  return source.replace(/\/\*[\\s\\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
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
    path: 'styles/global.css',
    matches: text =>
      /@media .*\b(?:40|64)rem\b/.test(text) ||
      /text-decoration-thickness: [12]px/.test(text) ||
      /--scene-fade-(?:top|bottom): 0px/.test(text) ||
      /background-size: 220px 220px/.test(text) ||
      /^(?:border(?:-[^:]+)?|inset|block-size|text-decoration-thickness|max-block-size):/.test(text.trim()) ||
      /env\(safe-area-inset-[^,]+, 0px\)/.test(text),
    reason: 'responsive, safe-area, hairline, texture-tile and underline geometry are CSS primitives',
  },
];

function exceptionFor(finding: Finding): Exception | undefined {
  return exceptions.find(exception => exception.kind === finding.kind && exception.path === finding.path && exception.matches(finding.text));
}

describe('design values', () => {
  it('keeps components on tokens, with documented CSS exceptions', () => {
    const violations: Finding[] = [];

    for (const path of files) {
      const source = withoutComments(readFileSync(new URL(path, src), 'utf8'));
      source.split('\n').forEach((text, index) => {
        const line = index + 1;
        const findings: Finding[] = [];

        if (/(?:^|[=:,\\s])(#[0-9a-fA-F]{3,8})\\b/.test(text) && !text.includes('href="#')) {
          findings.push({ kind: 'color', path, line, text });
        }
        if (/\\b(?:rgb|rgba|hsl|hsla)\\(\\s*(?:\\d|#)/.test(text)) {
          findings.push({ kind: 'color', path, line, text });
        }
        if (/font-family:\\s*["']/.test(text)) {
          findings.push({ kind: 'font', path, line, text });
        }
        if (/(?:^|[\\s:;,(])\\d+(?:\\.\\d+)?(?:px|rem)\\b/.test(text)) {
          findings.push({ kind: 'size', path, line, text });
        }
        if (/\\b[\\w:-]+-\\[[^\\]]*(?:px|rem)[^\\]]*\\]/.test(text)) {
          findings.push({ kind: 'size', path, line, text });
        }

        for (const finding of findings) {
          const exception = exceptionFor(finding);
          if (!exception) violations.push(finding);
          else expect(exception.reason.length, `${finding.path}:${finding.line}`).toBeGreaterThan(0);
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
