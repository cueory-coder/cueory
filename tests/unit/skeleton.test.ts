import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Skeleton from '../../src/islands/Skeleton';

const render = (props: Parameters<typeof Skeleton>[0] = {}) =>
  renderToStaticMarkup(Skeleton(props));

describe('loading skeleton accessibility', () => {
  it.each(['lines', 'card', 'ring'] as const)('%s has one polite status, hides decorative shapes', (kind) => {
    const html = render({ kind });
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('>loading</span>');
    expect(html.match(/class="sr-only"/g)).toHaveLength(1);
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('skeleton');
    expect(html).not.toContain('style=');
  });

  it('removes the entire placeholder once content arrives', () => {
    expect(render({ loading: false })).toBe('');
    expect(render({ kind: 'card', loading: false })).toBe('');
    expect(render({ kind: 'ring', loading: false })).toBe('');
    expect(render({ loading: true })).toContain('>loading</span>');
  });

  it('bounds line skeletons to one through six decorations', () => {
    const numberOfShapes = (lines: number) => (render({ kind: 'lines', lines }).match(/class="skeleton block/g) ?? []).length;
    expect(numberOfShapes(0)).toBe(1);
    expect(numberOfShapes(100)).toBe(6);
    expect(numberOfShapes(2.9)).toBe(2);
    expect(numberOfShapes(Number.NaN)).toBe(3);
  });

  it('uses the existing token-based shimmer and disables it for reduced motion', () => {
    const component = readFileSync(new URL('../../src/islands/Skeleton.tsx', import.meta.url), 'utf8');
    const styles = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
    const tokens = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

    expect(component).toContain('className="skeleton');
    expect(component).not.toContain('style={{');
    expect(tokens).toMatch(/--ease-soft:\s*[^;]+;/);
    expect(styles).toMatch(/\.skeleton\s*\{[^}]*animation:\s*skeleton-pulse\s+[^;]*var\(--ease-soft\)\s+infinite;/s);
    expect(styles).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.skeleton\s*\{\s*animation:\s*none;/s);
  });
});
