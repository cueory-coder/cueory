import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import Callout from '../../src/components/Callout.astro';
import Prose from '../../src/components/Prose.astro';
import ContentLabel from '../../src/components/ContentLabel.astro';
import PlaceholderBlock from '../../src/components/PlaceholderBlock.astro';
import { site } from '../../src/config/site';

const kinds = [
  ['note', 'note'],
  ['remember', 'remember'],
  ['try-it', 'try it'],
] as const;

describe('lesson reading parts (Task 742)', () => {
  for (const [kind, label] of kinds) {
    it(`renders the ${kind} callout as a labeled note, never an icon alone`, async () => {
      const container = await AstroContainer.create();
      const html = await container.renderToString(Callout, {
        props: { kind },
        slots: { default: '<p>[sample callout]</p>' },
      });

      expect(html).toMatch(/<aside\b[^>]*role="note"/);
      expect(html).toContain(`data-callout-kind="${kind}"`);
      expect(html).toMatch(new RegExp(`<span[^>]*>${label}<\\/span>`));
      expect(html).toMatch(/<svg\b[^>]*aria-hidden="true"/);
      expect(html).toContain('[sample callout]');
      expect(html).toContain('bg-surface');
      expect(html).not.toMatch(/style="|<script\b/);
    });
  }

  it('renders prose as a semantic reading article with headings, lists and inline emphasis', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Prose, {
      slots: {
        default: '<h1>[sample heading]</h1><h2>[sample section]</h2><p>[sample sentence] <strong class="key-term">[sample key term]</strong></p><ul><li>[sample list item]</li></ul><ol><li>[sample ordered item]</li></ol>',
      },
    });

    expect(html).toMatch(/<article\b[^>]*class="[^"]*\breading-copy\b/);
    expect(html).toContain('[sample heading]');
    expect(html).toContain('[sample section]');
    expect(html).toContain('<ul>');
    expect(html).toContain('<ol>');
    expect(html).toContain('class="key-term"');
    expect(html).toContain('max-w-prose');
  });

  it('uses the existing reading line-height token at 1.5 or more, without raw colors or a silk texture', () => {
    const prose = readFileSync(new URL('../../src/components/Prose.astro', import.meta.url), 'utf8');
    const tokens = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
    const lineHeight = Number(tokens.match(/--text-base--line-height:\s*([0-9.]+)/)?.[1] ?? 0);

    expect(lineHeight).toBeGreaterThanOrEqual(1.5);
    expect(prose).toContain('line-height: var(--text-base--line-height)');
    expect(prose).not.toMatch(/#[\da-f]{3,8}\b|background-image:|\bscene-hero\b/i);
  });

  it('renders the content disclosure with approved wording, disclaimer link and caller classes', async () => {
    const container = await AstroContainer.create();
    const basic = await container.renderToString(ContentLabel);
    const spaced = await container.renderToString(ContentLabel, { props: { class: 'mt-6' } });

    expect(basic).toContain(site.contentNotice);
    expect(basic).toMatch(/<a\b[^>]*href="\/disclaimer"/);
    expect(basic).toContain('disclaimer</a>');
    expect(basic).toContain('bg-surface/50');
    expect(spaced).toContain('mt-6');
    expect(spaced).toContain(site.contentNotice);
  });

  it('renders the placeholder with a visible label, sample slot and marker for unpublished copy', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(PlaceholderBlock, {
      props: { label: '[sample heading]' },
      slots: { default: '<p>[sample placeholder]</p>' },
    });

    expect(html).toContain('data-placeholder="CHRISTIAN-TEXT"');
    expect(html).toContain('Placeholder: [sample heading]');
    expect(html).toContain('[sample placeholder]');
    expect(html).toMatch(/<div\b[^>]*class="[^"]*border-dashed/);
    expect(html).toContain('bg-surface');
  });

  it('keeps all component colors in the shared token palette and uses no external assets', () => {
    for (const name of ['Callout', 'Prose', 'ContentLabel', 'PlaceholderBlock']) {
      const source = readFileSync(new URL(`../../src/components/${name}.astro`, import.meta.url), 'utf8');
      // An SVG XML namespace is not a remote dependency.
      const withoutSvgNamespace = source.replaceAll('xmlns="http://www.w3.org/2000/svg"', '');
      expect(withoutSvgNamespace).not.toMatch(/#[0-9a-f]{3,8}\b|https?:\/\/|<script\b/i);
      expect(source).not.toMatch(/\sstyle="/i);
    }
  });
});
