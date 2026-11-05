import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { site } from '../../src/config/site';

const routes = [
  '../../src/pages/learn/[lesson]/index.astro',
  '../../src/pages/learn/[lesson]/cards.astro',
  '../../src/pages/learn/[lesson]/fill-in.astro',
  '../../src/pages/learn/study-skills/label-it.astro',
  '../../src/pages/learn/[lesson]/learn-mode.astro',
  '../../src/pages/learn/[lesson]/matching.astro',
  '../../src/pages/learn/[lesson]/organizer.astro',
  '../../src/pages/learn/study-skills/questions.astro',
];

describe('content disclosure label (Task 520)', () => {
  it('warns truthfully about uncited samples and placeholders', () => {
    expect(site.contentNotice).toBe(
      'some lessons are samples or placeholders. content may not have citations or licensed-nurse review',
    );
    const lesson = JSON.parse(readFileSync(new URL('../../content/lessons/study-skills-01.json', import.meta.url), 'utf8'));
    const deck = JSON.parse(readFileSync(new URL('../../content/cards/study-skills-01.json', import.meta.url), 'utf8'));
    if (lesson.status === 'placeholder' || lesson.status === 'sample' || deck.status === 'placeholder' || deck.status === 'sample') {
      expect(site.contentNotice).not.toMatch(/researched against cited sources|with citations/i);
    }
  });

  it('renders ContentLabel in every lesson and study-mode route', () => {
    for (const relPath of routes) {
      const content = readFileSync(new URL(relPath, import.meta.url), 'utf8');
      expect(content).toContain('ContentLabel');
      expect(content).toContain('<ContentLabel');
    }
  });
});
