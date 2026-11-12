import { describe, expect, it } from 'vitest';
import { curriculumStatus } from '../../src/lessons/curriculumstatus';
import type { MapUnit } from '../../src/islands/lessonmap';
import type { CatalogLesson } from '../../src/lessons/catalog';

const units: MapUnit[] = [
  {
    id: 'U01',
    title: '[sample unit]',
    topics: [{
      id: 'U01-T01',
      title: '[sample topic]',
      lessons: [
        { lesson_id: 'U01-T01-L01', title: '[sample lesson A]', row: 2 },
        { lesson_id: 'U01-T01-L02', title: '[sample lesson B]', row: 3 },
      ],
    }],
  },
];
const published = (curriculumId: string | undefined) => ({ curriculumId }) as Pick<CatalogLesson, 'curriculumId'>;

describe('curriculum build status', () => {
  it('marks a catalog lesson as built and counts it at every level', () => {
    const status = curriculumStatus(units, [published('U01-T01-L01')]);
    expect(status.lessonCount).toBe(2);
    expect(status.builtCount).toBe(1);
    expect(status.units[0]!.builtCount).toBe(1);
    expect(status.units[0]!.topics[0]!.builtCount).toBe(1);
    expect(status.units[0]!.topics[0]!.lessons[0]).toEqual({ id: 'U01-T01-L01', status: 'built' });
  });

  it('labels an unbuilt lesson in words without treating it as a link', () => {
    const status = curriculumStatus(units, []);
    expect(status.builtCount).toBe(0);
    expect(status.units[0]!.topics[0]!.lessons).toEqual([
      { id: 'U01-T01-L01', status: 'not built yet' },
      { id: 'U01-T01-L02', status: 'not built yet' },
    ]);
  });

  it('reports catalog entries absent from the curriculum map instead of counting them', () => {
    const status = curriculumStatus(units, [
      published('U99-T01-L01'), published('U01-T01-L01'), published('U88-T01-L01'),
    ]);
    expect(status.builtCount).toBe(1);
    expect(status.unmappedCatalogIds).toEqual(['U88-T01-L01', 'U99-T01-L01']);
  });

  it('ignores legacy catalog lessons that have no curriculum lesson ID', () => {
    const status = curriculumStatus(units, [published(undefined)]);
    expect(status.builtCount).toBe(0);
    expect(status.unmappedCatalogIds).toEqual([]);
  });

  it('retains unit, topic and lesson ID order and never copies lesson text', () => {
    const status = curriculumStatus(units, [published('U01-T01-L02')]);
    expect(status.units[0]!.title).toBe('[sample unit]');
    expect(status.units[0]!.topics[0]!.title).toBe('[sample topic]');
    expect(status.units[0]!.topics[0]!.lessons.map((lesson) => lesson.id))
      .toEqual(['U01-T01-L01', 'U01-T01-L02']);
    expect(JSON.stringify(status)).not.toContain('[sample lesson A]');
    expect(JSON.stringify(status)).not.toContain('[sample lesson B]');
  });

  it('does not mutate the supplied map or catalog', () => {
    const catalog = [published('U01-T01-L01')];
    const before = JSON.stringify({ units, catalog });
    curriculumStatus(units, catalog);
    expect(JSON.stringify({ units, catalog })).toBe(before);
  });

  it('handles an empty curriculum without inventing units or lessons', () => {
    expect(curriculumStatus([], [])).toEqual({
      units: [], lessonCount: 0, builtCount: 0, unmappedCatalogIds: [],
    });
  });
});
