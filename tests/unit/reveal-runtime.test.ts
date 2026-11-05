import { afterEach, describe, expect, it, vi } from 'vitest';
import { revealSections } from '../../src/scripts/reveal';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reveal section runtime guards', () => {
  it('does not query the document when reduced motion is enabled', () => {
    // Make the observer available so only the reduced-motion guard can stop the query.
    class AvailableObserver {
      observe() {}
      unobserve() {}
    }
    vi.stubGlobal('IntersectionObserver', AvailableObserver);
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true }),
      IntersectionObserver: AvailableObserver,
    });
    vi.stubGlobal('document', {
      querySelectorAll: () => {
        throw new Error('document should not be queried');
      },
    });

    expect(() => revealSections()).not.toThrow();
  });

  it('does not query the document when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal('document', {
      querySelectorAll: () => {
        throw new Error('document should not be queried');
      },
    });

    expect(() => revealSections()).not.toThrow();
  });
});
