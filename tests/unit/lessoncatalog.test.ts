import { describe, expect, it } from 'vitest';
import type { MapUnit } from '../../src/islands/lessonmap';
import {
  buildCatalog, contentEntryId, countInWords, generatedRoutes, pathsFor, visibility,
  type CatalogInput, type CompanionFile, type LessonFile,
} from '../../src/lessons/catalog';
import { contentCatalog, lessonRoutes } from '../lessonroutes';

// Made-up outline and files: shapes only, no nursing content.
const units: MapUnit[] = [{
  id: 'U00', title: 'unit zero', topics: [
    { id: 'U00-T01', title: 'topic one', lessons: [
      { lesson_id: 'U00-T01-L01', title: 'first', row: 2 },
      { lesson_id: 'U00-T01-L02', title: 'second', row: 3 },
    ] },
  ],
}];
const lesson = (id: string, status: string, title = `title of ${id}`): LessonFile =>
  ({ id, data: { title, summary: 'summary', status, course: 'course', order: 1 } });
const companion = (id: string, owner: string, status: string): CompanionFile => ({ id, data: { lesson: owner, status } });
const input = (overrides: Partial<CatalogInput> = {}): CatalogInput =>
  ({ lessons: [], cards: [], fillIn: [], organizer: [], units, ...overrides });

describe('visibility', () => {
  it('shows published files normally, labels placeholders and samples, and hides everything else', () => {
    expect(visibility('published')).toBe('normal');
    expect(visibility('placeholder')).toBe('labeled');
    expect(visibility('sample')).toBe('labeled');
    for (const status of ['draft', 'in_review', 'approved', 'Published', '', undefined, null, 3]) {
      expect(visibility(status)).toBe('hidden');
    }
  });
});

describe('buildCatalog', () => {
  it('serves a curriculum lesson at its lowercase lesson id and names it from the lesson map', () => {
    const { lessons, problems } = buildCatalog(input({ lessons: [lesson('u00-t01-l02', 'published', 'my lesson')] }));
    expect(problems).toEqual([]);
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({
      id: 'u00-t01-l02', slug: 'u00-t01-l02', href: '/learn/u00-t01-l02', curriculumId: 'U00-T01-L02', unitId: 'U00',
      name: 'my lesson', context: 'unit zero · topic one', short: 'my lesson', about: 'my lesson', labeled: false, modes: [],
    });
  });

  it('keeps the older study-skills lesson at /learn/study-skills', () => {
    const { lessons } = buildCatalog(input({ lessons: [lesson('study-skills-01', 'placeholder')] }));
    expect(lessons[0]).toMatchObject({
      slug: 'study-skills', href: '/learn/study-skills', curriculumId: undefined, name: 'how to study for nursing school',
      context: 'how to study for nursing school · lesson 1', short: 'lesson 1',
      about: 'lesson 1 of how to study for nursing school', labeled: true,
    });
  });

  it('never builds a draft or in-review lesson, nor any of its study modes', () => {
    const { lessons, problems } = buildCatalog(input({
      lessons: [lesson('u00-t01-l01', 'draft'), lesson('u00-t01-l02', 'in_review')],
      cards: [companion('deck', 'u00-t01-l01', 'published')],
      fillIn: [companion('fill', 'u00-t01-l02', 'sample')],
    }));
    expect(problems).toEqual([]);
    expect(lessons).toEqual([]);
  });

  it('never builds a draft deck, fill-in or organizer, even for a published lesson', () => {
    const { lessons } = buildCatalog(input({
      lessons: [lesson('u00-t01-l01', 'published')],
      cards: [companion('deck', 'u00-t01-l01', 'draft')],
      fillIn: [companion('fill', 'u00-t01-l01', 'in_review')],
      organizer: [companion('sort', 'u00-t01-l01', 'draft')],
    }));
    expect(lessons[0]!.cards).toBeUndefined();
    expect(lessons[0]!.modes).toEqual([]);
  });

  it('lists each lesson\'s modes in the hub order, with labels kept for placeholders and samples', () => {
    const { lessons } = buildCatalog(input({
      lessons: [lesson('u00-t01-l01', 'published')],
      cards: [companion('deck', 'u00-t01-l01', 'placeholder')],
      fillIn: [companion('fill', 'u00-t01-l01', 'sample')],
      organizer: [companion('sort', 'u00-t01-l01', 'published')],
    }));
    const [only] = lessons;
    expect(only!.cards).toEqual({ id: 'deck', labeled: true });
    expect(only!.fillIn).toEqual({ id: 'fill', labeled: true });
    expect(only!.organizer).toEqual({ id: 'sort', labeled: false });
    expect(only!.modes).toEqual([
      { id: 'cards', href: '/learn/u00-t01-l01/cards' },
      { id: 'learn', href: '/learn/u00-t01-l01/learn-mode' },
      { id: 'matching', href: '/learn/u00-t01-l01/matching' },
      { id: 'organizer', href: '/learn/u00-t01-l01/organizer' },
      { id: 'fill-in', href: '/learn/u00-t01-l01/fill-in' },
    ]);
  });

  it('adds the hand-built label it and questions pages only to the lesson that has them', () => {
    const { lessons } = buildCatalog(input({ lessons: [lesson('study-skills-01', 'placeholder'), lesson('u00-t01-l01', 'published')] }));
    expect(lessons.map((entry) => entry.modes.map((mode) => mode.id))).toEqual([['label-it', 'questions'], []]);
    expect(lessons[0]!.modes[0]!.href).toBe('/learn/study-skills/label-it');
  });

  it('refuses a file name that is not a lesson id, an id missing from the map, and a missing lesson', () => {
    const { lessons, problems } = buildCatalog(input({
      lessons: [lesson('my-lesson', 'published'), lesson('u09-t09-l09', 'published'), lesson('u00-t01', 'published')],
      cards: [companion('deck', 'no-such-lesson', 'published')],
    }));
    expect(lessons).toEqual([]);
    expect(problems).toHaveLength(4);
    expect(problems[0]).toContain('content/lessons/my-lesson.json');
    expect(problems[1]).toContain('U09-T09-L09 is not in docs/curriculum/medsurg-lesson-map.csv');
    expect(problems[2]).toContain('content/lessons/u00-t01.json');
    expect(problems[3]).toContain('content/cards/deck.json: its lesson "no-such-lesson"');
  });

  it('refuses two shown files of one mode for the same lesson, but not a shown file beside a draft', () => {
    const twice = buildCatalog(input({
      lessons: [lesson('u00-t01-l01', 'published')],
      cards: [companion('a', 'u00-t01-l01', 'published'), companion('b', 'u00-t01-l01', 'placeholder')],
    }));
    expect(twice.problems).toEqual([expect.stringContaining('content/cards/b.json: lesson "u00-t01-l01" already has cards in a.json')]);
    const withDraft = buildCatalog(input({
      lessons: [lesson('u00-t01-l01', 'published')],
      cards: [companion('a', 'u00-t01-l01', 'draft'), companion('b', 'u00-t01-l01', 'published')],
    }));
    expect(withDraft.problems).toEqual([]);
    expect(withDraft.lessons[0]!.cards?.id).toBe('b');
  });

  it('orders older lessons first, then the curriculum in its own order', () => {
    const { lessons } = buildCatalog(input({
      lessons: [lesson('u00-t01-l02', 'published'), lesson('u00-t01-l01', 'published'), lesson('study-skills-01', 'placeholder')],
    }));
    expect(lessons.map((entry) => entry.slug)).toEqual(['study-skills', 'u00-t01-l01', 'u00-t01-l02']);
  });
});

