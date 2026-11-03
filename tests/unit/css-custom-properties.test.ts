import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = join(process.cwd(), 'src');
const tokenFile = join(srcRoot, 'styles/tokens.css');

// These properties are written by the existing keyboard and progress scripts at runtime.
// Their CSS consumers document the same names in global.css, so they do not have a static declaration.
const runtimeProperties = new Set([
  'progress',
  // Task 109: ModesCarousel.astro sets these on each vial for its place on the ring.
  'ring-bright',
  'ring-depth',
  'ring-gaps',
  'ring-layer',
  'ring-rise',
  'ring-saturate',
  'ring-scale',
  'ring-shift',
  'ring-turn',
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(astro|css|ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function propertyNames(source: string, pattern: RegExp): Set<string> {
  return new Set([...source.matchAll(pattern)].map((match) => match[1]!));
}

function undefinedProperties(used: Set<string>, declared: Set<string>): string[] {
  return [...used].filter((name) => !declared.has(name) && !runtimeProperties.has(name)).sort();
}

describe('CSS custom properties', () => {
  it('recognizes a declared token and rejects an undeclared property', () => {
    const declared = new Set(['color-ink']);
    expect(undefinedProperties(new Set(['color-ink']), declared)).toEqual([]);
    expect(undefinedProperties(new Set(['color-missing']), declared)).toEqual(['color-missing']);
  });

  it('defines every var() property in tokens, local CSS, or the documented runtime allowlist', () => {
    const files = sourceFiles(srcRoot);
    const tokenSource = readFileSync(tokenFile, 'utf8');
    const declared = propertyNames(tokenSource, /--([a-zA-Z0-9_-]+)\s*:/g);
    const used = new Set<string>();

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const name of propertyNames(source, /var\(--([a-zA-Z0-9_-]+)/g)) used.add(name);
      for (const name of propertyNames(source, /--([a-zA-Z0-9_-]+)\s*:/g)) declared.add(name);
    }

    expect(undefinedProperties(used, declared), 'undefined CSS custom properties').toEqual([]);
    expect(relative(process.cwd(), tokenFile)).toBe('src/styles/tokens.css');
  });
});
