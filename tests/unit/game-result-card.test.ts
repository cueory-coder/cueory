import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildResultShareLine, sudokuResultCard } from '../../src/islands/gameresults';
import { platformShareUrl } from '../../src/islands/share';

const card = { name: 'pillo', date: 'nov 11, 2026', result: '4 / 6' };

describe('finished-game share line', () => {
  it('uses the exact plain one-line format', () => {
    expect(buildResultShareLine(card)).toBe('pillo · nov 11, 2026 · 4 / 6 · cueory.app');
    expect(buildResultShareLine({ name: '  word   path ', date: ' nov 11 ', result: ' 12 / 15 ' }))
      .toBe('word path · nov 11 · 12 / 15 · cueory.app');
  });
});

describe('Sudoku result adapter', () => {
  it('maps Worker 1 completion details to the shared result card', () => {
    expect(sudokuResultCard({
      game: 'sudoku',
      day: '2026-11-11',
      level: 'medium',
      solved: true,
      seconds: 154,
      time: '2:34',
      errors: 1,
    })).toEqual({
      game: 'sudoku',
      name: 'sudoku',
      date: 'wed 11 nov',
      level: 'medium',
      result: 'solved',
      summary: 'medium completed in 2:34 with 1 error.',
      stats: [
        { label: 'time', value: '2:34' },
        { label: 'errors', value: '1' },
      ],
      path: '/play/sudoku',
    });
  });

  it('keeps the listener additive and typed at the shared host boundary', () => {
    const source = readFileSync(new URL('../../src/islands/GameResultsHost.tsx', import.meta.url), 'utf8');
    expect(source).toContain('SUDOKU_SOLVED_EVENT');
    expect(source).toContain("WindowEventMap['cueory:sudoku-solved']");
    expect(source).toContain('showResultCard(sudokuResultCard(event.detail))');
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
    expect(url.searchParams.get(parameter)).toContain(parameter === 'text' && platform !== 'threads' ? line : target);
    expect(url.searchParams.has('utm_source')).toBe(false);
  });
});


describe('shared result dialog placement and touch targets', () => {
  it('mounts result hosts outside filtered veil articles', () => {
    const play = readFileSync(new URL('../../src/pages/play.astro', import.meta.url), 'utf8');
    const hello = readFileSync(new URL('../../src/pages/play/hello-cards.astro', import.meta.url), 'utf8');
    for (const source of [play, hello]) {
      expect(source.lastIndexOf('<GameResultsHost')).toBeGreaterThan(source.lastIndexOf('</article>'));
      expect(source.lastIndexOf('<GameResultsHost')).toBeLessThan(source.lastIndexOf('</Layout>'));
    }
    expect(hello).toContain('{shown && <GameResultsHost client:only="react" />}');
  });

  it('gives every platform link a tokenized square minimum target', () => {
    const source = readFileSync(new URL('../../src/islands/GameResultsHost.tsx', import.meta.url), 'utf8');
    const platformLink = source.slice(source.indexOf('platforms.map'), source.indexOf('</nav>'));
    expect(platformLink).toContain('min-h-(--tap-min)');
    expect(platformLink).toContain('min-w-(--tap-min)');
    expect(platformLink).toContain('justify-center');
  });
});

describe('shared result dialog design tokens', () => {
  it('uses the repository overlay and radius tokens', () => {
    const source = readFileSync(new URL('../../src/islands/GameResultsHost.tsx', import.meta.url), 'utf8');
    expect(source).toContain('result-dialog-overlay');
    expect(source).toContain('rounded-xl');
    expect(source).not.toContain('backdrop-blur-sm');
    expect(source).not.toContain('bg-ink/40');
    expect(source).not.toContain('rounded-2xl');
  });

  it('uses small caps without text-transforming source content', () => {
    const host = readFileSync(new URL('../../src/islands/GameResultsHost.tsx', import.meta.url), 'utf8');
    const landing = readFileSync(new URL('../../src/components/GameShareLanding.astro', import.meta.url), 'utf8');
    const styles = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
    expect(host).toContain('result-meta');
    expect(landing).toContain('result-meta');
    expect(host + landing).not.toContain('uppercase');
    expect(styles).toContain('font-variant-caps: all-small-caps');
    expect(styles).not.toMatch(/\.result-meta[^}]*text-transform/s);
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
      '--share-story-dark-logo',
    ]) {
      expect(source).toContain(`number('${name}')`);
      expect(tokens).toContain(`${name}:`);
    }
    expect(source).toContain("'/brand/v1/logo-full-light-960.png'");
    expect(source).toContain("'/brand/v1/logo-full-dark-960.png'");
    expect(source).toContain("number('--share-story-dark-logo') === 1");
    expect(source).not.toContain('#1c1917');
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
