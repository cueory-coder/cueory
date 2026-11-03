/**
 * A download DTO, not a database reader. The caller supplies only their own data and the export date.
 *
 * Sections (JSON key and CSV file share the name): profile, onboarding, progress, reviewState and gameStats come from
 * the account page or this browser; attempts, examPlans and reviewRows mirror the student's own rows in the database
 * tables `attempts`, `exam_plans` and `review_state` (supabase/migrations 20261101100000 and 20261101110000), and
 * reports holds the student's own "Flag or comment" reports as the database function `my_flags()` returns them (D-88):
 * never the admin fields (user, status, handled time), which are dropped by name like any other unknown field.
 * studyEvents mirrors the student's own rows in `study_events` (supabase/migrations/20261102100000, Task 140). A
 * long history comes as StudyEventPages, checked and written out one page at a time, so it never sits in memory as one
 * array of rows; exportJsonBlob and exportCsvBlobs turn it into the download.
 * Each section has a strict schema: unknown fields are dropped and listed by NAME in `dropped` (never by value), and a
 * bad field reports the field and its row. The database rows never carry a user id, an answer key or a rationale, and
 * if a caller passes one it is dropped like any other unknown field. In CSV, `picked` letters are joined with ";".
 * Row caps: attempts and reviewRows keep their first 50,000 rows, examPlans its first 10 and reports its first 10,000;
 * the rest is reported in `dropped` as `<section>[<cap>+]`. studyEvents has no cap: the whole history is exported.
 */
import { dailyGames } from '../config/games';
import { isCourse, isExamDate, PROGRESS_VERSION, type DeckProgress, type Progress } from '../scripts/progress';
import type { GameStats } from './gamestats';

export interface ExportData {
  profile?: {
    displayName?: string | null; email?: string | null; createdAt?: string | null;
    /** The display-name limit (20261102140000_update_display_name.sql): when the current hour of changes began, and how many. */
    nameChangeWindowStart?: string | null; nameChangesInWindow?: number;
  };
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
  reviewRows?: readonly { itemId: string; level: number; lastReviewed: string; nextReview: string; updatedAt: string }[];
  /** The student's own "Flag or comment" reports, as `my_flags()` returns them. */
  reports?: readonly {
    id: string; page: string; itemId: string | null; itemVersionId: string | null; reason: string; comment: string | null; createdAt: string;
  }[];
  /**
   * The student's own `study_events` rows: what they did with each question, how long it was on screen, and when.
   * loadExport supplies StudyEventPages; a short list can also be passed as rows.
   */
  studyEvents?: readonly StudyEventRow[] | StudyEventPages;
}
export interface StudyEventRow {
  itemId: string; itemVersionId: string; kind: string; msOnItem: number; mark: string | null; at: string; createdAt: string;
}
export interface CsvFile { fileName: string; text: string }
export interface CsvBlob { fileName: string; blob: Blob }
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
const profileSchema: Schema = {
  displayName: nullableText, email: nullableText, createdAt: value => value === null || date(value),
  nameChangeWindowStart: value => value === null || date(value),
  nameChangesInWindow: value => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10,
};
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
/** The database's own rules for a study event (study_events in 20261102100000_study_events.sql). */
const studyEventKinds = ['answered', 'marked', 'skipped'];
const studyEventMarks = ['know', 'learning'];
const studyEventSchema: Schema = {
  itemId: uuid, itemVersionId: uuid,
  kind: value => typeof value === 'string' && studyEventKinds.includes(value),
  msOnItem: value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_800_000,
  mark: value => value === null || (typeof value === 'string' && studyEventMarks.includes(value)),
  at: date, createdAt: date,
};
const reviewRowSchema: Schema = { itemId: uuid, level, lastReviewed: day, nextReview: day, updatedAt: date };
const reviewSchema: Schema = { id: value => text(value) && !!(value as string).trim(), nextDueDate: day, interval: whole };
const gameSchema: Schema = {
  game: value => dailyGames.some(game => game.id === value), day, solved: bool, tries: whole,
};
const sections = ['profile', 'onboarding', 'progress', 'reviewState', 'gameStats', 'attempts', 'examPlans', 'reviewRows', 'reports', 'studyEvents'] as const;
const rowCaps: Partial<Record<Section, number>> = {
  attempts: 50_000, examPlans: 10, reviewRows: 50_000, reports: 10_000,
};
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
  studyEvents: StudyEventText;
}
/** Study events already written out: JSON array elements and CSV lines, as text or as one Blob per page. */
interface StudyEventText { count: number; json: readonly (string | Blob)[]; csv: readonly (string | Blob)[] }
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

