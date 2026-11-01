/** A download DTO, not a database reader. The caller supplies only their own data and the export date. */
import { dailyGames } from '../config/games';
import { isCourse, isExamDate, PROGRESS_VERSION, type DeckProgress, type Progress } from '../scripts/progress';
import type { GameStats } from './gamestats';

export interface ExportData {
  profile?: { displayName?: string | null; email?: string | null; createdAt?: string | null };
  onboarding?: { course?: string | null; examDate?: string | null; done?: boolean; school?: string | null };
  progress?: readonly { id: string; result: string | boolean; date: string }[] | Progress;
  reviewState?: readonly { id: string; nextDueDate: string; interval: number }[];
  /** Supplied from this browser's storage, never fetched from an account or a server. */
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
function utcDate(value: unknown): string | undefined {
  if (day(value)) return value as string;
  if (typeof value !== 'string') return;
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts || !day(parts[1]) || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59) return;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return;
  const iso = new Date(time).toISOString();
  if (!/^\d{4}-/.test(iso) || iso.startsWith('0000')) return;
  // Date preserves milliseconds; retain Postgres's remaining microseconds too.
  const micros = (parts[5] ?? '').padEnd(6, '0').slice(3).replace(/0+$/, '');
  return iso.slice(0, -1) + micros + 'Z';
}
const date = (value: unknown) => utcDate(value) !== undefined;
const profileSchema: Schema = { displayName: nullableText, email: nullableText, createdAt: value => value === null || date(value) };
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
interface GuestSnapshot {
  version: typeof PROGRESS_VERSION;
  onboarding: Row;
  decks: Record<string, Partial<DeckProgress>>;
}
interface Sections {
  profile: Row;
  onboarding: Row;
  progress: Row[] | GuestSnapshot;
  reviewState: Row[];
  gameStats: Row[];
}
const guestId = /^[a-z0-9-]{1,64}$/;
const piles = ['know', 'learning', 'starred'] as const;
const guestOnboarding: Schema = {
  course: value => value === null || isCourse(value),
  examDate: value => value === null || isExamDate(value), done: bool,
};

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
  if (required && !complete) { dropped.add(path); return; }
  return row;
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

function cleanGuest(value: unknown, dropped: Set<string>): GuestSnapshot | undefined {
  if (!plain(value)) { dropped.add('progress'); return; }
  for (const key of Object.keys(value)) if (!['version', 'onboarding', 'decks'].includes(key)) dropped.add(`progress.${key}`);
  if (own(value, 'version') !== PROGRESS_VERSION) { dropped.add('progress.version'); dropped.add('progress'); return; }
  const onboarding = cleanRow(own(value, 'onboarding'), guestOnboarding, 'progress.onboarding', dropped) ?? {};
  const decks: GuestSnapshot['decks'] = Object.create(null);
  const supplied = own(value, 'decks');
  if (!plain(supplied)) dropped.add('progress.decks');
  else for (const id of Object.keys(supplied).sort()) {
    const path = `progress.decks.${id}`;
    if (!guestId.test(id)) { dropped.add(path); continue; }
    const source = own(supplied, id);
    if (!plain(source)) { dropped.add(path); continue; }
    const deck: Partial<DeckProgress> = {};
    for (const key of Object.keys(source)) if (!(piles as readonly string[]).includes(key)) dropped.add(`${path}.${key}`);
    for (const pile of piles) {
      const cards = own(source, pile);
      if (!Array.isArray(cards)) { dropped.add(`${path}.${pile}`); continue; }
      const ids: string[] = [];
      for (let index = 0; index < cards.length; index++) {
        const card = own(cards, String(index));
        if (typeof card === 'string' && guestId.test(card)) ids.push(card);
        else dropped.add(`${path}.${pile}[${index}]`);
      }
      for (const key of Object.keys(cards)) {
        if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= cards.length) dropped.add(`${path}.${pile}.${key}`);
      }
      deck[pile] = ids;
    }
    decks[id] = deck;
  }
  return { version: PROGRESS_VERSION, onboarding, decks };
}

function prepare(data: unknown): { data: Sections; dropped: string[] } {
  const dropped = new Set<string>();
  const source = plain(data) ? data : {};
  if (!plain(data)) dropped.add('input');
  for (const key of Object.keys(source)) if (!(sections as readonly string[]).includes(key)) dropped.add(key);
  const recordSection = (key: Section, schema: Schema) => Object.hasOwn(source, key)
    ? cleanRow(own(source, key), schema, key, dropped) ?? {} : {};
  const listSection = (key: Section, schema: Schema) => Object.hasOwn(source, key)
    ? cleanList(own(source, key), schema, key, dropped) : [];
  const profile = recordSection('profile', profileSchema);
  if (typeof profile.createdAt === 'string') profile.createdAt = utcDate(profile.createdAt)!;
  const suppliedProgress = own(source, 'progress');
  const progress = !Object.hasOwn(source, 'progress') ? [] : Array.isArray(suppliedProgress)
    ? cleanList(suppliedProgress, progressSchema, 'progress', dropped) : cleanGuest(suppliedProgress, dropped) ?? [];
  if (Array.isArray(progress)) for (const row of progress) row.date = utcDate(row.date)!;
  return {
    data: {
      profile,
      onboarding: recordSection('onboarding', onboardingSchema),
      progress,
      reviewState: listSection('reviewState', reviewSchema),
      gameStats: listSection('gameStats', gameSchema),
    },
    dropped: [...dropped].sort(),
  };
}

function exportDay(exportDate: string): string {
  const normalized = utcDate(exportDate);
  if (!normalized) throw new Error('pass the export date as a real day or an ISO date and time.');
  return normalized;
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
  const progressRows: Row[] = [];
  if (Array.isArray(clean.data.progress)) progressRows.push(...clean.data.progress);
  else {
    const guest = clean.data.progress;
    const metadata: Row = { progressVersion: guest.version, ...guest.onboarding };
    for (const [deckId, deck] of Object.entries(guest.decks)) {
      const before = progressRows.length;
      for (const pile of piles) for (const id of deck[pile] ?? []) progressRows.push({ id, result: pile, deckId, ...metadata });
      if (progressRows.length === before) progressRows.push({ deckId, ...metadata });
    }
    if (!progressRows.length) progressRows.push(metadata);
  }
  const recordRows = (value: Row) => Object.keys(value).length ? [value] : [];
  return [
    { fileName: 'profile.csv', text: csv(Object.keys(profileSchema), recordRows(clean.data.profile)) },
    { fileName: 'onboarding.csv', text: csv(Object.keys(onboardingSchema), recordRows(clean.data.onboarding)) },
    { fileName: 'progress.csv', text: csv([...Object.keys(progressSchema), 'deckId', 'progressVersion', 'course', 'examDate', 'done'], progressRows) },
    { fileName: 'reviewState.csv', text: csv(Object.keys(reviewSchema), clean.data.reviewState) },
    { fileName: 'gameStats.csv', text: csv(Object.keys(gameSchema), clean.data.gameStats) },
    { fileName: 'dropped.csv', text: csv(['dropped'], clean.dropped.map(dropped => ({ dropped }))) },
  ];
}
