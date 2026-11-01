/** Curriculum outline metadata only. No file I/O or lesson-content generation. */
import { CsvError, parseRows } from '../../scripts/check-batch/csv.ts';

export const LESSON_MAP_COLUMNS = ['lesson_id', 'unit', 'unit_code', 'topic', 'lesson', 'unit_note', 'status'] as const;
export interface MapLesson {
  lesson_id: string;
  title: string;
  /** Nonblank CSV record number, including the header; preserves build order across groups. */
  row: number;
}
export interface MapTopic { id: string; title: string; lessons: MapLesson[] }
export interface MapUnit { id: string; title: string; topics: MapTopic[] }
export interface MapProblem { row: number; message: string }
export interface ParsedLessonMap { units: MapUnit[]; problems: MapProblem[] }

interface Candidate extends MapLesson { unitId: string; unitTitle: string; topicId: string; topicTitle: string }
function associate(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

/**
 * Reads the map's exact seven-column header. Invalid/ambiguous records are
 * reported and omitted; callers must address problems before publishing an index.
 * Syntax errors use the CSV reader's reported line. Other rows count nonblank records.
 */
export function parseLessonMap(csvText: string): ParsedLessonMap {
  const result: ParsedLessonMap = { units: [], problems: [] };
  const problem = (row: number, message: string) => result.problems.push({ row, message });
  if (typeof csvText !== 'string') {
    problem(1, 'The lesson map must be CSV text.');
    return result;
  }
  let records: string[][];
  try { records = parseRows(csvText); }
  catch (error) {
    const message = error instanceof CsvError ? error.message : 'The CSV could not be read.';
    const line = /^(?:line|row) (\d+):/.exec(message);
    problem(line ? Number(line[1]) : 1, message);
    return result;
  }
  const [header, ...body] = records;
  if (!header || header.length !== LESSON_MAP_COLUMNS.length
    || header.some((value, index) => value.trim() !== LESSON_MAP_COLUMNS[index])) {
    problem(1, `Use the exact header: ${LESSON_MAP_COLUMNS.join(',')}.`);
    return result;
  }

  const counts = new Map<string, number>();
  for (const fields of body) {
    const id = fields[0]?.trim() ?? '';
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const candidates: Candidate[] = [];
  body.forEach((fields, index) => {
    const row = index + 2;
    if (fields.length !== LESSON_MAP_COLUMNS.length) {
      problem(row, 'The row must have exactly seven fields.');
      return;
    }
    const [lesson_id, unitTitle, unitCode, topicTitle, title] = fields.map(value => value.trim());
    const match = /^U(\d{2})-T(0[1-9]|[1-9]\d)-L(0[1-9]|[1-9]\d)$/.exec(lesson_id!);
    const before = result.problems.length;
    if (!match) problem(row, 'Use a lesson_id like U01-T01-L01; unit 00 is allowed, topics and lessons start at 01.');
    if (counts.get(lesson_id!) !== 1) problem(row, 'This lesson_id appears more than once; every copy is omitted.');
    if (match && unitCode !== match[1]) problem(row, 'unit_code must match the two unit digits in lesson_id.');
    if (!unitTitle) problem(row, 'The unit title is required.');
    if (!topicTitle) problem(row, 'The topic title is required.');
    if (!title) problem(row, 'The lesson title is required.');
    if (!match || result.problems.length !== before) return;
    candidates.push({ lesson_id: lesson_id!, title: title!, row,
      unitId: `U${match[1]}`, unitTitle: unitTitle!, topicId: `U${match[1]}-T${match[2]}`, topicTitle: topicTitle! });
  });

  const unitTitles = new Map<string, Set<string>>();
  const unitIds = new Map<string, Set<string>>();
  const topicTitles = new Map<string, Set<string>>();
  const topicIds = new Map<string, Set<string>>();
  for (const item of candidates) {
    associate(unitTitles, item.unitId, item.unitTitle);
    associate(unitIds, item.unitTitle, item.unitId);
    associate(topicTitles, item.topicId, item.topicTitle);
    associate(topicIds, JSON.stringify([item.unitId, item.topicTitle]), item.topicId);
  }

  const units = new Map<string, MapUnit>();
  const topics = new Map<string, MapTopic>();
  for (const item of candidates) {
    const before = result.problems.length;
    if (unitTitles.get(item.unitId)!.size !== 1 || unitIds.get(item.unitTitle)!.size !== 1) {
      problem(item.row, 'Each unit id and unit title must refer to one consistent unit.');
    }
    if (topicTitles.get(item.topicId)!.size !== 1
      || topicIds.get(JSON.stringify([item.unitId, item.topicTitle]))!.size !== 1) {
      problem(item.row, 'The topic title must match one consistent topic id within its unit.');
    }
    if (result.problems.length !== before) continue;
    let unit = units.get(item.unitId);
    if (!unit) {
      unit = { id: item.unitId, title: item.unitTitle, topics: [] };
      units.set(item.unitId, unit);
      result.units.push(unit);
    }
    let topic = topics.get(item.topicId);
    if (!topic) {
      topic = { id: item.topicId, title: item.topicTitle, lessons: [] };
      topics.set(item.topicId, topic);
      unit.topics.push(topic);
    }
    topic.lessons.push({ lesson_id: item.lesson_id, title: item.title, row: item.row });
  }
  result.problems.sort((a, b) => a.row - b.row);
  return result;
}

/** Canonical unit ids are U00, U01, etc. Returns independent lesson objects in CSV order. */
export function lessonsFor(units: readonly MapUnit[], unitId: string): MapLesson[] {
  return (units.find(unit => unit.id === unitId)?.topics.flatMap(topic => topic.lessons) ?? [])
    .map(lesson => ({ ...lesson })).sort((a, b) => a.row - b.row);
}
