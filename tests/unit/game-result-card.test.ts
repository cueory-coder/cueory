import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildResultShareLine } from '../../src/islands/gameresults';
import { platformShareUrl } from '../../src/islands/share';

const card = { name: 'pillo', date: 'nov 11, 2026', result: '4 / 6' };

describe('finished-game share line', () => {
  it('uses the exact plain one-line format', () => {
    expect(buildResultShareLine(card)).toBe('pillo · nov 11, 2026 · 4 / 6 · cueory.app');
    expect(buildResultShareLine({ name: '  word   path ', date: ' nov 11 ', result: ' 12 / 15 ' }))
      .toBe('word path · nov 11 · 12 / 15 · cueory.app');
  });
});

describe('plain platform share pages', () => {
  const line = buildResultShareLine(card);
  const target = 'https://cueory.app/play#pulse-heading';

  it.each([
    ['facebook', 'https://www.facebook.com/sharer/sharer.php', 'u'],
    ['x', 'https://x.com/intent/post', 'url'],
    ['threads', 'https://www.threads.net/intent/post', 'text'],
    ['reddit', 'https://www.reddit.com/submit', 'url'],
    ['whatsapp', 'https://wa.me/', 'text'],
  ] as const)('%s uses only a plain share-page link', (platform, route, parameter) => {
    const url = new URL(platformShareUrl(platform, line, target));
    expect(url.origin + url.pathname).toBe(route);
    expect(url.searchParams.get(parameter)).toContain(parameter === 'text' && platform !== 'x' ? line : target);
    expect(url.searchParams.has('utm_source')).toBe(false);
  });
});


describe('story image implementation', () => {
  it('takes every canvas dimension and font from design tokens', () => {
    const source = readFileSync(new URL('../../src/islands/share.ts', import.meta.url), 'utf8');
    const tokens = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
    for (const name of [
      '--share-story-width', '--share-story-height', '--share-story-logo-width', '--share-story-logo-top',
      '--share-story-label-y', '--share-story-result-y', '--share-story-challenge-y', '--share-story-site-y',
      '--share-story-label-size', '--share-story-result-size', '--share-story-challenge-size', '--share-story-site-size',
    ]) {
      expect(source).toContain(`number('${name}')`);
      expect(tokens).toContain(`${name}:`);
    }
    expect(source).toContain("image('/brand/v1/logo-full-light-960.png')");
    expect(source).not.toMatch(/font = ['"][^'"]*\d+px/);
  });

  it('sets the story canvas to the required 1080 by 1920 through tokens', () => {
    expect(tokensValue('--share-story-width')).toBe('1080');
    expect(tokensValue('--share-story-height')).toBe('1920');
  });
});

function tokensValue(name: string): string {
  const tokens = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
  return new RegExp(`${name}:\\s*([^;]+)`).exec(tokens)?.[1]?.trim() ?? '';
}
