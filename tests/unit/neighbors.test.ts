import { describe, expect, it } from 'vitest';
import {
  buildCatalog, type CatalogInput, type CatalogLesson, type LessonFile,
} from '../../src/lessons/catalog';
import { lessonNeighbors } from '../../src/lessons/neighbors';

// All fixtures are labeled samples, not clinical content.
const labels = ['L01', 'L02', 'L03', 'L04', 'L05'];
const units = [
  { id: 'U00', title: '[sample unit zero]', topics: [{
    id: 'U00-T01', title: '[sample topic]', lessons:
      labels.map((suffix, index) => ({
        lesson_id: 'U00-T01-' + suffix, title: '[sample ' + suffix + ']', row: index + 2,
      })),
  }] },
  { id: 'U01', title: '[sample unit one]', topics: [{
    id: 'U01-T01', title: '[sample topic]', lessons: [
      { lesson_id: 'U01-T01-L01', title: '[sample sole lesson]', row: 7 },
    ],
  }] },
];
const ids = labels.map((suffix) => 'u00-t01-' + suffix.toLowerCase());
const single = 'u01-t01-l01';
const lesson = (id: string, status = 'published'): LessonFile => ({
  id,
  data: { title: '[sample ' + id + ']', summary: '[sample summary]', course: '[sample course]', order: 1, status },
});
function visibleCatalog(statuses: Record<string, string> = {}) {
  const input: CatalogInput = {
    lessons: [...ids, single].map((id) => lesson(id, statuses[id] ?? 'published')),
    cards: [], fillIn: [], organizer: [], units,
  };
  const catalog = buildCatalog(input);
  expect(catalog.problems).toEqual([]);
  return catalog;
}
function find(catalog: ReturnType<typeof visibleCatalog>, id: string): CatalogLesson {
  const found = catalog.lessons.find((item) => item.id === id);
  if (!found) throw new Error('missing sample lesson');
  return found;
}

describe('lessonNeighbors', () => {
  it('gives the first lesson only a next lesson in the same unit', () => {
    const catalog = visibleCatalog();
    const result = lessonNeighbors(catalog, find(catalog, ids[0]!));
    expect(result.previous).toBeUndefined();
    expect(result.next).toEqual({ href: '/learn/' + ids[1], name: '[sample ' + ids[1] + ']' });
    expect(result.back).toEqual({ href: '/learn', label: 'back to units in the course library' });
  });

  it('gives a middle lesson the names and addresses of both neighbors', () => {
    const catalog = visibleCatalog();
    const result = lessonNeighbors(catalog, find(catalog, ids[2]!));
    expect(result.previous).toEqual({ href: '/learn/' + ids[1], name: '[sample ' + ids[1] + ']' });
    expect(result.next).toEqual({ href: '/learn/' + ids[3], name: '[sample ' + ids[3] + ']' });
  });

  it('gives the last lesson only its previous lesson, never a lesson in another unit', () => {
    const catalog = visibleCatalog();
    const result = lessonNeighbors(catalog, find(catalog, ids[4]!));
    expect(result.previous?.href).toBe('/learn/' + ids[3]);
    expect(result.next).toBeUndefined();
  });

  it('gives a single-lesson unit no previous or next lesson', () => {
    const catalog = visibleCatalog();
    const result = lessonNeighbors(catalog, find(catalog, single));
    expect(result.previous).toBeUndefined();
    expect(result.next).toBeUndefined();
    expect(result.back.href).toBe('/learn');
  });

  it('skips hidden draft/in-review lessons but includes labeled samples', () => {
    const catalog = visibleCatalog({ [ids[1]!]: 'draft', [ids[2]!]: 'sample', [ids[3]!]: 'in_review' });
    const result = lessonNeighbors(catalog, find(catalog, ids[2]!));
    expect(result.previous?.href).toBe('/learn/' + ids[0]);
    expect(result.next?.href).toBe('/learn/' + ids[4]);
    expect(catalog.lessons.map(({ id }) => id)).not.toContain(ids[1]);
    expect(catalog.lessons.map(({ id }) => id)).not.toContain(ids[3]);
  });

  it('fails closed for a hidden or unknown current lesson', () => {
    const catalog = visibleCatalog({ [ids[2]!]: 'draft' });
    const result = lessonNeighbors(catalog, { id: ids[2]!, unitId: 'U00' });
    expect(result.previous).toBeUndefined();
    expect(result.next).toBeUndefined();
  });

  it('never crosses units even if the visible catalog interleaves them', () => {
    const catalog = visibleCatalog();
    const first = find(catalog, ids[0]!);
    const second = find(catalog, ids[1]!);
    const otherUnit = find(catalog, single);
    const interleaved = { lessons: [first, otherUnit, second] };
    const firstNeighbors = lessonNeighbors(interleaved, first);
    expect(firstNeighbors.previous).toBeUndefined();
    expect(firstNeighbors.next).toEqual({ href: second.href, name: second.name });
    const otherNeighbors = lessonNeighbors(interleaved, otherUnit);
    expect(otherNeighbors.previous).toBeUndefined();
    expect(otherNeighbors.next).toBeUndefined();
  });

  it('fails closed when the visible catalog is empty or the current unit is unknown', () => {
    const empty = { lessons: [] };
    const expectedBack = { href: '/learn', label: 'back to units in the course library' };
    expect(lessonNeighbors(empty, { id: ids[0]!, unitId: 'U00' })).toEqual({
      previous: undefined, next: undefined, back: expectedBack,
    });
    const catalog = visibleCatalog();
    expect(lessonNeighbors(catalog, { id: ids[0]!, unitId: 'U99' })).toEqual({
      previous: undefined, next: undefined, back: expectedBack,
    });
  });

  it('does not invent neighbors for an older lesson outside the curriculum', () => {
    const result = lessonNeighbors(visibleCatalog(), { id: 'study-skills-01', unitId: undefined });
    expect(result).toEqual({
      previous: undefined, next: undefined,
      back: { href: '/learn', label: 'back to course library' },
    });
  });
});
