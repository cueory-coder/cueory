import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseItems, STATUS_ORDER } from '../../src/islands/conceptmap.ts';

const page = readFileSync(new URL('../../src/pages/preview/concept-map.astro', import.meta.url), 'utf8');

/** Read the page's actual static literals rather than duplicating its fixture. */
const samples = [...page.matchAll(/\{\s*concept:\s*'([^']+)',\s*status:\s*'([^']+)',\s*description:\s*'([^']+)'\s*\}/g)]
  .map(([, concept, status, description]) => ({ concept, status, description }));

describe('concept map preview page', () => {
  it('uses the study layout, does not index the preview and mounts the real map', () => {
    expect(page).toContain("import Layout from '../../layouts/Layout.astro'");
    expect(page).toContain("import ConceptMap from '../../islands/ConceptMap'");
    expect(page).toMatch(/<Layout\b[^>]*\bnoindex\b/s);
    expect(page).toContain('promo={false}');
    expect(page).toContain('variant="study"');
    expect(page).toContain('data-pagefind-ignore');
    expect(page).toMatch(/<ConceptMap\s+items=\{sampleItems\}\s+client:visible\s*\/>/);
    expect(page).not.toMatch(/client:(?:load|only)/);
    expect(page).toMatch(/<noscript>/);
  });

  it('uses exactly eight uniquely named labeled samples with no clinical content', () => {
    expect(samples).toHaveLength(8);
    const parsed = parseItems(samples);
    expect(new Set(parsed.map((item) => item.concept)).size).toBe(8);
    for (const item of parsed) {
      expect(item.concept).toMatch(/^\[sample concept [A-H]\]$/);
      expect(item.description).toMatch(/^\[sample description [A-H]\]$/);
    }
  });

  it('covers every status twice without inventing a score or prediction', () => {
    const parsed = parseItems(samples);
    for (const status of STATUS_ORDER) {
      expect(parsed.filter((item) => item.status === status)).toHaveLength(2);
    }
    expect(page).not.toMatch(/\b(?:exam score|pass probability|chance of passing)\b/i);
  });

  it('does not import a data service or write progress from this page', () => {
    const imported = [...page.matchAll(/^import(?:\s+type)?\s+.+?\s+from\s+['"]([^'"]+)['"]/gm)].map((match) => match[1]);
    expect(imported).toEqual([
      '../../layouts/Layout.astro',
      '../../islands/ConceptMap',
      '../../islands/conceptmap.ts',
    ]);
    expect(page).not.toMatch(/\b(?:fetch|localStorage|sessionStorage|createClient|supabase)\s*\(/i);
    expect(page).not.toMatch(/<form\b/i);
  });
});
