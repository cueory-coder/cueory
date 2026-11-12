import { describe, expect, it } from 'vitest';
import { buildCatalog, type LessonFile } from '../../src/lessons/catalog';
import { hasCurriculumLessons, unitAvailability } from '../../src/lessons/availability';
import type { MapUnit } from '../../src/islands/lessonmap';

const units: MapUnit[] = [
  { id: 'U01', title: '[sample unit one]', topics: [
    { id: 'U01-T01', title: '[sample topic one]', lessons: [
      { lesson_id: 'U01-T01-L01', title: '[sample lesson one]', row: 2 },
    ] },
  ] },
  { id: 'U02', title: '[sample unit two]', topics: [
    { id: 'U02-T01', title: '[sample topic two]', lessons: [
      { lesson_id: 'U02-T01-L01', title: '[sample lesson two]', row: 3 },
    ] },
  ] },
];

function lesson(id: string, status: string): LessonFile {
  return {
    id,
    data: { title: '[sample lesson]', summary: '[sample summary]', status,
      course: '[sample course]', order: 1 },
  };
}

function catalog(lessons: LessonFile[]) {
  const result = buildCatalog({ lessons, cards: [], fillIn: [], organizer: [], units });
  expect(result.problems).toEqual([]);
  return result.lessons;
}

describe('unit availability from the built lesson catalog', () => {
  it('shows an empty state when there are no built lessons', () => {
    const availability = unitAvailability(catalog([]), 'U01');
    expect(availability).toEqual({ hasLessons: false, open: [] });
  });

  it('never counts draft or in-review lessons as available', () => {
    const lessons = catalog([
      lesson('u01-t01-l01', 'draft'),
      lesson('u02-t01-l01', 'in_review'),
    ]);
    expect(unitAvailability(lessons, 'U01').hasLessons).toBe(false);
    expect(hasCurriculumLessons(lessons)).toBe(false);
  });

  it('lists built lessons only in their own unit with real routes', () => {
    const lessons = catalog([
      lesson('u01-t01-l01', 'published'),
      lesson('u02-t01-l01', 'published'),
    ]);
    expect(unitAvailability(lessons, 'U01')).toEqual({
      hasLessons: true, open: [{ href: '/learn/u01-t01-l01', name: '[sample lesson]' }],
    });
    expect(unitAvailability(lessons, 'U02').open).toHaveLength(1);
    expect(unitAvailability(lessons, 'U99')).toEqual({ hasLessons: false, open: [] });
    expect(hasCurriculumLessons(lessons)).toBe(true);
  });

  it('counts reachable labeled samples as open but not a legacy sample as a curriculum lesson', () => {
    const legacy = catalog([lesson('study-skills-01', 'sample')]);
    expect(unitAvailability(legacy, 'U01').hasLessons).toBe(false);
    expect(hasCurriculumLessons(legacy)).toBe(false);
    const sample = catalog([lesson('u01-t01-l01', 'placeholder')]);
    expect(unitAvailability(sample, 'U01').hasLessons).toBe(true);
    expect(hasCurriculumLessons(sample)).toBe(true);
  });

  it('does not mutate or reorder the public catalog', () => {
    const lessons = catalog([lesson('u02-t01-l01', 'published'), lesson('u01-t01-l01', 'published')]);
    const before = structuredClone(lessons);
    unitAvailability(lessons, 'U01');
    expect(lessons).toEqual(before);
  });
});
