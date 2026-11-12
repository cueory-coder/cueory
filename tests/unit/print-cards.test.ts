import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MapUnit } from '../../src/islands/lessonmap';
import { buildCatalog, pathsFor, type CatalogInput, type CompanionFile, type LessonFile } from '../../src/lessons/catalog';

const page = readFileSync(join(process.cwd(), 'src/pages/learn/[lesson]/print-cards.astro'), 'utf8');
const css = readFileSync(join(process.cwd(), 'src/styles/print.css'), 'utf8');
const units: MapUnit[] = [{
  id: 'U00', title: '[sample unit]', topics: [{
    id: 'U00-T01', title: '[sample topic]', lessons: [
      { lesson_id: 'U00-T01-L01', title: '[sample lesson 1]', row: 2 },
      { lesson_id: 'U00-T01-L02', title: '[sample lesson 2]', row: 3 },
      { lesson_id: 'U00-T01-L03', title: '[sample lesson 3]', row: 4 },
      { lesson_id: 'U00-T01-L04', title: '[sample lesson 4]', row: 5 },
    ],
  }],
}];
const lesson = (id: string, status: string): LessonFile => ({
  id, data: { title: '[sample lesson]', summary: '[sample summary]', status, course: '[sample course]', order: 1 },
});
const deck = (id: string, owner: string, status: string): CompanionFile => ({ id, data: { lesson: owner, status } });
const input: CatalogInput = {
  units,
  lessons: [
    lesson('study-skills-01', 'placeholder'),
    lesson('u00-t01-l01', 'published'),
    lesson('u00-t01-l02', 'published'),
    lesson('u00-t01-l03', 'draft'),
    lesson('u00-t01-l04', 'published'),
  ],
  cards: [
    deck('deck-sample', 'study-skills-01', 'placeholder'),
    deck('deck-published', 'u00-t01-l01', 'published'),
    deck('deck-hidden', 'u00-t01-l02', 'in_review'),
    deck('deck-draft-lesson', 'u00-t01-l03', 'published'),
  ],
  fillIn: [],
  organizer: [],
};

describe('W09-2 printable card routes', () => {
  it('builds exactly one sheet per visible lesson with a visible deck', () => {
    const catalog = buildCatalog(input);
    expect(catalog.problems).toEqual([]);
    const routes = pathsFor(catalog, 'cards');
    expect(routes.map(({ params }) => params.lesson)).toEqual(['study-skills', 'u00-t01-l01']);
    expect(routes.map(({ props }) => props.lesson.cards?.id)).toEqual(['deck-sample', 'deck-published']);
    expect(new Set(routes.map(({ params }) => params.lesson)).size).toBe(routes.length);
  });

  it('never publishes a hidden lesson, a hidden deck, or a lesson without cards', () => {
    const catalog = buildCatalog(input);
    const routes = pathsFor(catalog, 'cards').map(({ params }) => params.lesson);
    expect(routes).not.toContain('u00-t01-l02');
    expect(routes).not.toContain('u00-t01-l03');
    expect(routes).not.toContain('u00-t01-l04');
  });

  it('uses the same catalog filter and card collection as the live card page', () => {
    expect(page).toContain("return pathsFor(await lessonCatalog(), 'cards');");
    expect(page).toContain("getEntry('cards', lesson.cards.id)");
    expect(page).toContain("statusNotice(status, 'cards')");
    expect(page).toContain('noindex');
    expect(page).toContain('promo={false}');
  });

  it('keeps card fronts, backs and approved visual credits as static text', () => {
    expect(page).toContain('{card.front}');
    expect(page).toContain('{card.back}');
    expect(page).toContain('data-print-card-list');
    expect(page).toContain('data-card-side="front"');
    expect(page).toContain('data-card-side="back"');
    expect(page).toContain('visualsForLesson(');
    expect(page).toContain('creditsFor(shownVisuals)');
    expect(page).toContain('{book.credit}');
    expect(page).not.toContain('client:only');
  });

  it('prints plain black and white two-column pairs without splitting cards', () => {
    const start = css.indexOf('/* W09-2: paper flashcard sheets.');
    expect(start).toBeGreaterThan(0);
    const block = css.slice(start);
    expect(block).toContain('@media print');
    expect(block).toContain('body:has([data-print-cards])');
    expect(block).toContain('color: black !important');
    expect(block).toContain('background-color: white !important');
    expect(block).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(block).toContain('break-inside: avoid');
    expect(block).toContain('page-break-inside: avoid');
    expect(block).toContain('column-gap: var(--spacing-stack)');
    expect(block).toContain('margin-block-start: var(--spacing-stack)');
    expect(block).not.toMatch(/#[\da-f]{3,8}\b|\brgb\s*\(|\bhsl\s*\(/i);
  });
});
