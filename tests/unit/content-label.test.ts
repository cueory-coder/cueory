import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { site } from '../../src/config/site';

const routes = [
  '../../src/pages/learn/study-skills/index.astro',
  '../../src/pages/learn/study-skills/cards.astro',
  '../../src/pages/learn/study-skills/fill-in.astro',
  '../../src/pages/learn/study-skills/label-it.astro',
  '../../src/pages/learn/study-skills/learn-mode.astro',
  '../../src/pages/learn/study-skills/matching.astro',
  '../../src/pages/learn/study-skills/organizer.astro',
  '../../src/pages/learn/study-skills/questions.astro',
];

describe('content disclosure label (Task 520)', () => {
  it('defines the required content vetting notice text in site configuration', () => {
    expect(site.contentNotice).toBe(
      'researched against cited sources, with citations; not yet reviewed by a licensed nurse',
    );
  });

  it('renders ContentLabel in every lesson and study-mode route', () => {
    for (const relPath of routes) {
      const content = readFileSync(new URL(relPath, import.meta.url), 'utf8');
      expect(content).toContain('ContentLabel');
      expect(content).toContain('<ContentLabel');
    }
  });
});
