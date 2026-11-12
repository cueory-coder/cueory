import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProgressRing from '../../src/islands/ProgressRing';
import { courseLessonProgress, courseProgressWords, type VisibleProgressLesson } from '../../src/islands/progressview';
import { emptyProgress, withPile, withStars } from '../../src/scripts/progress';

const forbidden = /\b(?:master|mastered|mastery)\b/i;
const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url));

/** Inspect only static text a student can read, not TypeScript variables or comments. */
function studentFacingLiterals(source: string): string[] {
  const text: string[] = [];

  // Native JSX/Astro text nodes. Interpolated {expressions} are program code, not literal wording.
  // Self-closing JSX tags never have text children. Do not read adjacent code comments as page text.
  const nodeText = /<(?:h[1-6]|p|span|button|label|a|div|li|strong|em|small|output|summary|option|figcaption)\b[^<>]*?(?<!\/)>([^<]*)</gi;
  for (const match of source.matchAll(nodeText)) {
    const literal = match[1]!.replace(/\{[^{}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
    if (literal) text.push(literal);
  }

  // Static accessibility, tooltip and placeholder text. Dynamic properties need browser tests.
  const attributes = /\b(?:aria-label|aria-valuetext|title|alt|placeholder)\s*=\s*(["'])(.*?)\1/g;
  for (const match of source.matchAll(attributes)) text.push(match[2]!);

  // Student-facing labels and descriptions defined as quoted configuration values.
  const configLiterals = /\b(?:label|title|description|heading)\s*:\s*(["'])(.*?)\1/g;
  for (const match of source.matchAll(configLiterals)) text.push(match[2]!);

  return text;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filename = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(filename);
    return /\.(astro|tsx?|jsx?)$/.test(entry.name) ? [filename] : [];
  });
}

describe('Task 522 student-facing progress words', () => {
  it('ignores internal identifiers and JSX expressions while catching visible wording', () => {
    expect(studentFacingLiterals('const progress = total > 0 ? mastered / total : 0;')).toEqual([]);
    expect(studentFacingLiterals('<div aria-valuenow={mastered} />')).toEqual([]);
    expect(studentFacingLiterals('<p>recalled today {mastered} of {total}</p>')).toEqual(['recalled today of']);
    expect(studentFacingLiterals('<p>Mastered {mastered} of {total}</p>')).toContain('Mastered of');
    expect(studentFacingLiterals('<div aria-label="Cards mastered" />')).toContain('Cards mastered');
    expect(studentFacingLiterals('<span aria-hidden="true" />;\n/** internal implementation: mastered */\n<p>recalled today</p>')).toEqual(['recalled today']);
  });

  it('uses no forbidden progress words in static student-visible text or accessible labels', () => {
    const sources = ['components', 'pages', 'layouts', 'config']
      .flatMap((dir) => filesUnder(join(srcRoot, dir)));
    sources.push(join(srcRoot, 'islands/LearnSession.tsx'));

    const violations: string[] = [];
    for (const file of sources) {
      const content = readFileSync(file, 'utf8');
      for (const literal of studentFacingLiterals(content)) {
        if (forbidden.test(literal)) {
          violations.push(file.replace(srcRoot, 'src/') + ': ' + literal);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

const progressLessons: VisibleProgressLesson[] = [
  { id: 'sample-one', courseId: 'sample-course', courseName: '[sample course]', deckId: 'sample-deck-one' },
  { id: 'sample-two', courseId: 'sample-course', courseName: '[sample course]', deckId: 'sample-deck-two' },
  { id: 'sample-three', courseId: 'sample-course', courseName: '[sample course]', deckId: null },
];
const progressDecks = [
  { id: 'sample-deck-one', title: '[sample deck one]', cardIds: ['a', 'b'] },
  { id: 'sample-deck-two', title: '[sample deck two]', cardIds: ['c'] },
];
const progressCourses = [
  { id: 'sample-course', name: '[sample course]' },
  { id: 'empty-course', name: '[sample empty course]' },
];

describe('per-course lesson progress with visible words', () => {
  it('formats zero, some, all, singular and a course with no lessons', () => {
    expect(courseProgressWords(0, 3)).toBe('0 of 3 lessons started');
    expect(courseProgressWords(1, 3)).toBe('1 of 3 lessons started');
    expect(courseProgressWords(3, 3)).toBe('3 of 3 lessons started');
    expect(courseProgressWords(1, 1)).toBe('1 of 1 lesson started');
    expect(courseProgressWords(4, 12)).toBe('4 of 12 lessons started');
    expect(courseProgressWords(0, 0)).toBe('no published lessons to track yet.');
  });

  it('includes visible cardless lessons and courses with no published lessons', () => {
    expect(courseLessonProgress(emptyProgress(), progressLessons, progressDecks, progressCourses)).toEqual([
      { id: 'sample-course', name: '[sample course]', started: 0, total: 3, words: '0 of 3 lessons started' },
      { id: 'empty-course', name: '[sample empty course]', started: 0, total: 0, words: 'no published lessons to track yet.' },
    ]);
  });

  it('counts sorted and starred visible cards as started, but never hidden decks', () => {
    let progress = withPile(emptyProgress(), 'sample-deck-one', 'a', 'learning');
    progress = withStars(progress, 'sample-deck-two', ['c']);
    progress = withPile(progress, 'hidden-deck', 'secret', 'know');
    const [summary] = courseLessonProgress(progress, progressLessons, progressDecks, progressCourses);
    expect(summary).toMatchObject({ started: 2, total: 3, words: '2 of 3 lessons started' });
  });

  it('does not count stale card ids or retired decks', () => {
    let progress = withPile(emptyProgress(), 'sample-deck-one', 'retired-card', 'know');
    progress = withPile(progress, 'retired-deck', 'secret', 'learning');
    const [summary] = courseLessonProgress(progress, progressLessons, progressDecks, progressCourses);
    expect(summary).toMatchObject({ started: 0, total: 3, words: '0 of 3 lessons started' });
  });

  it('reports all started only when every tracked lesson has current activity', () => {
    let progress = withPile(emptyProgress(), 'sample-deck-one', 'a', 'know');
    progress = withPile(progress, 'sample-deck-two', 'c', 'learning');
    const tracked = progressLessons.filter((lesson) => lesson.deckId !== null);
    const [summary] = courseLessonProgress(progress, tracked, progressDecks, progressCourses);
    expect(summary).toMatchObject({ started: 2, total: 2, words: '2 of 2 lessons started' });
  });

  it('deduplicates lesson ids and keeps courses separate', () => {
    const lessons = [
      ...progressLessons,
      progressLessons[0]!,
      { id: 'different', courseId: 'other', courseName: '[sample other]', deckId: 'sample-deck-one' },
    ];
    const result = courseLessonProgress(withPile(emptyProgress(), 'sample-deck-one', 'a', 'know'), lessons, progressDecks, progressCourses);
    expect(result.map((course) => [course.id, course.started, course.total])).toEqual([
      ['sample-course', 1, 3], ['empty-course', 0, 0], ['other', 1, 1],
    ]);
  });

  it('a star on a removed card does not mark a lesson started', () => {
    const progress = withStars(emptyProgress(), 'sample-deck-one', ['removed-card']);
    const [summary] = courseLessonProgress(progress, progressLessons, progressDecks, progressCourses);
    expect(summary).toMatchObject({
      started: 0,
      total: 3,
      words: '0 of 3 lessons started',
    });
  });

  it('renders zero-total rings without invalid SVG numbers or fake progress arcs', () => {
    const html = renderToStaticMarkup(createElement(ProgressRing, {
      know: 0, learning: 0, notStarted: 0,
    }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).not.toContain('stroke-dasharray');
  });

  it('keeps the SVG ring decorative and without animation', () => {
    const html = renderToStaticMarkup(createElement(ProgressRing, { know: 1, learning: 0, notStarted: 2 }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain('aria-label=');
    expect(html).not.toContain('animation');
    expect(html).not.toContain('transition');
  });
});
