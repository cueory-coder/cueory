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

  it('renders the worksheet with blanks only and keeps every answer in the later answer key', () => {
    const sample = parseItems([
      { id: 'item-one', sentence: 'The jar contains [[honey]].' },
      { id: 'item-two', sentence: 'The sky is [[blue]].' },
    ]);
    const parts = sample.map((item) => sentenceParts(item.sentence));
    const blanks = parts.map(({ before, after }) => before + '__________' + after);
    expect(blanks).toEqual(['The jar contains __________.', 'The sky is __________.']);
    expect(blanks.join(' ')).not.toContain('honey');
    expect(blanks.join(' ')).not.toContain('blue');
    expect(parts.map(({ answer }) => answer)).toEqual(['honey', 'blue']);

    const worksheetStart = page.indexOf('<ol data-worksheet-items');
    const answerStart = page.indexOf('<section data-worksheet-answers');
    expect(worksheetStart).toBeGreaterThan(0);
    expect(answerStart).toBeGreaterThan(worksheetStart);
    const worksheetMarkup = page.slice(worksheetStart, answerStart);
    expect(worksheetMarkup).toContain('{parts.before}');
    expect(worksheetMarkup).toContain('{parts.after}');
    expect(worksheetMarkup).toContain('data-worksheet-blank');
    expect(worksheetMarkup).not.toContain('{parts.answer}');
    expect(page.slice(answerStart)).toContain('{parts.answer}');
    expect(page.slice(answerStart)).toContain('data-print-only');
  });

  it('forces the answers onto their own printed sheet without changing earlier print rules', () => {
    const start = css.indexOf('/* W09-3: printable fill-in worksheet;');
    expect(start).toBeGreaterThan(0);
    const block = css.slice(start);
    expect(block).toContain('@media print');
    expect(block).toContain('[data-print-fill-in] [data-worksheet-answers]');
    expect(block).toContain('page-break-before: always !important');
    expect(block).toContain('break-before: page !important');
    expect(block).toContain('display: block !important');
    expect(block).toContain('background-color: white !important');
    expect(block).toContain('color: black !important');
    expect(block).toContain('break-inside: avoid');
    expect(css.slice(0, start)).toContain('/* W09-2: paper flashcard sheets.');
    expect(block).not.toMatch(/#[\da-f]{3,8}\b|\brgb\s*\(|\bhsl\s*\(/i);
  });
});
