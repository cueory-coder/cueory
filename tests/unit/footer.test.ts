import { describe, expect, it } from 'vitest';
import { FOOTER_TOGGLE_LABELS, flagMailto, isFooterPanelOpen, publicPath, setFooterPanel } from '../../src/scripts/footer';

function fakeButton() {
  const attributes: Record<string, string> = {};
  return {
    attributes,
    setAttribute: (name: string, value: string) => void (attributes[name] = value),
    getAttribute: (name: string) => attributes[name] ?? null,
  };
}

describe('footer links panel (Task 85)', () => {
  it('closing hides the panel and says "show footer links"', () => {
    const button = fakeButton();
    const panel = { hidden: false };
    setFooterPanel(button, panel, false);
    expect(panel.hidden).toBe(true);
    expect(button.attributes).toEqual({ 'aria-expanded': 'false', 'aria-label': 'show footer links' });
  });

  it('opening shows the panel and says "hide footer links"', () => {
    const button = fakeButton();
    const panel = { hidden: true };
    setFooterPanel(button, panel, true);
    expect(panel.hidden).toBe(false);
    expect(button.attributes).toEqual({ 'aria-expanded': 'true', 'aria-label': 'hide footer links' });
  });

  it('a tap flips it each time', () => {
    const button = fakeButton();
    const panel = { hidden: false };
    setFooterPanel(button, panel, false);
    for (const expected of [false, true, false]) {
      setFooterPanel(button, panel, !isFooterPanelOpen(button));
      expect(panel.hidden).toBe(expected);
      expect(button.attributes['aria-label']).toBe(expected ? FOOTER_TOGGLE_LABELS.closed : FOOTER_TOGGLE_LABELS.open);
    }
  });
});

describe('flag or comment email', () => {
  it('goes to the contact address with the page in the subject', () => {
    expect(flagMailto('hello@cueory.app', '/learn/study-skills')).toBe(
      'mailto:hello@cueory.app?subject=flag%20or%20comment%3A%20%2Flearn%2Fstudy-skills',
    );
  });

  it('names the page by its public address, not the built file', () => {
    expect(publicPath('/privacy.html')).toBe('/privacy');
    expect(publicPath('/index.html')).toBe('/');
    expect(publicPath('/learn/study-skills/index.html')).toBe('/learn/study-skills/');
    expect(publicPath('/learn/study-skills/cards')).toBe('/learn/study-skills/cards');
    expect(publicPath('/')).toBe('/');
    expect(flagMailto('hello@cueory.app', '/privacy.html')).toBe(
      'mailto:hello@cueory.app?subject=flag%20or%20comment%3A%20%2Fprivacy',
    );
  });

  it('encodes characters that would break the link', () => {
    const link = flagMailto('hello@cueory.app', '/a b?c=1&d#e');
    expect(link).not.toMatch(/[ &#]/);
    expect(decodeURIComponent(link.split('subject=')[1]!)).toBe('flag or comment: /a b?c=1&d#e');
  });
});
