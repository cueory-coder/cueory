/** Task 189: inspect delivered styles, not only the source import location. Build first. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dist = resolve('dist');

function htmlFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.isFile() && entry.name.endsWith('.html') ? [path] : [];
  });
}

function deliveredStyles(html: string): string {
  const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]!);
  const sheets = [...html.matchAll(/<link\b[^>]*>/g)].flatMap(([tag]) => {
    if (!/\brel="stylesheet"/.test(tag)) return [];
    const href = /\bhref="([^"]+)"/.exec(tag)?.[1];
    if (!href) throw new Error('a stylesheet link has no href');
    return [readFileSync(join(dist, href), 'utf8')];
  });
  return [...inline, ...sheets].join('\n');
}

describe('Pillo stylesheet delivery', () => {
  it('delivers the Pillo board, keyboard and reduced-motion rules on its game page', () => {
    expect(existsSync(dist), 'run npm run build before the build-output tests').toBe(true);
    const styles = deliveredStyles(readFileSync(join(dist, 'play.html'), 'utf8'));
    for (const selector of ['.pillo-pack', '.pillo-key', '.pillo-legend']) {
      expect(styles, selector).toContain(selector);
    }
    expect(styles).toContain('prefers-reduced-motion:reduce');
    expect(styles).toContain('pillo-pop');
  });

  it('does not deliver Pillo board or keyboard selectors to any other built route', () => {
    const pages = htmlFiles(dist).filter(path => relative(dist, path) !== 'play.html');
    expect(pages.length).toBeGreaterThan(0);
    for (const path of pages) {
      const styles = deliveredStyles(readFileSync(path, 'utf8'));
      expect(styles, relative(dist, path)).not.toMatch(/\.pillo(?:[\s.{:#\[]|-)/);
    }
  });
});
