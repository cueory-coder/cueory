import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MapUnit } from '../../src/islands/lessonmap';
import { parseItems, sentenceParts } from '../../src/islands/fillin';
import { buildCatalog, pathsFor, type CatalogInput, type CompanionFile, type LessonFile } from '../../src/lessons/catalog';

const page = readFileSync(join(process.cwd(), 'src/pages/learn/[lesson]/print-fill-in.astro'), 'utf8');
const css = readFileSync(join(process.cwd(), 'src/styles/print.css'), 'utf8');
const units: MapUnit[] = [{
  id: 'U00', title: '[sample unit]', topics: [{
    id: 'U00-T01', title: '[sample topic]', lessons: [
      { lesson_id: 'U00-T01-L01', title: '[sample lesson 1]', row: 2 },
      { lesson_id: 'U00-T01-L02', title: '[sample lesson 2]', row: 3 },
      { lesson_id: 'U00-T01-L03', title: '[sample lesson 3]', row: 4 },
    ],
  }],
}];
const lesson = (id: string, status: string): LessonFile => ({
  id, data: { title: '[sample lesson]', summary: '[sample summary]', status, course: '[sample course]', order: 1 },
});
const set = (id: string, owner: string, status: string): CompanionFile => ({ id, data: { lesson: owner, status } });
const input: CatalogInput = {
  units,
  lessons: [
    lesson('study-skills-01', 'placeholder'),
    lesson('u00-t01-l01', 'published'),
    lesson('u00-t01-l02', 'published'),
    lesson('u00-t01-l03', 'draft'),
  ],
  fillIn: [
    set('set-sample', 'study-skills-01', 'sample'),
    set('set-visible', 'u00-t01-l01', 'sample'),
    set('set-hidden', 'u00-t01-l02', 'draft'),
    set('set-in-hidden-lesson', 'u00-t01-l03', 'sample'),
  ],
  cards: [],
  organizer: [],
};

describe('W09-3 printable fill-in worksheets', () => {
  it('creates one worksheet for each visible lesson with a visible fill-in set', () => {
    const catalog = buildCatalog(input);
    expect(catalog.problems).toEqual([]);
    const routes = pathsFor(catalog, 'fill-in');
    expect(routes.map(({ params }) => params.lesson)).toEqual(['study-skills', 'u00-t01-l01']);
    expect(routes.map(({ props }) => props.lesson.fillIn?.id)).toEqual(['set-sample', 'set-visible']);
    expect(new Set(routes.map(({ params }) => params.lesson)).size).toBe(routes.length);
  });

  it('never creates worksheets from hidden lessons or draft sets', () => {
    const catalog = buildCatalog(input);
    const routes = pathsFor(catalog, 'fill-in').map(({ params }) => params.lesson);
    expect(routes).not.toContain('u00-t01-l02');
    expect(routes).not.toContain('u00-t01-l03');
  });

  it('reuses the same item parser and catalog route filter as fill-in mode', () => {
    expect(page).toContain("return pathsFor(await lessonCatalog(), 'fill-in');");
    expect(page).toContain("getEntry('fill-in', lesson.fillIn.id)");
    expect(page).toContain('parseItems(entry.data.items)');
    expect(page).toContain('sentenceParts(item.sentence)');
    expect(page).toContain('noindex');
    expect(page).toContain('promo={false}');
    expect(page).not.toContain('client:only');
  });

  it('renders blanks without publishing answers in markup or serialized props', () => {
    const sample = parseItems([
      { id: 'item-one', sentence: 'The jar contains [[honey]].' },
      { id: 'item-two', sentence: 'The sky is [[blue]].' },
    ]);
    const blanks = sample.map((item) => {
      const { before, after } = sentenceParts(item.sentence);
      return before + '__________' + after;
    });
    expect(blanks).toEqual(['The jar contains __________.', 'The sky is __________.']);
    expect(page).toContain('return { before, after };');
    const markup = page.slice(page.indexOf('<Layout'));
    expect(markup).toContain('{parts.before}');
    expect(markup).toContain('{parts.after}');
    expect(markup).toContain('data-worksheet-blank');
    expect(markup).not.toMatch(/parts\.answer|data-worksheet-answers|data-answer-key|data-answer-item/);
    expect(markup).not.toContain('set:html');
    expect(markup).not.toMatch(/client:|JSON\.stringify/);
  });

  it('keeps answer keys out of the actual built worksheet HTML', () => {
    const html = readFileSync(join(process.cwd(), 'dist/learn/study-skills/print-fill-in.html'), 'utf8');
    expect(html).toContain('data-worksheet-blank');
    expect(html).not.toMatch(/data-worksheet-answers|data-answer-key|data-answer-item/);
    const sample = JSON.parse(readFileSync(join(process.cwd(), 'content/fill-in/study-skills-01.json'), 'utf8'));
    for (const item of parseItems(sample.items)) {
      const { answer } = sentenceParts(item.sentence);
      expect(html.toLowerCase()).not.toContain(answer.toLowerCase());
    }
  });

  it('prints unbroken prompts with existing paper tokens and no answer-sheet rules', () => {
    const start = css.indexOf('/* W09-3: printable fill-in worksheet;');
    expect(start).toBeGreaterThan(0);
    const block = css.slice(start);
    expect(block).toContain('@media print');
    expect(block).toContain('display: block !important');
    expect(block).toContain('background-color: var(--print-paper) !important');
    expect(block).toContain('color: var(--print-ink) !important');
    expect(block).toContain('border-color: var(--print-ink) !important');
    expect(block).toContain('break-inside: avoid');
    expect(block).not.toContain('data-worksheet-answers');
    expect(css.slice(0, start)).toContain('/* W09-2: paper flashcard sheets.');
    expect(block).not.toMatch(/(?:color|background-color|border-color)\s*:\s*(?:black|white)\b/i);
    expect(block).not.toMatch(/#[\da-f]{3,8}\b|\brgb\s*\(|\bhsl\s*\(/i);
  });
});