function cleanList(value: unknown, schema: Schema, path: string, dropped: Set<string>, cap = Infinity, offset = 0): Row[] {
  if (!Array.isArray(value)) { dropped.add(path); return []; }
  const rows: Row[] = [];
  const limit = Math.min(value.length, cap);
  if (value.length > cap) dropped.add(`${path}[${cap}+]`);
  for (let index = 0; index < limit; index++) {
    const row = cleanRow(own(value, String(index)), schema, `${path}[${offset + index}]`, dropped, true);
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

const studyEventHeaders = Object.keys(studyEventSchema);

/** Checked study-event rows in UTC. The same rules for a list of rows and for each page. */
function cleanStudyEvents(value: unknown, dropped: Set<string>, offset = 0): Row[] {
  const rows = cleanList(value, studyEventSchema, 'studyEvents', dropped, Infinity, offset);
  for (const row of rows) {
    row.at = utcDate(row.at)!;
    row.createdAt = utcDate(row.createdAt)!;
  }
  return rows;
}

/** Elements of the pretty-printed studyEvents array, exactly as JSON.stringify(..., null, 2) indents them there. */
function studyEventJson(rows: Row[], first: boolean): string {
  return rows.map((row, index) =>
    (first && index === 0 ? '' : ',\n') + '    ' + JSON.stringify(row, null, 2).replace(/\n/g, '\n    ')).join('');
}

/**
 * A study history read one page at a time (Task 140). Each page is checked with the same rules as a list of rows,
 * then written straight out as JSON and CSV text in a Blob, and its rows are not kept. Memory holds one page of rows
 * at a time however long the history is; the browser holds the Blobs until the download is made.
 */
export class StudyEventPages {
  readonly #json: Blob[] = [];
  readonly #csv: Blob[] = [];
  readonly #dropped = new Set<string>();
  #seen = 0;
  #count = 0;

  /** Adds the next page, in order. Rows that break a rule are left out and listed by name, like any other section. */
  add(page: readonly unknown[]): void {
    if (!Array.isArray(page)) throw new TypeError('a page of study events must be a list');
    const rows = cleanStudyEvents(page, this.#dropped, this.#seen);
    this.#seen += page.length;
    if (!rows.length) return;
    this.#json.push(new Blob([studyEventJson(rows, this.#count === 0)]));
    this.#csv.push(new Blob([csvLines(studyEventHeaders, rows)]));
    this.#count += rows.length;
  }

  /** How many events are in the export. */
  get count(): number { return this.#count; }

  /** The written pages and the names of anything left out. */
  written(): { text: StudyEventText; dropped: readonly string[] } {
    return { text: { count: this.#count, json: [...this.#json], csv: [...this.#csv] }, dropped: [...this.#dropped] };
  }
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
  if (typeof profile.nameChangeWindowStart === 'string') profile.nameChangeWindowStart = utcDate(profile.nameChangeWindowStart)!;
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
  const reviewRows = listSection('reviewRows', reviewRowSchema);
  for (const row of reviewRows) row.updatedAt = utcDate(row.updatedAt)!;
  const supplied = own(source, 'studyEvents');
  let studyEvents: StudyEventText = { count: 0, json: [], csv: [] };
  if (supplied instanceof StudyEventPages) {
    const written = supplied.written();
    studyEvents = written.text;
    for (const name of written.dropped) dropped.add(name);
  } else if (Object.hasOwn(source, 'studyEvents')) {
    const rows = cleanStudyEvents(supplied, dropped);
    studyEvents = {
      count: rows.length, json: [studyEventJson(rows, true)], csv: [csvLines(studyEventHeaders, rows)],
    };
  }
  return {
    data: {
      profile,
      onboarding: recordSection('onboarding', onboardingSchema),
      progress,
      reviewState: listSection('reviewState', reviewSchema),
      gameStats: listSection('gameStats', gameSchema),
      attempts,
      examPlans,
      reviewRows,
      reports,
      studyEvents,
    },
    dropped: [...dropped].sort(),
  };
}

function exportDay(exportDate: string): string {
  const normalized = utcDate(exportDate);
  if (!normalized) throw new Error('pass the export date as a real day or an ISO date and time.');
  return normalized;
}

/** The JSON file in order. studyEvents is written from its pages, so the rows are never one array here. */
function jsonParts(data: unknown, exportDate: string): (string | Blob)[] {
  const clean = prepare(data);
  const { studyEvents, ...before } = clean.data;
  const head = JSON.stringify({ format: 'cueory-export-1', exportDate: exportDay(exportDate), ...before }, null, 2);
  return [
    head.slice(0, -'\n}'.length), ',\n  "studyEvents": ',
    ...(studyEvents.count ? ['[\n', ...studyEvents.json, '\n  ]'] : ['[]']),
    ',\n  "dropped": ', JSON.stringify(clean.dropped, null, 2).replace(/\n/g, '\n  '), '\n}',
  ];
}

function asText(parts: readonly (string | Blob)[]): string {
  return parts.map(part => {
    if (typeof part !== 'string') throw new Error('a long study history downloads with exportJsonBlob and exportCsvBlobs.');
    return part;
  }).join('');
}

/**
 * Fixed field order; preserves record order, so attempts and review histories stay meaningful. Text, for data held
 * in memory; loadExport's data, whose study events are pages, goes through exportJsonBlob.
 */
export function exportJson(data: unknown, exportDate: string): string {
  return asText(jsonParts(data, exportDate));
}

/** The same JSON file as exportJson, as a Blob built from the study-event pages without joining them into one string. */
export function exportJsonBlob(data: unknown, exportDate: string): Blob {
  return new Blob(jsonParts(data, exportDate), { type: 'application/json' });
}

function csvCell(value: Cell | undefined): string {
  let cell = value === null || value === undefined ? '' : typeof value === 'object' ? value.join(';') : String(value);
  if (/^[=+\-@\t\r\n]/.test(cell)) cell = `'${cell}`;
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}
function csvLines(headers: string[], rows: Row[]): string {
  return rows.map(row => headers.map(key => csvCell(row[key])).join(',') + '\r\n').join('');
}
function csv(headers: string[], rows: Row[]): string {
  return headers.map(csvCell).join(',') + '\r\n' + csvLines(headers, rows);
}

function csvParts(data: unknown): { fileName: string; parts: (string | Blob)[] }[] {
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
  const file = (fileName: string, headers: string[], rows: Row[]) => ({ fileName, parts: [csv(headers, rows)] });
  return [
    file('profile.csv', Object.keys(profileSchema), recordRows(clean.data.profile)),
    file('onboarding.csv', Object.keys(onboardingSchema), recordRows(clean.data.onboarding)),
    file('progress.csv', [...Object.keys(progressSchema), 'deckId', 'progressVersion', 'course', 'examDate', 'done'], progressRows),
    file('reviewState.csv', Object.keys(reviewSchema), clean.data.reviewState),
    file('gameStats.csv', Object.keys(gameSchema), clean.data.gameStats),
    file('attempts.csv', Object.keys(attemptSchema), clean.data.attempts),
    file('examPlans.csv', Object.keys(examPlanSchema), clean.data.examPlans),
    file('reviewRows.csv', Object.keys(reviewRowSchema), clean.data.reviewRows),
    file('reports.csv', Object.keys(reportSchema), clean.data.reports),
    { fileName: 'studyEvents.csv', parts: [csv(studyEventHeaders, []), ...clean.data.studyEvents.csv] },
    file('dropped.csv', ['dropped'], clean.dropped.map(dropped => ({ dropped }))),
  ];
}

/**
 * The dropped-fields file is a report of names only; discarded values are never read or copied. Text, for data held
 * in memory; loadExport's data, whose study events are pages, goes through exportCsvBlobs.
 */
export function exportCsv(data: unknown): CsvFile[] {
  return csvParts(data).map(({ fileName, parts }) => ({ fileName, text: asText(parts) }));
}

/** The same CSV files as exportCsv, each a Blob; studyEvents.csv is built from its pages without joining them. */
export function exportCsvBlobs(data: unknown): CsvBlob[] {
  return csvParts(data).map(({ fileName, parts }) => ({ fileName, blob: new Blob(parts, { type: 'text/csv;charset=utf-8' }) }));
}
