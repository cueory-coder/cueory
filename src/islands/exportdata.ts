/** A download DTO, not a database reader. The caller supplies only their own data and the export date. */
import { dailyGames } from '../config/games';
import type { GameStats } from './gamestats';

export interface ExportData {
  profile?: { displayName?: string | null; createdAt?: string | null };
  onboarding?: { course?: string | null; examDate?: string | null; done?: boolean; school?: string | null };
  progress?: readonly { id: string; result: string | boolean; date: string }[];
  reviewState?: readonly { id: string; nextDueDate: string; interval: number }[];
  gameStats?: GameStats;
}
export interface CsvFile { fileName: string; text: string }
type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;
type Schema = Record<string, (value: unknown) => boolean>;
const text = (value: unknown) => typeof value === 'string';
const nullableText = (value: unknown) => value === null || text(value);
const bool = (value: unknown) => typeof value === 'boolean';
const whole = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function day(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function date(value: unknown): boolean {
  if (day(value)) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  return day(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}
const profileSchema: Schema = { displayName: nullableText, createdAt: value => value === null || date(value) };
const onboardingSchema: Schema = {
  course: nullableText, examDate: value => value === null || day(value), done: bool, school: nullableText,
};
const progressSchema: Schema = { id: value => text(value) && !!(value as string).trim(), result: value => text(value) || bool(value), date };
const reviewSchema: Schema = { id: value => text(value) && !!(value as string).trim(), nextDueDate: day, interval: whole };
const gameSchema: Schema = {
  game: value => dailyGames.some(game => game.id === value), day, solved: bool, tries: whole,
};
const sections = ['profile', 'onboarding', 'progress', 'reviewState', 'gameStats'] as const;
type Section = typeof sections[number];

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

/** Read own data properties only: getters and caller-provided toJSON methods never run. */
function own(source: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function cleanRow(value: unknown, schema: Schema, path: string, dropped: Set<string>, required = false): Row | undefined {
  if (!plain(value)) { dropped.add(path); return; }
  const row: Row = {};
  for (const key of Object.keys(value)) if (!Object.hasOwn(schema, key)) dropped.add(`${path}.${key}`);
  let complete = true;
  for (const [key, valid] of Object.entries(schema)) {
    if (!Object.hasOwn(value, key)) {
      if (required) { dropped.add(`${path}.${key}`); complete = false; }
      continue;
    }
    const field = own(value, key);
    if (valid(field)) row[key] = field as Cell;
    else { dropped.add(`${path}.${key}`); complete = false; }
  }
  return required && !complete ? undefined : row;
}

function cleanList(value: unknown, schema: Schema, path: string, dropped: Set<string>): Row[] {
  if (!Array.isArray(value)) { dropped.add(path); return []; }
  const rows: Row[] = [];
  for (let index = 0; index < value.length; index++) {
    const row = cleanRow(own(value, String(index)), schema, `${path}[${index}]`, dropped, true);
    if (row) rows.push(row);
  }
  // Custom array properties are metadata, not the student's records.
  for (const key of Object.keys(value)) {
    if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) dropped.add(`${path}.${key}`);
  }
  return rows;
}

function prepare(data: unknown): { data: Record<Section, Row | Row[]>; dropped: string[] } {
  const dropped = new Set<string>();
  const source = plain(data) ? data : {};
  if (!plain(data)) dropped.add('input');
  for (const key of Object.keys(source)) if (!(sections as readonly string[]).includes(key)) dropped.add(key);
  const recordSection = (key: Section, schema: Schema) => Object.hasOwn(source, key)
    ? cleanRow(own(source, key), schema, key, dropped) ?? {} : {};
  const listSection = (key: Section, schema: Schema) => Object.hasOwn(source, key)
    ? cleanList(own(source, key), schema, key, dropped) : [];
  return {
    data: {
      profile: recordSection('profile', profileSchema),
      onboarding: recordSection('onboarding', onboardingSchema),
      progress: listSection('progress', progressSchema),
      reviewState: listSection('reviewState', reviewSchema),
      gameStats: listSection('gameStats', gameSchema),
    },
    dropped: [...dropped].sort(),
  };
}

function exportDay(exportDate: string): string {
  if (!date(exportDate)) throw new Error('pass the export date as a real day or a UTC date and time.');
  return exportDate;
}

/** Fixed field order; preserves record order, so attempts and review histories stay meaningful. */
export function exportJson(data: unknown, exportDate: string): string {
  const clean = prepare(data);
  return JSON.stringify({ format: 'cueory-export-1', exportDate: exportDay(exportDate), ...clean.data, dropped: clean.dropped }, null, 2);
}

function csvCell(value: Cell | undefined): string {
  let cell = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r\n]/.test(cell)) cell = `'${cell}`;
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}
function csv(headers: string[], rows: Row[]): string {
  return [headers.map(csvCell).join(','), ...rows.map(row => headers.map(key => csvCell(row[key])).join(','))].join('\r\n') + '\r\n';
}

/** The dropped-fields file is a report of names only; discarded values are never read or copied. */
export function exportCsv(data: unknown): CsvFile[] {
  const clean = prepare(data);
  const schemas = [profileSchema, onboardingSchema, progressSchema, reviewSchema, gameSchema];
  return [
    ...sections.map((section, index) => {
      const value = clean.data[section];
      const rows = Array.isArray(value) ? value : Object.keys(value).length ? [value] : [];
      return { fileName: `${section}.csv`, text: csv(Object.keys(schemas[index]), rows) };
    }),
    { fileName: 'dropped.csv', text: csv(['dropped'], clean.dropped.map(dropped => ({ dropped }))) },
  ];
}
