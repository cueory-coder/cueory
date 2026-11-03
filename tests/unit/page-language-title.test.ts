import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dist = resolve('dist');
function builtHtml(folder = dist): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '_astro' || entry.name === 'pagefind') return [];
    const file = join(folder, entry.name);
    return entry.isDirectory() ? builtHtml(file) : entry.isFile() && entry.name.endsWith('.html') ? [file] : [];
  });
}
function documentProblems(source: string): string[] {
  const html = source.replace(/<!--[\s\S]*?-->/g, '');
  const root = html.match(/<html\b[^>]*>/i)?.[0] ?? '';
  const lang = root.match(/\slang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const problems: string[] = [];
  if ((lang?.[1] ?? lang?.[2] ?? lang?.[3]) !== 'en') problems.push('html lang must be en');
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] ?? '';
  const titles = [...head.matchAll(/<title\b[^>]*>([^<]*)<\/title\s*>/gi)];
  if (titles.length !== 1 || !titles[0]?.[1].replace(/&(?:nbsp|#160|#x[aA]0);/g, ' ').trim()) {
    problems.push('head must have one non-empty title');
  }
  return problems;
}

describe('Task 248: built page language and title', () => {
  const files = builtHtml();
  it('has built pages to inspect', () => expect(files.length).toBeGreaterThan(0));
  for (const file of files) {
    it(relative(dist, file), () => expect(documentProblems(readFileSync(file, 'utf8'))).toEqual([]));
  }
  it('rejects missing or wrong language and blank titles', () => {
    expect(documentProblems('<html lang="fr"><head><title> </title></head></html>')).toHaveLength(2);
    expect(documentProblems('<html><head></head></html>')).toHaveLength(2);
    expect(documentProblems('<html data-lang="en"><head><title>x</title></head></html>')).toHaveLength(1);
    expect(documentProblems('<html lang="en"><head><title>&nbsp;</title></head></html>')).toHaveLength(1);
  });
  it('reads document attributes and head title rather than comments or body lookalikes', () => {
    expect(documentProblems('<!-- <html lang="en"><head><title>x</title></head> --><html lang="fr"><head></head><body><title>x</title></body></html>')).toHaveLength(2);
    expect(documentProblems("<html lang='en'><head><title>cueory</title></head></html>")).toEqual([]);
    expect(documentProblems('<html lang=en><head><title>cueory</title></head></html>')).toEqual([]);
  });
});
