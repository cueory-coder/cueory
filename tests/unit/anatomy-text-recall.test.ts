import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AnatomyTextRecall from '../../src/islands/AnatomyTextRecall';
import type { AnatomySystem } from '../../src/islands/anatomylab';

const sample: AnatomySystem = {
  key: 'sample', title: '[sample system]', status: 'draft', fixture: true,
  model: { file: '/preview/unused.glb', release: 'test fixture' },
  structures: [{ id: 'S1', text: '[sample label] one' }, { id: 'S2', text: '[sample label] two' }],
};

describe('nonvisual anatomy name practice', () => {
  it('offers a named native system selector and start control without a model or canvas', () => {
    const html = renderToStaticMarkup(createElement(AnatomyTextRecall, { systems: [sample], drafts: true }));
    expect(html).toContain('aria-label="source ID practice"');
    expect(html).toContain('for="anatomy-text-system"');
    expect(html).toContain('<select');
    expect(html).toContain('start text name it');
    expect(html).toContain('no 3D view or model download is needed');
    expect(html).not.toContain('<canvas');
    expect(html).not.toContain('/preview/unused.glb');
    expect(html).not.toContain('style=');
  });

  it('keeps the draft warning on real draft labels but not on the synthetic fixture', () => {
    const real = { ...sample, fixture: false };
    expect(renderToStaticMarkup(createElement(AnatomyTextRecall, { systems: [real], drafts: true })))
      .toContain('draft · labels waiting for review');
    expect(renderToStaticMarkup(createElement(AnatomyTextRecall, { systems: [sample], drafts: true })))
      .not.toContain('draft · labels waiting for review');
  });

  it('renders nothing for an unavailable catalog and disables an empty catalog', () => {
    expect(renderToStaticMarkup(createElement(AnatomyTextRecall, { systems: [], drafts: false }))).toBe('');
    expect(renderToStaticMarkup(createElement(AnatomyTextRecall, { systems: [{ ...sample, structures: [] }], drafts: true })))
      .toMatch(/<button[^>]*disabled=""/);
  });
});
