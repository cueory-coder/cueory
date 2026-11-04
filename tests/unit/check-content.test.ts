import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeIssue, fileProblems, lessonReport, type Issue } from '../../scripts/check-content/report';
import { buildCatalog } from '../../src/lessons/catalog';

const script = new URL('../../scripts/check-content.mjs', import.meta.url).pathname;

/** Runs the checker as Christian would, and returns what it printed and its exit code. */
function run(args: string[]): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    const failed = error as { status: number; stdout: string; stderr: string };
    return { code: failed.status, out: failed.stdout + failed.stderr };
  }
}

const issue = (code: string, path: PropertyKey[], extra: Partial<Issue> = {}): Issue =>
  ({ code, path, message: 'Invalid input', ...extra });

describe('describeIssue', () => {
  const deck = { cards: [{ front: 'a', back: 'b' }, {}, {}, { front: 'a' }, { front: 'a', back: 'x'.repeat(700) }] };

  it('names the card and the field that is missing or empty', () => {
    expect(describeIssue(issue('invalid_type', ['cards', 3, 'back'], { expected: 'string' }), deck)).toBe('card 4 has no back text');
    expect(describeIssue(issue('too_small', ['cards', 0, 'front'], { origin: 'string', minimum: 1 }), { cards: [{ front: '' }] }))
      .toBe('card 1 has no front text');
    expect(describeIssue(issue('invalid_type', ['title'], { expected: 'string' }), {})).toBe('the file has no title');
    expect(describeIssue(issue('invalid_type', ['image', 'credit'], { expected: 'string' }), { image: {} })).toBe('the image has no credit');
  });

  it('says how long text may be and how long it is', () => {
    expect(describeIssue(issue('too_big', ['cards', 4, 'back'], { origin: 'string', maximum: 600 }), deck))
      .toBe("card 5's back text is too long: at most 600 characters; it has 700");
  });

  it('says how many items a list needs', () => {
    expect(describeIssue(issue('too_small', ['cards'], { origin: 'array', minimum: 1 }), { cards: [] })).toBe('the file needs at least 1 card');
    expect(describeIssue(issue('too_small', ['groups'], { origin: 'array', minimum: 2 }), { groups: [] })).toBe('the file needs at least 2 groups');
    expect(describeIssue(issue('too_big', ['items'], { origin: 'array', maximum: 30 }), { items: [] })).toBe('the file has too many items: at most 30');
  });

  it('lists the allowed values, keeps a schema\'s own hint and words a wrong type', () => {
    expect(describeIssue(issue('invalid_value', ['status'], { values: ['placeholder', 'draft'] }), { status: 'approved' }))
      .toBe('the status is "approved"; use one of "placeholder", "draft"');
    expect(describeIssue(issue('invalid_value', ['status'], { values: ['sample'] }), { status: 'published' }))
      .toBe('the status is "published"; use "sample"');
    expect(describeIssue(issue('invalid_format', ['items', 0, 'id'], { message: 'an id is lowercase letters, digits and dashes' }), { items: [{ id: 'A B' }] }))
      .toBe('item 1\'s id "A B": an id is lowercase letters, digits and dashes');
    expect(describeIssue(issue('invalid_type', ['order'], { expected: 'number' }), { order: 'one' })).toBe('the order should be a number, not "one"');
    expect(describeIssue(issue('custom', ['items'], { message: 'an item id is repeated' }), {})).toBe('the items: an item id is repeated');
  });

  it('puts the file first and drops repeated lines', () => {
    const twice = [issue('invalid_type', ['title'], { expected: 'string' }), issue('invalid_type', ['title'], { expected: 'string' })];
    expect(fileProblems('content/lessons/x.json', twice, {})).toEqual(['content/lessons/x.json: the file has no title']);
  });
});

describe('lessonReport', () => {
  it('sorts lessons into pages, labeled samples and drafts', () => {
    const lessons = [
      { file: 'content/lessons/u00-t01-l01.json', id: 'u00-t01-l01', data: { title: 'one', summary: '', status: 'published', course: 'c', order: 1 } },
      { file: 'content/lessons/study-skills-01.json', id: 'study-skills-01', data: { title: 'two', summary: '', status: 'placeholder', course: 'c', order: 1 } },
      { file: 'content/lessons/u00-t01-l02.json', id: 'u00-t01-l02', data: { title: 'three', summary: '', status: 'draft', course: 'c', order: 2 } },
    ];
    const cards = [
      { file: 'content/cards/a.json', id: 'a', data: { lesson: 'u00-t01-l01', status: 'placeholder' } },
      { file: 'content/cards/b.json', id: 'b', data: { lesson: 'u00-t01-l02', status: 'published' } },
    ];
    const units = [{ id: 'U00', title: 'unit', topics: [{ id: 'U00-T01', title: 'topic', lessons: [
      { lesson_id: 'U00-T01-L01', title: 'one', row: 2 }, { lesson_id: 'U00-T01-L02', title: 'three', row: 3 },
    ] }] }];
    const catalog = buildCatalog({ lessons, cards, fillIn: [], organizer: [], units });
    expect(lessonReport(catalog, lessons, cards)).toEqual([
      'lessons that become pages: 1',
      '  /learn/u00-t01-l01  one (published) · cards (labeled), learn mode (labeled), matching (labeled)',
      'lessons shown as labeled samples or placeholders: 1',
      '  /learn/study-skills  two (placeholder) · label it, questions',
      "drafts that won't appear: 2 (keep them on your computer: drafts never go into the public repository)",
      '  content/lessons/u00-t01-l02.json (draft)',
      '  content/cards/b.json (hidden with its lesson, content/lessons/u00-t01-l02.json)',
    ]);
  });
});

