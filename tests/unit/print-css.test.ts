import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/styles/print.css'), 'utf8');
const lessonStart = css.indexOf('/* W09 lesson print rules:');
const lessonEnd = css.indexOf('/* Keep printed lessons focused', lessonStart);
const lessonCss = css.slice(lessonStart, lessonEnd);

describe('W09 lesson print styles', () => {
  it('places every lesson rule inside print media and scopes it to a lesson reader', () => {
    expect(lessonStart).toBeGreaterThan(0);
    expect(lessonEnd).toBeGreaterThan(lessonStart);
    expect(lessonCss).toMatch(/@media print\s*\{/);

    // Match the declarations one nesting level inside @media print.
    const rules = [...lessonCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    expect(rules.length).toBeGreaterThanOrEqual(6);
    for (const [, selector] of rules) {
      expect(selector).toContain('body:has(main [data-testid="study-reader"])');
    }
  });

  it('prints black on white without raw palette values or unapproved sizes', () => {
    expect(lessonCss).toContain('color: black !important;');
    expect(lessonCss).toContain('background-color: white !important;');
    expect(lessonCss).toContain('background-image: none !important;');
    expect(lessonCss).not.toMatch(/#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(|\b\d+(?:\.\d+)?(?:px|rem|em)\b/i);

    const colors = [...lessonCss.matchAll(/(?:background-color|color)\s*:\s*([^;]+);/g)].map((match) => match[1]!.trim());
    expect(colors).toHaveLength(2);
    for (const value of colors) {
      expect(value).toMatch(/^(?:black|white|var\(--[\w-]+\))\s*!important$/);
    }
  });

  it('omits lesson interactions and video covers but leaves the printed reader intact', () => {
    expect(lessonCss).toContain('section[aria-labelledby="study-modes-heading"]');
    expect(lessonCss).toContain('section[aria-label="lesson video"]');
    expect(lessonCss).toContain(':is(button, [role="button"], [role="tab"], input, select, textarea)');
    expect(lessonCss).toContain('display: none !important;');
    expect(lessonCss).not.toMatch(/\[data-testid="print-lesson-reader"\][^{}]*\{\s*display:\s*none/);
  });

  it('preserves credits and prevents clipping or page breaks inside visual blocks', () => {
    expect(lessonCss).toContain(':is(figure, [data-visual], [data-callout-kind])');
    expect(lessonCss).toContain('break-inside: avoid;');
    expect(lessonCss).toContain('page-break-inside: avoid;');
    expect(lessonCss).toContain('[data-visual] [data-step]');
    expect(lessonCss).toContain('overflow: visible !important;');
    expect(lessonCss).toContain(':is(figcaption, [data-visual-credits])');
    expect(lessonCss).toContain('max-inline-size: 100% !important;');
  });

  it('adds printed destinations to outside web links without changing relative lesson links', () => {
    expect(lessonCss).toContain('a[href^="https://"]');
    expect(lessonCss).toContain('a[href^="http://"]');
    expect(lessonCss).toContain(':not([href^="https://cueory.app/"])');
    expect(lessonCss).toContain('content: " (" attr(href) ")";');
  });
});
