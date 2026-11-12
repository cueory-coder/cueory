import { describe, expect, it } from 'vitest';
import { studyModes } from '../../src/config/modes';
import {
  buildCatalog, HUB_ORDER, type CatalogInput, type CompanionFile, type LessonFile,
} from '../../src/lessons/catalog';
import { lessonModeTiles } from '../../src/lessons/lessonmodes';

// Test data is deliberately non-clinical.
const lesson = (id: string, status: string): LessonFile => ({
  id,
  data: { title: '[sample lesson]', summary: '[sample summary]', status, course: '[sample course]', order: 1 },
});
const companion = (id: string, owner: string, status: string): CompanionFile => ({
  id, data: { lesson: owner, status },
});
const unit = [{
  id: 'U00', title: '[sample unit]', topics: [{
    id: 'U00-T01', title: '[sample topic]', lessons: [
      { lesson_id: 'U00-T01-L01', title: '[sample lesson]', row: 2 },
    ],
  }],
}];
const input = (overrides: Partial<CatalogInput> = {}): CatalogInput => ({
  lessons: [lesson('u00-t01-l01', 'published')],
  cards: [], fillIn: [], organizer: [], units: unit, ...overrides,
});

describe('lessonModeTiles', () => {
  it('links all seven modes when the visible catalog contains every companion', () => {
    const catalog = buildCatalog(input({
      lessons: [lesson('study-skills-01', 'placeholder')],
      cards: [companion('deck', 'study-skills-01', 'sample')],
      fillIn: [companion('blank', 'study-skills-01', 'sample')],
      organizer: [companion('groups', 'study-skills-01', 'sample')],
    }));
    expect(catalog.problems).toEqual([]);
    const tiles = lessonModeTiles(catalog.lessons[0]!, studyModes);
    expect(tiles.map(({ mode }) => mode.id)).toEqual(HUB_ORDER);
    expect(tiles.map(({ href }) => href)).toEqual([
      '/learn/study-skills/cards', '/learn/study-skills/learn-mode',
      '/learn/study-skills/matching', '/learn/study-skills/organizer',
      '/learn/study-skills/fill-in', '/learn/study-skills/label-it', '/learn/study-skills/questions',
    ]);
    expect(tiles.every(({ linkLabel }) => linkLabel.length > 0)).toBe(true);
  });

  it('links some modes and excludes draft or in-review companions', () => {
    const catalog = buildCatalog(input({
      cards: [companion('deck', 'u00-t01-l01', 'sample')],
      organizer: [companion('groups', 'u00-t01-l01', 'draft')],
      fillIn: [companion('blank', 'u00-t01-l01', 'in_review')],
    }));
    const tiles = lessonModeTiles(catalog.lessons[0]!, studyModes);
    expect(tiles.filter(({ href }) => href).map(({ mode }) => mode.id)).toEqual(['cards', 'learn', 'matching']);
    expect(tiles.filter(({ href }) => !href).map(({ mode }) => mode.id))
      .toEqual(['organizer', 'fill-in', 'label-it', 'questions']);
  });

  it('shows seven unavailable modes when no companion is visible', () => {
    const catalog = buildCatalog(input());
    const tiles = lessonModeTiles(catalog.lessons[0]!, studyModes);
    expect(tiles).toHaveLength(HUB_ORDER.length);
    expect(tiles.every(({ href }) => href === undefined)).toBe(true);
    // Existing home-page links must never be reused as a fallback.
    expect(studyModes.some(({ link }) => !!link)).toBe(true);
  });

  it('does not link routes that belong to a different lesson', () => {
    const bad = {
      href: '/learn/u00-t01-l01',
      modes: [{ id: 'cards' as const, href: '/learn/study-skills/cards' }],
    };
    expect(lessonModeTiles(bad, studyModes).find(({ mode }) => mode.id === 'cards')?.href)
      .toBeUndefined();
  });

  it('throws for a missing study-mode definition', () => {
    const catalog = buildCatalog(input());
    expect(() => lessonModeTiles(catalog.lessons[0]!, studyModes.filter(({ id }) => id !== 'cards')))
      .toThrow(/cards/);
  });
});
