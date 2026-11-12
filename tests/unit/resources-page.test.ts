import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { indexablePages } from '../../src/config/routes';

const source = readFileSync(new URL('../../src/pages/resources.astro', import.meta.url), 'utf8');
const sectionIds = ['how-to', 'learning', 'tips', 'pay', 'adhd', 'schools'] as const;

describe('resources page shell', () => {
  it('uses Layout noindex and stays out of the public sitemap', () => {
    expect(source).toMatch(/<Layout\b[\s\S]*?\bnoindex\b/);
    expect(indexablePages).not.toContain('/resources');
  });

  it('has internal navigation to each section and no external links', () => {
    const navTargets = [...source.matchAll(/\bhref:\s*'(#[^']+)'/g)].map((match) => match[1]);
    expect(navTargets).toEqual(sectionIds.map((id) => '#' + id));
    for (const id of sectionIds) {
      expect(source).toContain('id="' + id + '"');
      expect(source).toContain('aria-labelledby="' + id + '-heading"');
    }
    expect(source).not.toMatch(/\bhref\s*=\s*["']https?:\/\//i);
    expect(source).not.toMatch(/\bhref:\s*["']https?:\/\//i);
    expect(source).not.toMatch(/<form\b/i);
  });

  it('labels placeholders rather than publishing resource links, advice or pay data', () => {
    expect((source.match(/data-placeholder="resource"/g) ?? []).length).toBeGreaterThanOrEqual(12);
    for (const placeholder of [
      '[page introduction pending review]',
      '[resource name 1]',
      '[resource description 1]',
      '[study tips pending Christian\'s review]',
      '[pay data description pending review]',
      '[state]',
      '[unit]',
      '[pay]',
      '[years]',
      '[tool name 1]',
      '[tool description 1]',
      '[school review description pending review]',
    ]) {
      expect(source).toContain(placeholder);
    }
    expect(source).toMatch(/<fieldset\s+disabled\b/);
    expect((source.match(/<select\s+disabled\b/g) ?? []).length).toBe(3);
  });
});
