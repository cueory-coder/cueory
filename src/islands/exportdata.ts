/**
 * A download DTO, not a database reader. The caller supplies only their own data and the export date.
 *
 * Sections (JSON key and CSV file share the name): profile, onboarding, progress, reviewState and gameStats come from
 * the account page or this browser; attempts, examPlans and reviewRows mirror the student's own rows in the database
 * tables `attempts`, `exam_plans` and `review_state` (supabase/migrations 20261101100000 and 20261101110000), and
 * reports holds the student's own "Flag or comment" reports as the database function `my_flags()` returns them (D-88):
 * never the admin fields (user, status, handled time), which are dropped by name like any other unknown field.
 * Each section has a strict schema: unknown fields are dropped and listed by NAME in `dropped` (never by value), and a
 * bad field reports the field and its row. The database rows never carry a user id, an answer key or a rationale, and
 * if a caller passes one it is dropped like any other unknown field. In CSV, `picked` letters are joined with ";".
 * Row caps: attempts and reviewRows keep their first 50,000 rows, examPlans its first 10 and reports its first 10,000; the rest is reported in
 * `dropped` as `<section>[<cap>+]`.
 */
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
  /** The student's own `attempts` rows, as the account page read them. */
  attempts?: readonly { itemVersionId: string; picked: readonly string[]; correct: boolean; createdAt: string }[];
  /** The student's own `exam_plans` rows (at most 10). */
  examPlans?: readonly { course: string; examDate: string; createdAt: string }[];
  /** The signed-in student's `review_state` rows; the guest `reviewState` section is separate. */
  reviewRows?: readonly { itemId: string; level: number; lastReviewed: string; nextReview: string }[];
  /** The student's own "Flag or comment" reports, as `my_flags()` returns them. */
  reports?: readonly {
    id: string; page: string; itemId: string | null; itemVersionId: string | null; reason: string; comment: string | null; createdAt: string;
  }[];
}
export interface CsvFile { fileName: string; text: string }
type Cell = string | number | boolean | null | readonly string[];
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
const uuid = (value: unknown) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
/** 1 to 5 distinct letters a-e, as plain array elements (no getters, no extra keys). */
function letters(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) return false;
  if (Object.keys(value).length !== value.length) return false;
  const seen = new Set<unknown>();
  for (let index = 0; index < value.length; index++) {
    const letter = own(value, String(index));
    if (typeof letter !== 'string' || !/^[a-e]$/.test(letter) || seen.has(letter)) return false;
    seen.add(letter);
  }
  return true;
}
const slug = (value: unknown) => typeof value === 'string' && value.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
const level = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3;
const attemptSchema: Schema = { itemVersionId: uuid, picked: letters, correct: bool, createdAt: date };
const examPlanSchema: Schema = { course: slug, examDate: day, createdAt: date };
/** A page on this site, as submit_flag stores it: a path, never an address on another site. */
const sitePath = (value: unknown) =>
  typeof value === 'string' && value.length >= 1 && value.length <= 200 && /^\/[A-Za-z0-9._~/%:@!$&'()*+,;=-]*$/.test(value) && !value.startsWith('//');
const reportReasons = ['wrong-fact', 'typo', 'confusing', 'broken', 'other'];
const reportComment = (value: unknown) =>
  value === null || (typeof value === 'string' && [...value].length >= 1 && [...value].length <= 1000 && !/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value));
const reportSchema: Schema = {
  id: uuid, page: sitePath, itemId: value => value === null || uuid(value), itemVersionId: value => value === null || uuid(value),
  reason: value => typeof value === 'string' && reportReasons.includes(value), comment: reportComment, createdAt: date,
};
const reviewRowSchema: Schema = { itemId: uuid, level, lastReviewed: day, nextReview: day };
const reviewSchema: Schema = { id: value => text(value) && !!(value as string).trim(), nextDueDate: day, interval: whole };
const gameSchema: Schema = {
  game: value => dailyGames.some(game => game.id === value), day, solved: bool, tries: whole,
};
const sections = ['profile', 'onboarding', 'progress', 'reviewState', 'gameStats', 'attempts', 'examPlans', 'reviewRows', 'reports'] as const;
const rowCaps: Partial<Record<Section, number>> = { attempts: 50_000, examPlans: 10, reviewRows: 50_000, reports: 10_000 };
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
  attempts: Row[];
  examPlans: Row[];
  reviewRows: Row[];
  reports: Row[];
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

function cleanList(value: unknown, schema: Schema, path: string, dropped: Set<string>, cap = Infinity): Row[] {
  if (!Array.isArray(value)) { dropped.add(path); return []; }
  const rows: Row[] = [];
  const limit = Math.min(value.length, cap);
  if (value.length > cap) dropped.add(`${path}[${cap}+]`);
  for (let index = 0; index < limit; index++) {
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
    ? cleanList(own(source, key), schema, key, dropped, rowCaps[key]) : [];
  const profile = recordSection('profile', profileSchema);
  if (typeof profile.createdAt === 'string') profile.createdAt = utcDate(profile.createdAt)!;
  const suppliedProgress = own(source, 'progress');
  const progress = !Object.hasOwn(source, 'progress') ? [] : Array.isArray(suppliedProgress)
    ? cleanList(suppliedProgress, progressSchema, 'progress', dropped) : cleanGuest(suppliedProgress, dropped) ?? [];
  if (Array.isArray(progress)) for (const row of progress) row.date = utcDate(row.date)!;
  const attempts = listSection('attempts', attemptSchema);
  for (const row of attempts) {
    row.picked = Array.from(row.picked as readonly string[]);
    row.createdAt = utcDate(row.createdAt)!;
  }
  const examPlans = listSection('examPlans', examPlanSchema);
  for (const row of examPlans) row.createdAt = utcDate(row.createdAt)!;
  const reports = listSection('reports', reportSchema);
  for (const row of reports) row.createdAt = utcDate(row.createdAt)!;
  return {
    data: {
      profile,
      onboarding: recordSection('onboarding', onboardingSchema),
      progress,
      reviewState: listSection('reviewState', reviewSchema),
      gameStats: listSection('gameStats', gameSchema),
      attempts,
      examPlans,
      reviewRows: listSection('reviewRows', reviewRowSchema),
      reports,
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
  let cell = value === null || value === undefined ? '' : typeof value === 'object' ? value.join(';') : String(value);
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
    { fileName: 'attempts.csv', text: csv(Object.keys(attemptSchema), clean.data.attempts) },
    { fileName: 'examPlans.csv', text: csv(Object.keys(examPlanSchema), clean.data.examPlans) },
    { fileName: 'reviewRows.csv', text: csv(Object.keys(reviewRowSchema), clean.data.reviewRows) },
    { fileName: 'reports.csv', text: csv(Object.keys(reportSchema), clean.data.reports) },
    { fileName: 'dropped.csv', text: csv(['dropped'], clean.dropped.map(dropped => ({ dropped }))) },
  ];
}
