/**
 * Task 172: loads one concept's published questions from the database for the real questions page (D-33, D-86).
 *
 * Reads only what the website roles are granted (20261101080000_concepts_sources_rights.sql and
 * 20261101090000_items_and_versions.sql): the concept by slug, its items, each item's published version
 * (id, item_id, version, stem, status) and that version's choices. Row-level security already hides anything
 * unpublished; this module also checks every row it gets back and refuses the whole set if one is malformed.
 * It never names item_answers or any answer column: right/wrong, the key and the rationales come only from
 * check_answer after an attempt (questionsremote.ts).
 *
 * Paging: every list is read with `.range()` in pages of PAGE_SIZE rows in a fixed order, and `.in()` filters are
 * split into chunks of PAGE_SIZE ids so the request address stays short. PAGE_SIZE stays well under PostgREST's
 * max-rows setting (1,000 on Supabase unless changed), so a short page means the list has ended.
 * https://supabase.com/docs/reference/javascript/range
 * https://supabase.com/docs/reference/javascript/select
 */
import type { AnswerTransport, CheckItem } from './checkanswer';
import { startQuestions, type ChoiceId, type Question } from './questions';
import type { SessionReader, SessionState } from './supabaseclient';

export const PAGE_SIZE = 100;
/** One session holds at most this many questions; a longer concept shows its first ones, in order. */
export const MAX_QUESTIONS = 500;

/** The tables this module may read. item_answers is deliberately not one of them. */
export type PublicTable = 'concepts' | 'items' | 'item_versions' | 'item_choices';
export interface Reply { data: unknown; error: unknown }
/** The part of a Supabase query builder this module uses, so tests can pass a fake. */
export interface Query extends PromiseLike<Reply> {
  eq(column: string, value: string | boolean): Query;
  in(column: string, values: readonly string[]): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  range(from: number, to: number): Query;
}
export interface ReadClient { from(table: PublicTable): { select(columns: string): Query } }

export interface PublishedConcept { id: string; slug: string; title: string }
export type LoadResult =
  | { ok: true; concept: PublishedConcept; questions: Question[]; versions: CheckItem[] }
  | { ok: false; reason: 'not-found' | 'failed' };

// Exactly the granted columns, and nothing that could carry an answer.
export const COLUMNS = {
  concepts: 'id, slug, title',
  items: 'id, type',
  item_versions: 'id, item_id, version, stem, status',
  item_choices: 'item_version_id, choice_id, text',
} as const satisfies Record<PublicTable, string>;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHOICES: readonly ChoiceId[] = ['a', 'b', 'c', 'd', 'e'];

/** Same shape as the database's slug domain: lowercase words joined by dashes, at most 80 characters. */
export const isConceptSlug = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 80 && SLUG.test(value);

class BadRows extends Error {}
const bad = (): never => { throw new BadRows('a row did not match the published question shape'); };

const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
// Printable text of the length the database allows (its checks refuse control characters too).
const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length >= 1 && value.length <= max && value.trim() !== '' &&
  !/[\u0000-\u001f\u007f-\u009f]/.test(value);

/** A plain object with exactly these keys, so an answer column that slipped into a reply is refused. */
function row(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return bad();
  const record = value as Record<string, unknown>;
  const own = Object.keys(record);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) return bad();
  return record;
}
const fields = (columns: string) => columns.split(', ');

async function page(query: Query): Promise<unknown[]> {
  const reply = await query;
  if (reply === null || typeof reply !== 'object' || (reply.error !== null && reply.error !== undefined)) return bad();
  if (!Array.isArray(reply.data) || reply.data.length > PAGE_SIZE) return bad();
  return reply.data;
}

/** Reads every page of a query, or stops once `limit` rows are in. `make` builds a fresh, ordered query each time. */
async function readAll(make: () => Query, limit = Number.POSITIVE_INFINITY): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let from = 0; rows.length < limit; from += PAGE_SIZE) {
    const next = await page(make().range(from, from + PAGE_SIZE - 1));
    rows.push(...next);
    if (next.length < PAGE_SIZE) break;
  }
  return rows.slice(0, limit);
}

function chunks<T>(values: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += PAGE_SIZE) result.push(values.slice(index, index + PAGE_SIZE));
  return result;
}

/**
 * The concept's published questions in a stable order, as public Questions (id = item_id) plus the published version
 * each one was shown at, ready for remoteChecker. An item whose version was retired between two reads is left out.
 */
