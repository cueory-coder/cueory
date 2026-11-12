import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { indexablePages } from '../../src/config/routes';

// Verify the built visitor-facing HTML after npm run build, not only Astro source text.
const built = readFileSync(new URL('../../dist/index.html', import.meta.url), 'utf8');
const main = built.match(/<main\b[^>]*>[\s\S]*?<\/main>/)?.[0];
if (!main) throw new Error('missing main landmark on the built home page');

function section(id: 'how-it-works' | 'study-features'): string {
  const expression = new RegExp('<section\\b(?=[^>]*\\bid="' + id + '")[^>]*>[\\s\\S]*?<\\/section>');
  const found = main!.match(expression)?.[0];
  if (!found) throw new Error('missing home section: ' + id);
  return found;
}
function plain(markup: string): string {
  return markup.replace(/<[^>]*>/g, ' ').replace(/&#(?:39|x27);|&apos;/gi, "'").replace(/\s+/g, ' ').trim();
}
function titles(markup: string, level: 2 | 3): string[] {
  const expression = new RegExp('<h' + level + '\\b[^>]*>([\\s\\S]*?)<\\/h' + level + '>', 'g');
  return [...markup.matchAll(expression)].map((match) => plain(match[1]!));
}
function links(markup: string): string[] {
  return [...markup.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>/g)].map((match) => match[1]!);
}

describe('home how-it-works and feature grid (W01-3)', () => {
  it('has one h1, ordered h2 sections and h3 children', () => {
    const how = section('how-it-works');
    const features = section('study-features');
    expect([...main!.matchAll(/<h1\b[^>]*>/g)]).toHaveLength(1);
    expect(main!.indexOf(how)).toBeGreaterThan(main!.indexOf('<h1'));
    expect(main!.indexOf(features)).toBeGreaterThan(main!.indexOf(how));
    expect(titles(how, 2)).toEqual(['how it works']);
    expect(titles(features, 2)).toEqual(['made for the way you study']);
    expect(titles(how, 3)).toHaveLength(3);
    expect(titles(features, 3)).toHaveLength(2);
    expect(how.indexOf('<h3')).toBeGreaterThan(how.indexOf('<h2'));
    expect(features.indexOf('<h3')).toBeGreaterThan(features.indexOf('<h2'));
  });

  it('keeps three correctly ordered, labeled list steps', () => {
    const how = section('how-it-works');
    expect(how).toContain('aria-labelledby="how-it-works-heading"');
    expect(how).toContain('id="how-it-works-heading"');
    const list = how.match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/)?.[1];
    expect(list).toBeDefined();
    const steps = [...(list ?? '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]!);
    expect(steps).toHaveLength(3);
    expect(steps.map((step) => titles(step, 3)[0])).toEqual([
      'pick a lesson', 'study it your way', "come back to what you're still learning",
    ]);
    for (const [index, step] of steps.entries()) {
      expect(step).toContain('aria-hidden="true"');
      expect(plain(step)).toContain('0' + (index + 1));
      expect(titles(step, 3)).toHaveLength(1);
    }
  });

  it('keeps both feature cards, each with a distinct title and link', () => {
    const features = section('study-features');
    expect(features).toContain('aria-labelledby="features-heading"');
    expect(features).toContain('id="features-heading"');
    const cards = [...features.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1]!);
    expect(cards).toHaveLength(2);
    expect(cards.map((card) => titles(card, 3)[0])).toEqual([
      'practice with cards', 'opened lessons can work offline',
    ]);
    expect(features).toContain('data-testid="feature-cards"');
    expect(features).toContain('data-testid="feature-offline"');
  });

  it('links only to existing indexable Cueory routes', () => {
    const fromHow = links(section('how-it-works'));
    const fromFeatures = links(section('study-features'));
    expect(fromHow).toEqual(['/learn/study-skills']);
    expect(fromFeatures).toEqual(['/learn/study-skills/cards', '/learn/study-skills']);
    for (const href of [...fromHow, ...fromFeatures]) {
      expect(indexablePages).toContain(href);
      const file = new URL('../../dist' + href + '.html', import.meta.url);
      expect(existsSync(file)).toBe(true);
    }
  });

  it('keeps style values in tokens, not inline styles or raw colors', () => {
    for (const file of ['HowItWorks.astro', 'FeatureGrid.astro']) {
      const source = readFileSync(new URL('../../src/components/' + file, import.meta.url), 'utf8');
      expect(source).not.toMatch(/\bstyle\s*=/i);
      expect(source).not.toMatch(/#[\da-f]{3,8}\b/i);
    }
  });
});
