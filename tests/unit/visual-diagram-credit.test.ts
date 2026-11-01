import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import pumpFile from '../../content/visuals/sodium-potassium-pump.json';
import VisualDiagram from '../../src/visuals/VisualDiagram';
import { creditsFor, type Visual } from '../../src/visuals/sources';

const visual = pumpFile as Visual;
const render = (credit?: boolean) =>
  renderToStaticMarkup(createElement(VisualDiagram, { visual, allowDraft: true, ...(credit === undefined ? {} : { credit }) }));

describe('the credit prop on a visual diagram', () => {
  const credits = creditsFor(visual);

  it('shows the book credit and its license link by default', () => {
    expect(credits.length).toBeGreaterThan(0);
    const markup = render();
    for (const book of credits) {
      expect(markup).toContain(book.credit.replace(/&/g, '&amp;'));
      expect(markup).toContain(book.licenseUrl);
    }
  });

  it('hides only the credit when it is false', () => {
    const markup = render(false);
    for (const book of credits) {
      expect(markup).not.toContain(book.credit.replace(/&/g, '&amp;'));
      expect(markup).not.toContain(book.licenseUrl);
    }
    expect(markup).not.toContain('the license');
    // Everything else stays: the drawing, the written description of what it shows, and the player.
    expect(markup).toContain('what the drawing shows');
    expect(markup).toContain(`data-visual="${visual.id}"`);
    expect(markup.replace(/<a [^>]*rel="license noopener">the license<\/a>/g, '').length).toBeLessThan(render().length);
  });

  it('leaves everything but the credit identical', () => {
    const withCredit = render(true);
    const without = render(false);
    const creditParagraphs = [...withCredit.matchAll(/<p class="mt-2">[^<]*<a [^>]*rel="license noopener">the license<\/a><\/p>/g)];
    expect(creditParagraphs).toHaveLength(credits.length);
    expect(creditParagraphs.reduce((text, [paragraph]) => text.replace(paragraph, ''), withCredit)).toBe(without);
  });
});
