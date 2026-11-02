import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ResultBrandMark from '../../src/islands/ResultBrandMark';

const source = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

describe('quiet result brand mark', () => {
  it.each(['/play', '/progress'] as const)('uses a real Cueory route %s and original emblem images', (path) => {
    const html = renderToStaticMarkup(createElement(ResultBrandMark, { path }));
    expect(html).toContain('data-testid="result-brand-mark"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('print:hidden');
    // Watermarks must stay readable and the emblem must keep its exact approved color.
    expect(html).not.toContain('opacity-50');
    expect(html).toContain('cueory.app' + path);
    expect(html).toContain('/brand/v1/emblem-light-96.png');
    expect(html).toContain('/brand/v1/emblem-dark-96.png');
    expect(html).toContain('logo-day');
    expect(html).toContain('logo-evening');
    expect(html).not.toContain('href=');
    expect(html).not.toContain('dangerouslySetInnerHTML');
  });

  it('the Astro version renders Wordmark artwork, not a copied wordmark or image', () => {
    const astro = source('src/components/BrandMark.astro');
    expect(astro).toContain("import Wordmark from './Wordmark.astro'");
    expect(astro).toContain('<Wordmark variant="emblem"');
    expect(astro).toContain('aria-hidden="true"');
    expect(astro).toContain('print:hidden');
    expect(astro).not.toContain('opacity-50');
    expect(astro).not.toContain('<img');
  });

  it.each([
    ['src/islands/PulseGame.tsx', 'pulse-result'],
    ['src/islands/TriageGame.tsx', 'triage-result'],
    ['src/islands/CuewordGame.tsx', 'cueword-result'],
  ])('appears only inside the %s completed-result card', (path, testid) => {
    const contents = source(path);
    const start = contents.indexOf('data-testid="' + testid + '"');
    const mark = contents.indexOf('<ResultBrandMark path="/play" />');
    expect(start).toBeGreaterThan(0);
    expect(mark).toBeGreaterThan(start);
    expect(contents.slice(0, start)).not.toContain('<ResultBrandMark');
  });

  it('keeps brand marks outside answer regions', () => {
    const triage = source('src/islands/TriageGame.tsx');
    expect(triage.indexOf('<ResultBrandMark path="/play" />')).toBeGreaterThan(
      triage.indexOf('data-testid="triage-answer"'),
    );
  });
});
