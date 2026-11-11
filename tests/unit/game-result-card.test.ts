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