export async function loadPublishedQuestions(client: ReadClient, slug: unknown): Promise<LoadResult> {
  if (!isConceptSlug(slug)) return { ok: false, reason: 'not-found' };
  try {
    const select = (table: PublicTable) => client.from(table).select(COLUMNS[table]);

    const conceptRows = await page(select('concepts').eq('slug', slug).eq('published', true).order('id').range(0, 1));
    if (conceptRows.length === 0) return { ok: false, reason: 'not-found' };
    if (conceptRows.length > 1) return bad();
    const conceptRow = row(conceptRows[0], fields(COLUMNS.concepts));
    if (!isUuid(conceptRow.id) || conceptRow.slug !== slug || !isText(conceptRow.title, 200)) return bad();
    const concept: PublishedConcept = { id: conceptRow.id, slug, title: conceptRow.title as string };

    const items = (await readAll(() => select('items').eq('concept_id', concept.id).order('created_at').order('id'),
      MAX_QUESTIONS)).map(value => {
      const item = row(value, fields(COLUMNS.items));
      if (!isUuid(item.id) || (item.type !== 'single' && item.type !== 'sata')) return bad();
      return { id: item.id, type: item.type as Question['type'] };
    });
    if (new Set(items.map(item => item.id)).size !== items.length) return bad();
    if (items.length === 0) return { ok: false, reason: 'not-found' };

    const versions = new Map<string, { id: string; stem: string }>();
    const versionIds = new Set<string>();
    for (const ids of chunks(items.map(item => item.id))) {
      const wanted = new Set(ids);
      for (const value of await readAll(() => select('item_versions').in('item_id', ids).eq('status', 'published').order('id'))) {
        const version = row(value, fields(COLUMNS.item_versions));
        if (!isUuid(version.id) || !isUuid(version.item_id) || !wanted.has(version.item_id) ||
            !Number.isSafeInteger(version.version) || (version.version as number) < 1 ||
            !isText(version.stem, 1000) || version.status !== 'published' ||
            versions.has(version.item_id) || versionIds.has(version.id)) return bad();
        versions.set(version.item_id, { id: version.id, stem: version.stem as string });
        versionIds.add(version.id);
      }
    }

    const choices = new Map<string, Map<ChoiceId, string>>();
    for (const ids of chunks([...versionIds])) {
      for (const value of await readAll(() =>
        select('item_choices').in('item_version_id', ids).order('item_version_id').order('choice_id'))) {
        const choice = row(value, fields(COLUMNS.item_choices));
        const letter = choice.choice_id as ChoiceId;
        if (!isUuid(choice.item_version_id) || !ids.includes(choice.item_version_id) ||
            !CHOICES.includes(letter) || !isText(choice.text, 300)) return bad();
        const set = choices.get(choice.item_version_id) ?? new Map<ChoiceId, string>();
        if (set.has(letter)) return bad();
        set.set(letter, choice.text as string);
        choices.set(choice.item_version_id, set);
      }
    }

    const questions: Question[] = [];
    const checks: CheckItem[] = [];
    for (const item of items) {
      const version = versions.get(item.id);
      if (!version) continue;
      const set = choices.get(version.id);
      if (!set || set.size < 2 || set.size > 5) return bad();
      questions.push({
        id: item.id, type: item.type, stem: version.stem,
        choices: CHOICES.filter(letter => set.has(letter)).map(letter => ({ id: letter, text: set.get(letter)! })),
      });
      checks.push({ item_id: item.id, id: version.id });
    }
    if (questions.length === 0) return { ok: false, reason: 'not-found' };
    // The player's own validation, so a set it would refuse fails here, before anything is shown.
    startQuestions(questions);
    return { ok: true, concept, questions, versions: checks };
  } catch {
    // Never show or log a database or network message; the page offers to try again.
    return { ok: false, reason: 'failed' };
  }
}

/** What the page's client needs: reading the public tables, check_answer, and the local session. */
export type PublishedClient = ReadClient & AnswerTransport & SessionReader;

export type QuestionsView =
  | { view: 'off' }
  | { view: 'signed-out'; next: string }
  | { view: 'not-found' }
  | { view: 'failed' }
  | { view: 'ready'; concept: PublishedConcept; questions: Question[]; versions: CheckItem[]; transport: AnswerTransport };

/** Where sign-in and sign-up should come back to: this page with its concept, and nothing else from the address. */
export function returnPath(pathname: string, slug: string | null): string {
  return isConceptSlug(slug) ? `${pathname}?concept=${slug}` : pathname;
}

/**
 * Decides what the page shows. Accounts off: nothing is downloaded or asked. Signed out: no question is read (D-86,
 * real questions are for signed-in students). Signed in: the concept from `?concept=` is loaded.
 */
export async function openPublishedQuestions(
  location: { pathname: string; search: string },
  getClient: () => Promise<PublishedClient | null>,
  readSession: (client: PublishedClient) => Promise<SessionState>,
): Promise<QuestionsView> {
  let client: PublishedClient | null;
  try { client = await getClient(); }
  catch { return { view: 'failed' }; }
  if (!client) return { view: 'off' };
  const slug = new URLSearchParams(location.search).get('concept');
  const session = await readSession(client);
  if (!session.signedIn) return { view: 'signed-out', next: returnPath(location.pathname, slug) };
  const loaded = await loadPublishedQuestions(client, slug);
  if (!loaded.ok) return { view: loaded.reason };
  // The client itself is the transport, so its rpc method keeps its receiver (questionsremote.ts).
  return { view: 'ready', concept: loaded.concept, questions: loaded.questions, versions: loaded.versions, transport: client };
}
