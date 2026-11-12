
import { describe, expect, it } from 'vitest';
import { buildCatalog, type CatalogInput } from '../../src/lessons/catalog';
import { visibleProgressDecks, visibleProgressLessons } from '../../src/islands/progressview';
import { emptyProgress, withPile } from '../../src/scripts/progress';
import { progressView } from '../../src/islands/progressview';

// No real lessons or answer material: each fixture is labeled sample content.
const lesson = (id: string, status: string) => ({
  id,
  data: { title: '[sample lesson]', summary: '[sample summary]', status, course: 'med-surg-1', order: 1 },
});
const companion = (id: string, lessonId: string, status: string) => ({
  id, data: { lesson: lessonId, status },
});

const input: CatalogInput = {
  units: [{
    id: 'U01', title: '[sample unit]', topics: [{
      id: 'U01-T01', title: '[sample topic]',
      lessons: [
        { lesson_id: 'U01-T01-L01', title: '[sample draft owner]', row: 1 },
        { lesson_id: 'U01-T01-L02', title: '[sample visible owner]', row: 2 },
        { lesson_id: 'U01-T01-L03', title: '[sample visible owner]', row: 3 },
        { lesson_id: 'U01-T01-L04', title: '[sample review owner]', row: 4 },
      ],
    }],
  }],
  lessons: [
    lesson('study-skills-01', 'placeholder'),
    lesson('u01-t01-l01', 'draft'),
    lesson('u01-t01-l02', 'published'),
    lesson('u01-t01-l03', 'published'),
    lesson('u01-t01-l04', 'in_review'),
  ],
  cards: [
    companion('open-deck', 'study-skills-01', 'placeholder'),
    companion('draft-deck', 'u01-t01-l03', 'draft'),
    companion('in-review-deck', 'u01-t01-l02', 'in_review'),
    companion('hidden-owner-deck', 'u01-t01-l01', 'published'),
    companion('review-owner-deck', 'u01-t01-l04', 'published'),
    companion('open-unit-deck', 'u01-t01-l03', 'sample'),
  ],
  fillIn: [],
  organizer: [],
};

const cardSources = [
  { id: 'open-deck', data: { title: '[sample visible deck]', cards: [{ id: 'open-1' }] } },
  { id: 'open-unit-deck', data: { title: '[sample unit deck]', cards: [{ id: 'unit-1' }, { id: 'unit-2' }] } },
  { id: 'draft-deck', data: { title: '[sample draft deck]', cards: [{ id: 'draft-card' }] } },
  { id: 'in-review-deck', data: { title: '[sample in-review deck]', cards: [{ id: 'review-card' }] } },
  { id: 'hidden-owner-deck', data: { title: '[sample hidden owner deck]', cards: [{ id: 'owner-card' }] } },
  { id: 'review-owner-deck', data: { title: '[sample review owner deck]', cards: [{ id: 'review-owner-card' }] } },
];

describe('progress page props respect canonical catalog visibility', () => {
  const catalog = buildCatalog(input);

  it('builds the fixture catalog without problems, omitting draft and in-review owners', () => {
    expect(catalog.problems).toEqual([]);
    expect(catalog.lessons.map((entry) => entry.id)).toEqual([
      'study-skills-01', 'u01-t01-l02', 'u01-t01-l03',
    ]);
    expect(catalog.lessons.filter((entry) => entry.cards).map((entry) => entry.cards?.id)).toEqual([
      'open-deck', 'open-unit-deck',
    ]);
  });

  it('serializes only visible companion deck titles, ids and card ids', () => {
    // This function is the exact path used to construct ProgressPanel props in progress.astro.
    const pageProps = visibleProgressDecks(catalog, cardSources);
    expect(pageProps).toEqual([
      { id: 'open-deck', title: '[sample visible deck]', cardIds: ['open-1'] },
      { id: 'open-unit-deck', title: '[sample unit deck]', cardIds: ['unit-1', 'unit-2'] },
    ]);

    const serialized = JSON.stringify(pageProps);
    for (const hidden of [
      'draft-deck', 'draft-card', '[sample draft deck]',
      'in-review-deck', 'review-card', '[sample in-review deck]',
      'hidden-owner-deck', 'owner-card', '[sample hidden owner deck]',
      'review-owner-deck', 'review-owner-card', '[sample review owner deck]',
    ]) {
      expect(serialized).not.toContain(hidden);
    }
  });

  it('builds a safe lesson list for the next course-level progress screen', () => {
    const lessons = visibleProgressLessons(catalog);
    expect(lessons).toEqual([
      { id: 'study-skills-01', courseId: 'legacy:how to study for nursing school', courseName: 'how to study for nursing school', deckId: 'open-deck' },
      { id: 'u01-t01-l02', courseId: 'med-surg-1', courseName: 'med-surg i', deckId: null },
      { id: 'u01-t01-l03', courseId: 'med-surg-1', courseName: 'med-surg i', deckId: 'open-unit-deck' },
    ]);
    const pageProps = { decks: visibleProgressDecks(catalog, cardSources), lessons };
    const serialized = JSON.stringify(pageProps);
    for (const forbidden of [
      'u01-t01-l01', 'u01-t01-l04', 'hidden-owner-deck', 'review-owner-deck',
      'draft-deck', 'in-review-deck', '[sample hidden owner deck]', 'owner-card',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('keeps saved hidden-deck data as retired without counting it in active totals', () => {
    const saved = withPile(emptyProgress(), 'hidden-owner-deck', 'owner-card', 'know');
    const visible = visibleProgressDecks(catalog, cardSources);
    const summary = progressView(saved, visible);
    expect(summary.overall).toEqual({ know: 0, learning: 0, notStarted: 3, total: 3 });
    expect(summary.decks.find((deck) => deck.id === 'hidden-owner-deck')).toMatchObject({
      retired: true, know: 1, learning: 0, total: null, notStarted: null,
    });
    expect(visible.some((deck) => deck.id === 'hidden-owner-deck')).toBe(false);
  });

  it('ignores an unknown deck not attached to any catalog lesson', () => {
    const extra = { id: 'orphan', data: { title: '[sample orphan]', cards: [{ id: 'orphan-card' }] } };
    const props = visibleProgressDecks(catalog, [...cardSources, extra]);
    expect(JSON.stringify(props)).not.toContain('orphan');
    expect(props).toHaveLength(2);
  });
});
