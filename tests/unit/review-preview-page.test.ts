import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../src/pages/preview/review.astro', import.meta.url), 'utf8');

describe('S9 sample review preview', () => {
  it('uses the shared layout, a quiet study screen, and a non-indexable page', () => {
    expect(source).toMatch(/import Layout from ['"]\.\.\/\.\.\/layouts\/Layout\.astro['"]/);
    expect(source).toContain('<Layout');
    expect(source).toMatch(/\bvariant="study"/);
    expect(source).toMatch(/\bnoindex\b/);
    expect(source).toMatch(/\bpromo=\{false\}/);
    expect(source).toContain('<h1');
    expect(source).toContain('<noscript>');
  });

  it('gives every preview card an explicit sample front and back, with distinct sample ids', () => {
    const cards = [...source.matchAll(/\{\s*id: '(sample-\d+)', front: '\[sample front\]', back: '\[sample back\]'\s*\}/g)];
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(cards.length).toBeLessThanOrEqual(5);
    expect(new Set(cards.map((match) => match[1])).size).toBe(cards.length);
    expect(source.match(/\bid: 'sample-\d+'/g)).toHaveLength(cards.length);
    expect(source).toContain("today: '2026-11-05'");
  });

  it('mounts the existing review component with only a memory callback and no network or storage', () => {
    expect(source).toContain("import ReviewSession from '../../islands/ReviewSession'");
    expect(source).toContain('createRoot(container).render(createElement(ReviewSession');
    expect(source).toContain('inMemoryHistories = structuredClone(next)');
    expect(source).not.toMatch(/(?:from|import)\s*['"][^'"]*(?:supabase|reviewsync|auth)[^'"]*['"]/i);
    expect(source).not.toMatch(/\b(?:fetch\s*\(|localStorage\b|sessionStorage\b|sendBeacon\s*\()/);
    expect(source).not.toMatch(/<script\s+is:inline/i);
    expect(source).not.toMatch(/\bstyle\s*=/i);
    expect(source).not.toMatch(/https?:\/\//i);
  });
});
