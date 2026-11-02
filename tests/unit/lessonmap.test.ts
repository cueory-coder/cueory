import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRows, toCsv, type CsvRow } from '../../scripts/check-batch/csv';
import { lessonsFor, parseLessonMap } from '../../src/islands/lessonmap';

const columns = ['lesson_id', 'unit', 'unit_code', 'topic', 'lesson', 'unit_note', 'status'];
const sample: CsvRow = { lesson_id: 'U01-T01-L01', unit: 'sample: first unit', unit_code: '01',
  topic: 'sample: first topic', lesson: 'sample: first lesson', unit_note: 'sample: private planning note', status: 'not started' };
const csv = (rows: CsvRow[] = [sample]) => toCsv(columns, rows);

describe('the checked-in curriculum map', () => {
  it('reads all 351 lessons, 93 topics and 19 units in their real build order', () => {
    const text = readFileSync(new URL('../../docs/curriculum/medsurg-lesson-map.csv', import.meta.url), 'utf8');
    const [header, ...rows] = parseRows(text);
    expect(header).toEqual(columns);
    const result = parseLessonMap(text);
    expect(result.problems).toEqual([]);
    expect(result.units).toHaveLength(19);
    expect(result.units.flatMap(unit => unit.topics)).toHaveLength(93);
    const lessons = result.units.flatMap(unit => lessonsFor(result.units, unit.id));
    expect(lessons).toHaveLength(351);
    expect(lessons.map(lesson => lesson.lesson_id)).toEqual(rows.map(row => row[0]));
    expect(lessons.map(lesson => lesson.title)).toEqual(rows.map(row => row[4]));
    expect(result.units.map(unit => unit.id)).toEqual(Array.from({ length: 19 }, (_, i) => `U${String(i).padStart(2, '0')}`));
  });
});

describe('outline grouping and lookup', () => {
  it('returns only outline fields, ignoring notes and status', () => {
    const result = parseLessonMap(csv());
    expect(result).toEqual({ units: [{ id: 'U01', title: sample.unit, topics: [{ id: 'U01-T01', title: sample.topic,
      lessons: [{ lesson_id: sample.lesson_id, title: sample.lesson, row: 2 }] }] }], problems: [] });
    expect(JSON.stringify(result)).not.toContain(sample.unit_note);
    expect(JSON.stringify(result)).not.toContain(sample.status);
  });

  it('retains first appearance and per-record order rather than sorting ids', () => {
    const rows = [
      { ...sample, lesson_id: 'U02-T02-L03', unit: 'sample: second unit', unit_code: '02', topic: 'sample: second topic' },
      { ...sample },
      { ...sample, lesson_id: 'U02-T01-L01', unit: 'sample: second unit', unit_code: '02' },
      { ...sample, lesson_id: 'U02-T02-L01', unit: 'sample: second unit', unit_code: '02', topic: 'sample: second topic' },
    ];
    const { units, problems } = parseLessonMap(csv(rows));
    expect(problems).toEqual([]);
    expect(units.map(unit => unit.id)).toEqual(['U02', 'U01']);
    expect(units[0]!.topics.map(topic => topic.id)).toEqual(['U02-T02', 'U02-T01']);
    expect(lessonsFor(units, 'U02').map(lesson => lesson.lesson_id)).toEqual(['U02-T02-L03', 'U02-T01-L01', 'U02-T02-L01']);
  });

  it('allows the same topic title in different units', () => {
    const result = parseLessonMap(csv([sample, { ...sample, lesson_id: 'U02-T01-L01', unit: 'sample: second unit', unit_code: '02' }]));
    expect(result.problems).toEqual([]);
    expect(result.units).toHaveLength(2);
  });

  it('returns an empty outline for a header-only CSV and unknown units', () => {
    expect(parseLessonMap(csv([]))).toEqual({ units: [], problems: [] });
    expect(lessonsFor(parseLessonMap(csv()).units, 'U99')).toEqual([]);
    expect(lessonsFor([], 'U01')).toEqual([]);
  });

  it('returns independent lesson objects without modifying the outline', () => {
    const { units } = parseLessonMap(csv());
    const before = JSON.stringify(units);
    const selected = lessonsFor(units, 'U01');
    selected[0]!.title = 'sample: caller edit';
    selected.reverse();
    expect(JSON.stringify(units)).toBe(before);
  });

  it('uses the existing CSV reader for BOM, CRLF, quotes, commas, Unicode and multiline titles', () => {
    const title = 'sample: "quoted", 王\nsecond line';
    const text = '\ufeff' + csv([{ ...sample, lesson: title }]).replaceAll('\n', '\r\n');
    const result = parseLessonMap(text);
    expect(result.problems).toEqual([]);
    expect(lessonsFor(result.units, 'U01')[0]!.title).toBe(title.replaceAll('\n', '\r\n'));
  });
});

