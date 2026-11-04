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
 * account is the student's own sign-in record from Supabase Auth (`auth.getUser()`, Task 309): when the account was
 * made and last signed in, the sign-in methods, `user_metadata` and each identity's `identity_data` (with Google
 * sign-in: name, profile-photo link, Google account id, email and whether it is verified), copied as plain JSON.
 * account.csv lists it one field per line (`identities[0].identityData.name`, …). sessions holds the student's own
 * sign-in sessions as `my_sessions()` returns them (supabase/migrations/20261102160000): when, browser and IP address,
 * without the session id, which is only the read cursor.
 * Row caps: attempts and reviewRows keep their first 50,000 rows, examPlans its first 10, reports and sessions their
 * first 10,000 and account.identities its first 20; the rest is reported in `dropped` as `<section>[<cap>+]`.
 * studyEvents has no cap: the whole history is exported.
 */
import { dailyGames } from '../config/games';
import { isCourse, isExamDate, PROGRESS_VERSION, type DeckProgress, type Progress } from '../scripts/progress';
import type { GameStats } from './gamestats';

/** Plain JSON, as Supabase Auth returns `user_metadata` and `identity_data`. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonObject;
export interface JsonObject { readonly [key: string]: JsonValue }

export interface AccountIdentity {
  provider: string; identityData: JsonObject; createdAt: string | null; lastSignInAt: string | null;
}
export interface SessionRow {
  createdAt: string | null; updatedAt: string | null; notAfter: string | null; userAgent: string | null; ip: string | null;
}

export interface ExportData {
  profile?: {
    displayName?: string | null; email?: string | null; createdAt?: string | null;
    /** Keep the active display-name change limit history already exported on staging. */
    nameChangeWindowStart?: string | null; nameChangesInWindow?: number;
  };
  /** The student's own sign-in record from Supabase Auth, as `auth.getUser()` returns it. */
  account?: {
    createdAt?: string | null; lastSignInAt?: string | null; providers?: readonly string[];
    userMetadata?: JsonObject; identities?: readonly AccountIdentity[];
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
  /** The student's own sign-in sessions, as `my_sessions()` returns them. */
  sessions?: readonly SessionRow[];
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
type Cell = string | number | boolean | null | readonly string[] | JsonObject;
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
/**
 * A fresh copy of plain JSON: own data properties only (getters never run), at most 6 levels deep, 200 entries in an
 * object or list and 10,000 characters in a text. Anything else gives undefined, so the caller refuses or drops it.
 */
export function jsonCopy(value: unknown, depth = 0): JsonValue | undefined {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return value.length <= 10_000 ? value : undefined;
  if (depth >= 6) return;
  if (Array.isArray(value)) {
    if (value.length > 200 || Object.keys(value).length !== value.length) return;
    const list: JsonValue[] = [];
    for (let index = 0; index < value.length; index++) {
      const copy = jsonCopy(own(value, String(index)), depth + 1);
      if (copy === undefined) return;
      list.push(copy);
    }
    return list;
  }
  if (!plain(value)) return;
  const keys = Object.keys(value);
  if (keys.length > 200) return;
  const entries: [string, JsonValue][] = [];
  for (const key of keys) {
    const copy = jsonCopy(own(value, key), depth + 1);
    if (copy === undefined) return;
    entries.push([key, copy]);
  }
  // fromEntries defines each key as its own property, so a key named __proto__ stays plain data.
  return Object.fromEntries(entries);
}
const jsonObject = (value: unknown) => plain(value) && jsonCopy(value) !== undefined;
const nullableDate = (value: unknown) => value === null || date(value);
/** A Supabase Auth provider name, such as google or email. */
const providerName = (value: unknown) => typeof value === 'string' && /^[a-z0-9_-]{1,40}$/.test(value);
function providerList(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 20 || Object.keys(value).length !== value.length) return false;
  for (let index = 0; index < value.length; index++) if (!providerName(own(value, String(index)))) return false;
  return true;
}
const accountSchema: Schema = {
  createdAt: nullableDate, lastSignInAt: nullableDate, providers: providerList, userMetadata: jsonObject,
  identities: value => Array.isArray(value),
};
const identitySchema: Schema = { provider: providerName, identityData: jsonObject, createdAt: nullableDate, lastSignInAt: nullableDate };
const sessionSchema: Schema = {
  createdAt: nullableDate, updatedAt: nullableDate, notAfter: nullableDate, userAgent: nullableText, ip: nullableText,
};
const sections = ['profile', 'account', 'onboarding', 'progress', 'reviewState', 'gameStats', 'attempts', 'examPlans', 'reviewRows', 'reports', 'sessions', 'studyEvents'] as const;
const rowCaps: Partial<Record<Section, number>> = {
  attempts: 50_000, examPlans: 10, reviewRows: 50_000, reports: 10_000, sessions: 10_000,
};
const IDENTITY_CAP = 20;
type Section = typeof sections[number];
interface GuestSnapshot {
  version: typeof PROGRESS_VERSION;
  onboarding: Row;
  decks: Record<string, Partial<DeckProgress>>;
}
interface Sections {
  profile: Row;
  /** Row fields, and identities as checked rows. */
  account: Record<string, Cell | Row[]>;
  onboarding: Row;
  progress: Row[] | GuestSnapshot;
  reviewState: Row[];
  gameStats: Row[];
  attempts: Row[];
  examPlans: Row[];
  reviewRows: Row[];
  reports: Row[];
  sessions: Row[];
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
  const sessions = listSection('sessions', sessionSchema);
  for (const row of sessions) {
    for (const key of ['createdAt', 'updatedAt', 'notAfter']) if (typeof row[key] === 'string') row[key] = utcDate(row[key])!;
  }
  const account: Sections['account'] = recordSection('account', accountSchema);
  for (const key of ['createdAt', 'lastSignInAt']) if (typeof account[key] === 'string') account[key] = utcDate(account[key])!;
  if (Object.hasOwn(account, 'providers')) account.providers = Array.from(account.providers as readonly string[]);
  if (Object.hasOwn(account, 'userMetadata')) account.userMetadata = jsonCopy(account.userMetadata) as JsonObject;
  if (Object.hasOwn(account, 'identities')) {
    // The schema only checked that identities is a list; each identity is checked here, from the caller's own list.
    const identities = cleanList(own(own(source, 'account') as object, 'identities'), identitySchema, 'account.identities',
      dropped, IDENTITY_CAP);
    for (const row of identities) {
      row.identityData = jsonCopy(row.identityData) as JsonObject;
      for (const key of ['createdAt', 'lastSignInAt']) if (typeof row[key] === 'string') row[key] = utcDate(row[key])!;
    }
    account.identities = identities;
  }
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
      account,
      onboarding: recordSection('onboarding', onboardingSchema),
      progress,
      reviewState: listSection('reviewState', reviewSchema),
      gameStats: listSection('gameStats', gameSchema),
      attempts,
      examPlans,
      reviewRows,
      reports,
      sessions,
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
  let cell = value === null || value === undefined ? '' : typeof value !== 'object' ? String(value)
    : Array.isArray(value) ? value.join(';') : JSON.stringify(value);
  if (/^[=+\-@\t\r\n]/.test(cell)) cell = `'${cell}`;
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}
function csvLines(headers: string[], rows: Row[]): string {
  return rows.map(row => headers.map(key => csvCell(row[key])).join(',') + '\r\n').join('');
}
function csv(headers: string[], rows: Row[]): string {
  return headers.map(csvCell).join(',') + '\r\n' + csvLines(headers, rows);
}