describe('node scripts/check-content.mjs', () => {
  let dir: string;
  let content: string;
  const write = (path: string, value: unknown) => {
    mkdirSync(join(content, path, '..'), { recursive: true });
    writeFileSync(join(content, path), typeof value === 'string' ? value : JSON.stringify(value));
  };
  const lesson = (status: string, title = 'a lesson') =>
    ({ course: 'med-surg-1', order: 1, title, summary: 'a summary', status, sentences: [{ id: 's1', text: 'a sentence' }] });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cueory-content-'));
    content = join(dir, 'content');
    mkdirSync(content);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('passes this repository\'s own content and reports the study-skills sample', () => {
    const { code, out } = run([]);
    expect(code).toBe(0);
    expect(out).toContain('no problems found');
    expect(out).toContain('lessons shown as labeled samples or placeholders: 1');
    expect(out).toContain('  /learn/study-skills  Lesson 1: How to study for nursing school (placeholder)');
  });

  it('prints one plain line per problem, with the file and the field, and exits 1', () => {
    write('lessons/u00-t01-l01.json', lesson('published'));
    write('cards/u00-t01-l01.json', {
      lesson: 'u00-t01-l01', title: 'deck', status: 'published',
      cards: [{ id: 'c1', front: 'a', back: 'b' }, { id: 'c2', front: 'a', back: 'b' }, { id: 'c3', front: 'a', back: 'b' }, { id: 'c4', front: 'a' }],
    });
    write('fill-in/u00-t01-l01.json', { lesson: 'u00-t01-l01', status: 'published', items: [{ id: 'a', sentence: 'Bees make [[honey]].' }] });
    write('organizer/u00-t01-l01.json', '{ "lesson": ');
    write('lessons/notes.json', lesson('published'));
    const { code, out } = run(['--content', content]);
    expect(code).toBe(1);
    expect(out).toContain('4 problems to fix:');
    expect(out).toContain('  content/cards/u00-t01-l01.json: card 4 has no back text');
    expect(out).toContain('  content/fill-in/u00-t01-l01.json: the status is "published"; use "sample"');
    expect(out).toMatch(/ {2}content\/organizer\/u00-t01-l01\.json: isn't valid JSON \(.+\)\. Check for a missing comma, quote or bracket\./);
    expect(out).toContain('  content/lessons/notes.json: name a lesson file by its lesson id');
  });

  it('finds what the build refuses through the page parsers too', () => {
    write('lessons/u00-t01-l01.json', lesson('published'));
    write('fill-in/u00-t01-l01.json', { lesson: 'u00-t01-l01', status: 'sample', items: [{ id: 'a', sentence: 'no blank here' }] });
    write('cards/x.json', { lesson: 'u09-t09-l09', title: 'deck', status: 'published', cards: [{ id: 'c1', front: 'a', back: 'b' }] });
    const { code, out } = run(['--content', content]);
    expect(code).toBe(1);
    expect(out).toContain("content/fill-in/u00-t01-l01.json: item 1's sentence: each fill-in sentence needs exactly one answer in double brackets.");
    expect(out).toContain('content/cards/x.json: its lesson "u09-t09-l09" has no file in content/lessons.');
  });

  it('reports pages, labeled samples and drafts for clean content', () => {
    write('lessons/u00-t01-l01.json', lesson('published', 'subjective and objective'));
    write('lessons/u00-t01-l02.json', lesson('draft'));
    write('lessons/u00-t01-l03.json', lesson('placeholder', 'coming soon'));
    write('cards/u00-t01-l01.json', { lesson: 'u00-t01-l01', title: 'deck', status: 'in_review', cards: [{ id: 'c1', front: 'a', back: 'b' }] });
    const { code, out } = run(['--content', content]);
    expect(code).toBe(0);
    expect(out).toContain('checked 4 files in content');
    expect(out).toContain('lessons that become pages: 1\n  /learn/u00-t01-l01  subjective and objective (published) · no study modes yet');
    expect(out).toContain('lessons shown as labeled samples or placeholders: 1\n  /learn/u00-t01-l03  coming soon (placeholder)');
    expect(out).toContain("drafts that won't appear: 2 (keep them on your computer: drafts never go into the public repository)\n  content/lessons/u00-t01-l02.json (draft)\n  content/cards/u00-t01-l01.json (in_review)");
  });

  it('exits 2 when the command is typed wrong', () => {
    expect(run(['--nope']).code).toBe(2);
    expect(run(['--content', join(dir, 'missing')])).toMatchObject({ code: 2, out: expect.stringContaining('There is no content folder') });
  });
});
