import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEADER_HIDE_AFTER_PX, nextHeaderState, type HeaderState } from '../../src/scripts/headerscroll';

const decide = (
  previous: HeaderState,
  y: number,
  lastY: number,
  focusInside = false,
  menuOpen = false,
) => nextHeaderState(previous, y, lastY, focusInside, menuOpen);

describe('header scroll decisions', () => {
  it('uses the named 80px threshold and keeps navigation shown at the top', () => {
    expect(HEADER_HIDE_AFTER_PX).toBe(80);
    for (const y of [0, 1, 40, 79, 80]) {
      expect(decide('visible', y, y - 1)).toBe('visible');
      expect(decide('hidden', y, y + 1)).toBe('visible');
    }
    expect(decide('visible', 81, 80)).toBe('hidden');
  });

  it('hides when scrolling down beyond the threshold', () => {
    expect(decide('visible', 301, 300)).toBe('hidden');
    expect(decide('hidden', 500, 300)).toBe('hidden');
  });

  it('shows when scrolling up, even when the last state was hidden', () => {
    expect(decide('hidden', 300, 301)).toBe('visible');
    expect(decide('visible', 300, 301)).toBe('visible');
  });

  it('does not flicker when the position does not change', () => {
    expect(decide('hidden', 301, 301)).toBe('hidden');
    expect(decide('visible', 301, 301)).toBe('visible');
  });

  it('never hides while a button, link or other element inside the header has focus', () => {
    for (const before of ['visible', 'hidden'] as const) {
      expect(decide(before, 501, 500, true)).toBe('visible');
      expect(decide(before, 501, 501, true)).toBe('visible');
    }
  });

  it('never hides while the site menu is open, even if focus is outside the header', () => {
    for (const before of ['visible', 'hidden'] as const) {
      expect(decide(before, 501, 500, false, true)).toBe('visible');
      expect(decide(before, 500, 501, false, true)).toBe('visible');
    }
  });

  it('keeps the header visible when focus and the menu are both active', () => {
    expect(decide('hidden', 501, 500, true, true)).toBe('visible');
  });

  it('fails open for invalid, negative or non-finite scroll positions', () => {
    for (const bad of [NaN, Infinity, -Infinity, -1]) {
      expect(decide('hidden', bad, 300)).toBe('visible');
      expect(decide('hidden', 300, bad)).toBe('visible');
    }
  });

  it('remains pure across repeated decisions and does not track time or storage', () => {
    const args = Object.freeze(['visible', 200, 120, false, false] as const);
    expect(nextHeaderState(...args)).toBe('hidden');
    expect(nextHeaderState(...args)).toBe('hidden');
    expect(args).toEqual(['visible', 200, 120, false, false]);
  });
});

describe('header integration guard', () => {
  const component = readFileSync(new URL('../../src/components/SiteHeader.astro', import.meta.url), 'utf8');
  it('keeps the home hero overlay and makes the ordinary header sticky', () => {
    expect(component).toContain("overlay ? 'absolute inset-x-0 top-0' : 'sticky top-0 site-header-sticky'");
    expect(component).toContain("data-scroll-header={overlay ? undefined : ''}");
  });

  it('frosts with existing brand tokens, not raw colors', () => {
    expect(component).toContain('var(--color-page)');
    expect(component).toContain('var(--panel-alpha)');
    expect(component).toContain('var(--blur-veil)');
    expect(component).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('reserves scroll clearance for focused game controls below the sticky header', () => {
    expect(component).toContain(':global(html:has([data-scroll-header]))');
    expect(component).toContain('scroll-padding-top: calc(var(--spacing) * 28)');
    expect(component).toContain('@media (min-width: 40rem)');
    expect(component).toContain('scroll-padding-top: calc(var(--spacing) * 36)');
    expect(component).toContain("data-scroll-header={overlay ? undefined : ''}");
    // Focused controls must be able to scroll below the home-logo link, not underneath it.
    expect(component).toContain('site-header-sticky');
  });

  it('keeps the account menu visible when Safari does not focus its toggle', () => {
    const corner = readFileSync(new URL('../../src/components/AccountCorner.astro', import.meta.url), 'utf8');
    expect(corner).toContain('data-account-toggle');
    expect(corner).toContain("toggle.setAttribute('aria-expanded', String(open))");
    expect(component).toContain("header.querySelector<HTMLButtonElement>('[data-account-toggle]')");
    expect(component).toContain("accountButton?.getAttribute('aria-expanded') === 'true'");
    expect(component).toContain("accountButton?.addEventListener('click', () => requestAnimationFrame(refresh))");
    expect(decide('hidden', 320, 300, false, true)).toBe('visible');
    expect(decide('visible', 320, 300, false, true)).toBe('visible');
  });

  it('does not tuck during keyboard focus, an open menu or reduced motion', () => {
    expect(component).toContain('header.contains(document.activeElement)');
    expect(component).toContain("menuDialog?.open === true");
    expect(component).toContain('prefers-reduced-motion: reduce');
    expect(component).toContain("reducedMotion.matches");
    expect(component).toContain('header.site-header-sticky.is-tucked');
  });
});