describe('contentEntryId', () => {
  it('gives the id Astro gives a content file', () => {
    expect(contentEntryId('u00-t01-l01.json')).toBe('u00-t01-l01');
    expect(contentEntryId('U00-T01-L01.json')).toBe('u00-t01-l01');
    expect(contentEntryId('My Lesson!.json')).toBe('my-lesson');
    expect(contentEntryId('pulse/day 1.json')).toBe('pulse/day-1');
    expect(contentEntryId('study_skills.json')).toBe('study_skills');
  });
});

describe('paths and routes', () => {
  const catalog = buildCatalog(input({
    lessons: [lesson('study-skills-01', 'placeholder'), lesson('u00-t01-l01', 'published'), lesson('u00-t01-l02', 'published')],
    cards: [companion('deck', 'study-skills-01', 'placeholder')],
    fillIn: [companion('fill', 'u00-t01-l01', 'sample')],
  }));

  it('gives getStaticPaths one entry per lesson that has the mode', () => {
    expect(pathsFor(catalog, 'hub').map((path) => path.params.lesson)).toEqual(['study-skills', 'u00-t01-l01', 'u00-t01-l02']);
    expect(pathsFor(catalog, 'cards').map((path) => path.params.lesson)).toEqual(['study-skills']);
    expect(pathsFor(catalog, 'learn').map((path) => path.params.lesson)).toEqual(['study-skills']);
    expect(pathsFor(catalog, 'fill-in').map((path) => path.params.lesson)).toEqual(['u00-t01-l01']);
    expect(pathsFor(catalog, 'organizer')).toEqual([]);
    expect(pathsFor(catalog, 'cards')[0]!.props.lesson.cards).toEqual({ id: 'deck', labeled: true });
  });

  it('lists every generated address, and leaves the hand-built pages out', () => {
    expect(generatedRoutes(catalog)).toEqual([
      '/learn/study-skills', '/learn/study-skills/cards', '/learn/study-skills/learn-mode', '/learn/study-skills/matching',
      '/learn/u00-t01-l01', '/learn/u00-t01-l01/fill-in',
      '/learn/u00-t01-l02',
    ]);
  });

  it('counts the hub\'s ways in words', () => {
    expect([1, 5, 7].map(countInWords)).toEqual(['one', 'five', 'seven']);
    expect(countInWords(12)).toBe('12');
  });
});

describe('what /content builds today', () => {
  it('has no problems and keeps every study-skills address', () => {
    const catalog = contentCatalog();
    expect(catalog.problems).toEqual([]);
    expect(lessonRoutes).toEqual(expect.arrayContaining([
      '/learn/study-skills', '/learn/study-skills/cards', '/learn/study-skills/learn-mode', '/learn/study-skills/matching',
      '/learn/study-skills/organizer', '/learn/study-skills/fill-in',
    ]));
    const studySkills = catalog.lessons.find((entry) => entry.id === 'study-skills-01')!;
    expect(studySkills.modes.map((mode) => mode.id)).toEqual(['cards', 'learn', 'matching', 'organizer', 'fill-in', 'label-it', 'questions']);
  });

  it('shows only the labeled samples and placeholders already in /content (D-92)', () => {
    for (const entry of contentCatalog().lessons) {
      expect(entry.labeled).toBe(true);
      for (const part of [entry.cards, entry.fillIn, entry.organizer]) if (part) expect(part.labeled).toBe(true);
    }
  });
});
