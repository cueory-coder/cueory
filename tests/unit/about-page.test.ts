import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../src/pages/about.astro', import.meta.url), 'utf8');
const markup = source.slice(source.indexOf('<Layout'));

describe('about page shell', () => {
  it('keeps one h1 and the reference design sections in order', () => {
    const headings = [...markup.matchAll(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((match) => ({
      level: Number(match[1]),
      text: match[2]!.trim(),
    }));

    expect(headings).toEqual([
      { level: 1, text: 'about cueory' },
      { level: 2, text: 'our mission' },
      { level: 2, text: 'how we make our lessons' },
      { level: 2, text: "what's coming" },
      { level: 2, text: 'help keep cueory free.' },
    ]);

    const sectionIds = [...markup.matchAll(/<section\b[^>]*aria-labelledby="([^"]+)"/g)].map((match) => match[1]);
    expect(sectionIds).toEqual(['mission-heading', 'lessons-heading', 'coming-heading', 'support-heading']);
    for (const id of sectionIds) {
      expect(markup).toContain(`id="${id}"`);
    }
  });

  it('leaves every text spot for Christian, including all lesson bullet points', () => {
    const paragraphs = [...markup.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)];
    expect(paragraphs).toHaveLength(8);
    for (const paragraph of paragraphs) {
      expect(paragraph[1]).toContain('data-placeholder="CHRISTIAN-TEXT"');
      expect(paragraph[2]!.trim()).toBe('[Christian writes this]');
    }

    const lessonBullets = [...markup.matchAll(/<li>\s*<p\b[^>]*data-placeholder="CHRISTIAN-TEXT"[^>]*>\[Christian writes this\]<\/p>\s*<\/li>/g)];
    expect(lessonBullets).toHaveLength(3);
  });

  it('uses the existing brand UI and does not index unfinished founder copy', () => {
    expect(markup).toMatch(/<Layout\b[\s\S]*?\bnoindex\b[\s\S]*?>/);
    expect(markup.match(/class="[^"]*\bveil\b/g)).toHaveLength(4);
    expect(markup).toContain('class="display');
    expect(markup).toContain('href="/#signup"');
    expect(markup).toContain('href="/support"');
    expect(markup).not.toMatch(/<script\b|<style\b|\sstyle=/i);
  });
});
