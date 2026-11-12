import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../../src/pages/learn/[lesson]/index.astro', import.meta.url), 'utf8');
const learnPage = readFileSync(new URL('../../src/pages/learn/[lesson]/learn-mode.astro', import.meta.url), 'utf8');
const catalog = readFileSync(new URL('../../src/lessons/catalog.ts', import.meta.url), 'utf8');

type Lesson = { name: string; context: string; curriculumId?: string };

// Execute the generated route's actual build-time count with independent lessons.
// Legacy lessons from other courses and curriculum lessons must not inflate the total.
const expression = /^const olderLessons = (.+);$/m.exec(page)?.[1];
if (!expression) throw new Error('The generated lesson count declaration was not found.');
const catalogDeclaration = /^const catalog = .+;$/m.exec(page)?.[0] ?? '';
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const countFromPage = new AsyncFunction('lessonCatalog', 'lesson', `${catalogDeclaration}\nreturn ${expression};`) as (
  lessonCatalog: () => Promise<{ lessons: Lesson[] }>,
  lesson: Lesson,
) => Promise<number>;

const learnExpression = /^const olderLessons = (.+);$/m.exec(learnPage)?.[1];
if (!learnExpression) throw new Error('The generated Learn mode lesson count declaration was not found.');
const countFromLearnMode = new AsyncFunction('lessonCatalog', 'lesson', `return ${learnExpression};`) as (
  lessonCatalog: () => Promise<{ lessons: Lesson[] }>,
  lesson: Lesson,
) => Promise<number>;

const load = (lessons: Lesson[]) => async () => ({ lessons });

describe('study-skills course lesson count on the generated lesson route', () => {
  it('reuses the generated course count in Learn mode and shows totals only for multi-lesson legacy courses', async () => {
    const first = { name: 'study skills', context: 'study skills · lesson 1' };
    const second = { name: 'study skills', context: 'study skills · lesson 2' };
    const curriculum = { name: 'study skills', context: 'unit · topic', curriculumId: 'U01-T01-L01' };
    const other = { name: 'other course', context: 'other course · lesson 1' };
    expect(await countFromLearnMode(load([first, second, curriculum, other]), second)).toBe(2);
    expect(await countFromLearnMode(load([first, second, curriculum, other]), other)).toBe(1);
    expect(learnPage).toContain('const context = !lesson.curriculumId && olderLessons > 1 ? `${lesson.context} of ${olderLessons}` : lesson.context;');
    expect(learnPage).toContain('>{context}</p>');
  });

  it('counts only legacy lessons in this course, not other courses or curriculum lessons', async () => {
    const first = { name: 'study skills', context: 'study skills · lesson 1' };
    const second = { name: 'study skills', context: 'study skills · lesson 2' };
    const other = { name: 'other course', context: 'other course · lesson 1' };
    const curriculum = { name: 'study skills', context: 'unit · topic', curriculumId: 'U01-T01-L01' };
    const entries = [first, second, other, curriculum];
    expect(await countFromPage(load(entries), second)).toBe(2);
    expect(await countFromPage(load(entries), other)).toBe(1);
    expect(await countFromPage(load(entries), curriculum)).toBe(2);
  });

  it('gets a legacy lesson number from its content order and hides totals for a single-lesson course', async () => {
    const single = { name: 'study skills', context: 'study skills · lesson 7' };
    expect(await countFromPage(load([single, { name: 'other course', context: 'other course · lesson 1' }]), single)).toBe(1);
    expect(catalog).toContain('const short = place ? file.data.title : `lesson ${file.data.order}`;');
    expect(page).toContain('const context = !lesson.curriculumId && olderLessons > 1 ? `${lesson.context} of ${olderLessons}` : lesson.context;');
  });
});
