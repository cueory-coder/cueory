import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const forbidden = /\b(?:master|mastered|mastery)\b/i;
const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url));

/** Inspect only static text a student can read, not TypeScript variables or comments. */
function studentFacingLiterals(source: string): string[] {
  const text: string[] = [];

  // Native JSX/Astro text nodes. Interpolated {expressions} are program code, not literal wording.
  // Self-closing JSX tags never have text children. Do not read adjacent code comments as page text.
  const nodeText = /<(?:h[1-6]|p|span|button|label|a|div|li|strong|em|small|output|summary|option|figcaption)\b[^<>]*?(?<!\/)>([^<]*)</gi;
  for (const match of source.matchAll(nodeText)) {
    const literal = match[1]!.replace(/\{[^{}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
    if (literal) text.push(literal);
  }

  // Static accessibility, tooltip and placeholder text. Dynamic properties need browser tests.
  const attributes = /\b(?:aria-label|aria-valuetext|title|alt|placeholder)\s*=\s*(["'])(.*?)\1/g;
  for (const match of source.matchAll(attributes)) text.push(match[2]!);

  // Student-facing labels and descriptions defined as quoted configuration values.
  const configLiterals = /\b(?:label|title|description|heading)\s*:\s*(["'])(.*?)\1/g;
  for (const match of source.matchAll(configLiterals)) text.push(match[2]!);

  return text;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filename = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(filename);
    return /\.(astro|tsx?|jsx?)$/.test(entry.name) ? [filename] : [];
  });
}

describe('Task 522 student-facing progress words', () => {
  it('ignores internal identifiers and JSX expressions while catching visible wording', () => {
    expect(studentFacingLiterals('const progress = total > 0 ? mastered / total : 0;')).toEqual([]);
    expect(studentFacingLiterals('<div aria-valuenow={mastered} />')).toEqual([]);
    expect(studentFacingLiterals('<p>recalled today {mastered} of {total}</p>')).toEqual(['recalled today of']);
    expect(studentFacingLiterals('<p>Mastered {mastered} of {total}</p>')).toContain('Mastered of');
    expect(studentFacingLiterals('<div aria-label="Cards mastered" />')).toContain('Cards mastered');
    expect(studentFacingLiterals('<span aria-hidden="true" />;\n/** internal implementation: mastered */\n<p>recalled today</p>')).toEqual(['recalled today']);
  });

  it('uses no forbidden progress words in static student-visible text or accessible labels', () => {
    const sources = ['components', 'pages', 'layouts', 'config']
      .flatMap((dir) => filesUnder(join(srcRoot, dir)));
    sources.push(join(srcRoot, 'islands/LearnSession.tsx'));

    const violations: string[] = [];
    for (const file of sources) {
      const content = readFileSync(file, 'utf8');
      for (const literal of studentFacingLiterals(content)) {
        if (forbidden.test(literal)) {
          violations.push(file.replace(srcRoot, 'src/') + ': ' + literal);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
