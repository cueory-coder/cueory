import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(new URL('../../src/pages/learn/study-skills/index.astro', import.meta.url), 'utf8');
type Lesson = { data: { course: string; order: number } };

// Execute the page's actual build-time count against a fake content collection.
// This catches counting unrelated courses without changing public content fixtures.
const expression = /^const lessonCount = (.+);$/m.exec(page)?.[1];
if (!expression) throw new Error('The lesson count declaration was not found.');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const countFromPage = new AsyncFunction('getCollection', 'lesson', `return ${expression};`) as (
  getCollection: (name: string, filter?: (entry: Lesson) => boolean) => Promise<Lesson[]>,
  lesson: Lesson,
) => Promise<number>;

function collection(entries: Lesson[]) {
  return async (name: string, filter?: (entry: Lesson) => boolean) => {
    expect(name).toBe('lessons');
    return filter ? entries.filter(filter) : entries;
  };
}

describe('study-skills course lesson count', () => {
  it('counts only the current course when two courses have lessons', async () => {
    const first = { data: { course: 'study-skills', order: 1 } };
    const second = { data: { course: 'study-skills', order: 2 } };
    const other = { data: { course: 'other-course', order: 1 } };
    expect(await countFromPage(collection([first, second, other]), second)).toBe(2);
    expect(await countFromPage(collection([first, second, other]), other)).toBe(1);
  });

  it('binds the visible lesson number to content order and omits a single-lesson total', async () => {
    const lesson = { data: { course: 'study-skills', order: 7 } };
    expect(await countFromPage(collection([lesson, { data: { course: 'other-course', order: 1 } }]), lesson)).toBe(1);
    expect(page).toContain('lesson {lesson.data.order}{lessonCount > 1 ? ` of ${lessonCount}` : \'\'}');
  });
});
