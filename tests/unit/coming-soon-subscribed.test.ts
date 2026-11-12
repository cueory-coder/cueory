import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { indexablePages } from '../../src/config/routes';

const comingSoon = readFileSync(new URL('../../src/pages/coming-soon.astro', import.meta.url), 'utf8');
const subscribed = readFileSync(new URL('../../src/pages/subscribed.astro', import.meta.url), 'utf8');

const pages = { 'coming soon': comingSoon, subscribed };

describe('coming-soon and subscribed page shells', () => {
  for (const [name, source] of Object.entries(pages)) {
    it(`${name} has one heading, marketing styling and appropriate search exclusion`, () => {
      expect([...source.matchAll(/<h1\b/g)]).toHaveLength(1);
      expect(source).toMatch(/<Layout\b[^>]*\bnoindex\b/);
      expect(source).toContain('class="veil');
      expect(source).toContain('class="display');
      expect(source).not.toMatch(/<script\b|<style\b|\sstyle=/i);
    });

    it(`${name} next-step links point to real public routes`, () => {
      const hrefs = [...source.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((match) => match[1]);
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        expect(indexablePages).toContain(href);
        expect(href).not.toMatch(/^https?:\/\//);
      }
      expect(hrefs).toContain('/learn/study-skills');
    });
  }

  it('uses only public roadmap data for the coming-soon lists', () => {
    expect(comingSoon).toContain("courses.filter((c) => c.status === 'coming-soon')");
    expect(comingSoon).toContain('plannedCourses.map(');
    expect(comingSoon).toContain('roadmap.map(');
  });

  it('does not promise a confirmation email was sent merely because the URL was opened', () => {
    expect(subscribed).toContain('if you signed up for launch updates');
    expect(subscribed).not.toContain("we've sent you an email");
    expect(subscribed).toContain('promo={false}');
  });
});