/**
 * account.csv: one line per field, in the JSON's order. Nested JSON is named by its path, such as
 * `userMetadata.custom_claims.hd` or `identities[0].identityData.name`; sign-in methods are joined with ";".
 */
function accountRows(account: Sections['account']): Row[] {
  const rows: Row[] = [];
  const add = (field: string, value: unknown) => {
    if (value === undefined) return;
    if (value !== null && typeof value === 'object' && !(field === 'providers' && Array.isArray(value))) {
      const children = Array.isArray(value)
        ? value.map((child, index) => [`${field}[${index}]`, child] as const)
        : Object.entries(value).map(([key, child]) => [`${field}.${key}`, child] as const);
      for (const [name, child] of children) add(name, child);
      return;
    }
    rows.push({ field, value: value as Cell });
  };
  for (const key of Object.keys(accountSchema)) add(key, account[key]);
  return rows;
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
    file('account.csv', ['field', 'value'], accountRows(clean.data.account)),
    file('onboarding.csv', Object.keys(onboardingSchema), recordRows(clean.data.onboarding)),
    file('progress.csv', [...Object.keys(progressSchema), 'deckId', 'progressVersion', 'course', 'examDate', 'done'], progressRows),
    file('reviewState.csv', Object.keys(reviewSchema), clean.data.reviewState),
    file('gameStats.csv', Object.keys(gameSchema), clean.data.gameStats),
    file('attempts.csv', Object.keys(attemptSchema), clean.data.attempts),
    file('examPlans.csv', Object.keys(examPlanSchema), clean.data.examPlans),
    file('reviewRows.csv', Object.keys(reviewRowSchema), clean.data.reviewRows),
    file('reports.csv', Object.keys(reportSchema), clean.data.reports),
    file('sessions.csv', Object.keys(sessionSchema), clean.data.sessions),
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
