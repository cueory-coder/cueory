import { describe, expect, it } from 'vitest';
import { menuLinks, menuSmallLinks } from '../../src/config/site';
import { currentHref, isCloseKey, wrapFocus } from '../../src/scripts/menu';

const hrefs = menuLinks.map((link) => link.href);

describe('side panel current page (D-46)', () => {
  it.each([
    ['/', '/'],
    ['/index.html', '/'],
    ['/support', '/support'],
    ['/support.html', '/support'],
    ['/support/', '/support'],
    ['/learn/study-skills', '/learn/study-skills'],
    ['/learn/study-skills.html', '/learn/study-skills'],
    ['/learn/study-skills/cards', '/learn/study-skills'],
    ['/learn/study-skills/matching.html', '/learn/study-skills'],
  ])('%s marks %s', (path, expected) => {
    expect(currentHref(path, hrefs)).toBe(expected);
  });

  it.each(['/privacy', '/terms', '/learn/study-skills-two', '/supporters', '/404'])('%s marks nothing', (path) => {
    expect(currentHref(path, hrefs)).toBeUndefined();
  });

  it('never marks a link to a spot on a page, and prefers the longest match', () => {
    expect(currentHref('/', ['/#ways-to-study'])).toBeUndefined();
    expect(currentHref('/learn/a/b', ['/learn', '/learn/a'])).toBe('/learn/a');
  });
});

describe('side panel links', () => {
  it('are lowercase (D-47) and point at our own pages', () => {
    for (const link of [...menuLinks, ...menuSmallLinks]) {
      expect(link.label).toBe(link.label.toLowerCase());
      expect(link.href.startsWith('/')).toBe(true);
    }
  });
});

describe('closing keys', () => {
  it('Escape closes; other keys do not', () => {
    expect(isCloseKey('Escape')).toBe(true);
    expect(isCloseKey('Esc')).toBe(true);
    expect(isCloseKey('Enter')).toBe(false);
    expect(isCloseKey('Tab')).toBe(false);
  });
});

describe('Tab stays inside the open side panel', () => {
  it('wraps from the last item to the first, and Shift+Tab from the first to the last', () => {
    expect(wrapFocus(7, 8, false)).toBe(0);
    expect(wrapFocus(0, 8, true)).toBe(7);
  });

  it('leaves the browser alone in the middle of the list', () => {
    expect(wrapFocus(3, 8, false)).toBeUndefined();
    expect(wrapFocus(3, 8, true)).toBeUndefined();
  });

  it('brings focus back in if it is somewhere else, and does nothing with an empty panel', () => {
    expect(wrapFocus(-1, 8, false)).toBe(0);
    expect(wrapFocus(-1, 8, true)).toBe(7);
    expect(wrapFocus(-1, 0, false)).toBeUndefined();
  });
});