describe('invalid curriculum records', () => {
  it.each(['', 'U1-T01-L01', 'U01-T1-L01', 'U01-T01-L1', 'u01-T01-L01', 'U01-T00-L01', 'U01-T01-L00', 'U01-T01-L01-extra'])(
    'reports a malformed id with its row: %j', lesson_id => {
      const result = parseLessonMap(csv([{ ...sample, lesson_id }]));
      expect(result.units).toEqual([]);
      expect(result.problems).toEqual([{ row: 2, message: expect.stringContaining('lesson_id') }]);
    },
  );

  it.each(['02', '1', '', 'U01'])('requires unit_code to match the id exactly: %j', unit_code => {
    const result = parseLessonMap(csv([{ ...sample, unit_code }]));
    expect(result.units).toEqual([]);
    expect(result.problems).toEqual([{ row: 2, message: expect.stringContaining('unit_code') }]);
  });

  it.each(['unit', 'topic', 'lesson'])('reports a missing %s title', field => {
    const result = parseLessonMap(csv([{ ...sample, [field]: ' ' }]));
    expect(result.units).toEqual([]);
    expect(result.problems).toEqual([{ row: 2, message: expect.stringContaining('title is required') }]);
  });

  it('rejects every copy of a duplicated lesson id but keeps independent good records', () => {
    const result = parseLessonMap(csv([sample, { ...sample, lesson: 'sample: conflicting lesson' }, { ...sample, lesson_id: 'U01-T01-L02' }]));
    expect(result.problems.map(problem => problem.row)).toEqual([2, 3]);
    expect(result.problems.every(problem => problem.message.includes('more than once'))).toBe(true);
    expect(lessonsFor(result.units, 'U01').map(lesson => lesson.lesson_id)).toEqual(['U01-T01-L02']);
  });

  it.each([
    { ...sample, lesson_id: 'U01-T02-L01', unit: 'sample: conflicting unit', topic: 'sample: second topic' },
    { ...sample, lesson_id: 'U02-T01-L01', unit_code: '02' },
  ])('reports inconsistent unit associations on all affected rows', conflicting => {
    const result = parseLessonMap(csv([sample, conflicting]));
    expect(result.units).toEqual([]);
    expect(result.problems.map(problem => problem.row)).toEqual([2, 3]);
    expect(result.problems.every(problem => problem.message.includes('unit'))).toBe(true);
  });

  it.each([
    { ...sample, lesson_id: 'U01-T01-L02', topic: 'sample: conflicting topic' },
    { ...sample, lesson_id: 'U01-T02-L01' },
  ])('reports a topic assigned inconsistent ids or titles within its unit', conflicting => {
    const result = parseLessonMap(csv([sample, conflicting]));
    expect(result.units).toEqual([]);
    expect(result.problems.map(problem => problem.row)).toEqual([2, 3]);
    expect(result.problems.every(problem => problem.message.includes('topic'))).toBe(true);
  });

  it('reports an uneven row and continues reading other valid records', () => {
    const result = parseLessonMap(csv() + 'U01-T01-L02,too,few\n');
    expect(result.problems).toEqual([{ row: 3, message: expect.stringContaining('seven fields') }]);
    expect(lessonsFor(result.units, 'U01')).toHaveLength(1);
  });

  it('lists problems in record order even when discovered in different validation passes', () => {
    const result = parseLessonMap(csv([sample, { ...sample, lesson_id: 'bad' },
      { ...sample, lesson_id: 'U01-T01-L02', topic: 'sample: conflicting topic' }]));
    expect(result.problems.map(problem => problem.row)).toEqual([2, 3, 4]);
  });
});

describe('CSV structure problems', () => {
  it.each([
    '', 'lesson_id,unit,unit_code,topic,lesson\n',
    'unit,lesson_id,unit_code,topic,lesson,unit_note,status\n',
    'lesson_id,unit,unit_code,topic,lesson,unit_note,status,extra\n',
    'lesson_id,unit,unit_code,topic,lesson,unit_note,unit_note\n',
  ])('requires the real seven-column header: %j', text => {
    expect(parseLessonMap(text)).toEqual({ units: [], problems: [{ row: 1, message: expect.stringContaining('exact header') }] });
  });

  it('reports a CSV syntax error instead of throwing or accepting a partial file', () => {
    const result = parseLessonMap(csv() + '"never closed');
    expect(result.units).toEqual([]);
    expect(result.problems).toEqual([{ row: 3, message: expect.stringContaining('never closed') }]);
  });

  it('rejects non-text runtime input', () => {
    expect(parseLessonMap(null as unknown as string)).toEqual({ units: [], problems: [{ row: 1, message: expect.stringContaining('CSV text') }] });
  });
});
