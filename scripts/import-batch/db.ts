/**
 * Reads and writes the importer's tables through supabase-js (Task 139).
 *
 * Only a handful of calls are used (`from().select().in()`, `insert().select()`, `update().eq()`, `delete().eq()` and
 * `rpc('publish_item_version')`), described by `DbClient`, so tests can hand in a fake client with the same shape.
 *
 * Supabase's REST interface runs each call on its own, so most steps are not in one transaction. Instead every write
 * is one that a later run recognises: items have uuids derived from their batch id, sources and concepts are found by
 * slug, versions by (item, version), and an unfinished draft is rewritten. Running the same command again after a
 * failure finishes the job. The one step that must never be half done, swapping a question's published version, goes
 * through publish_item_version, which retires the old version and publishes the new one in a single transaction, so a
 * failure leaves the live version live.
 */
import type { AnswerRow, ChoiceRow, ConceptRow, ItemRow, Plan, Snapshot, SourceRow, VersionRow } from './plan.ts';

export type Row = Record<string, unknown>;
export interface DbError { message?: string; code?: string }
export interface DbResult<T> { data: T | null; error: DbError | null }
export interface Filter<T> extends PromiseLike<DbResult<T>> {
  eq(column: string, value: unknown): Filter<T>;
  in(column: string, values: readonly unknown[]): Filter<T>;
  select(columns: string): Filter<Row[]>;
}
export interface Table {
  select(columns: string): Filter<Row[]>;
  insert(rows: Row[]): Filter<null>;
  update(patch: Row): Filter<null>;
  delete(): Filter<null>;
}
export interface DbClient {
  from(table: string): Table;
  rpc(fn: 'publish_item_version', args: { p_version_id: string }): PromiseLike<DbResult<unknown>>;
}

/** A write or read that failed: which step, and the database's own short message. */
export class ImportFailure extends Error {
  readonly step: string;
  readonly code: string;
  constructor(step: string, detail: string, code = '') {
    super(detail);
    this.step = step;
    this.code = code;
  }
}

/** Only the code and the first 300 characters of the message: never `details` or `hint`, never a whole response. */
function failure(step: string, error: DbError): ImportFailure {
  const message = typeof error.message === 'string' ? error.message.replace(/\s+/g, ' ').slice(0, 300) : 'no message';
  return new ImportFailure(step, message, typeof error.code === 'string' ? error.code.slice(0, 20) : '');
}

async function run<T>(step: string, query: PromiseLike<DbResult<T>>): Promise<T | null> {
  let result: DbResult<T>;
  try {
    result = await query;
  } catch (error) {
    // A network failure: the message only ("fetch failed"), never the request.
    const message = error instanceof Error ? error.message : 'the request failed';
    throw new ImportFailure(step, message.slice(0, 300), 'network');
  }
  if (result.error) throw failure(step, result.error);
  return result.data;
}

// PostgREST returns at most 1,000 rows per request by default; fewer ids per request keeps every answer well under it,
// and a full page is refused rather than trusted, so nothing is ever compared against half a table.
const CHUNK = 50;
const PAGE_LIMIT = 1000;

async function selectIn(client: DbClient, table: string, columns: string, column: string, values: string[]): Promise<Row[]> {
  const rows: Row[] = [];
  for (let i = 0; i < values.length; i += CHUNK) {
    const part = values.slice(i, i + CHUNK);
    const data = (await run(`reading ${table}`, client.from(table).select(columns).in(column, part))) ?? [];
    if (data.length >= PAGE_LIMIT) throw new ImportFailure(`reading ${table}`, 'the database returned a full page, so the importer cannot be sure it saw every row');
    rows.push(...data);
  }
  return rows;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Reads every row the plan depends on. Reads only: nothing is written. */
export async function loadSnapshot(client: DbClient, wanted: { conceptSlugs: string[]; sourceSlugs: string[]; itemIds: string[] }): Promise<Snapshot> {
  const concepts = await selectIn(client, 'concepts', 'id,slug,title,published', 'slug', wanted.conceptSlugs);
  const sources = await selectIn(client, 'sources', 'id,slug,title,publisher,url,license,published', 'slug', wanted.sourceSlugs);
  const items = await selectIn(client, 'items', 'id,concept_id,type', 'id', wanted.itemIds);
  const versions = await selectIn(client, 'item_versions', 'id,item_id,version,stem,status,source_id', 'item_id', items.map(row => str(row.id)));

  const snapshot: Snapshot = { connected: true, concepts: new Map(), sources: new Map(), items: new Map(), versions: new Map(), parts: new Map() };
  for (const row of concepts) snapshot.concepts.set(str(row.slug), { id: str(row.id), slug: str(row.slug), title: str(row.title), published: row.published === true } satisfies ConceptRow);
  for (const row of sources) {
    snapshot.sources.set(str(row.slug), {
      id: str(row.id), slug: str(row.slug), title: str(row.title), publisher: str(row.publisher), url: str(row.url), license: str(row.license), published: row.published === true,
    } satisfies SourceRow);
  }
  for (const row of items) snapshot.items.set(str(row.id), { id: str(row.id), concept_id: str(row.concept_id), type: str(row.type) } satisfies ItemRow);
  for (const row of versions) {
    const version: VersionRow = {
      id: str(row.id), item_id: str(row.item_id), version: Number(row.version), stem: str(row.stem), status: str(row.status),
      source_id: typeof row.source_id === 'string' ? row.source_id : null,
    };
    snapshot.versions.set(version.item_id, [...(snapshot.versions.get(version.item_id) ?? []), version]);
  }
  const latest = [...snapshot.versions.values()].map(list => list.reduce((a, b) => (b.version > a.version ? b : a)).id);
  const choices = await selectIn(client, 'item_choices', 'item_version_id,choice_id,text', 'item_version_id', latest);
  const answers = await selectIn(client, 'item_answers', 'item_version_id,choice_id,is_correct,rationale', 'item_version_id', latest);
  for (const id of latest) snapshot.parts.set(id, { choices: [], answers: [] });
  for (const row of choices) snapshot.parts.get(str(row.item_version_id))?.choices.push({ choice_id: str(row.choice_id), text: str(row.text) } satisfies ChoiceRow);
  for (const row of answers) {
    snapshot.parts.get(str(row.item_version_id))?.answers.push({ choice_id: str(row.choice_id), is_correct: row.is_correct === true, rationale: str(row.rationale) } satisfies AnswerRow);
  }
  return snapshot;
}

/** Ids that an insert returned, by the given column, checking that every row came back. */
function idsBy(step: string, rows: Row[] | null, column: string, expected: number): Map<string, string> {
  const map = new Map((rows ?? []).map(row => [str(row[column]), str(row.id)]));
  if (map.size !== expected) throw new ImportFailure(step, `expected ${expected} row(s) back, got ${map.size}`);
  return map;
}

/** An update that must change exactly one row, so a missed match never passes silently. */
async function updateOne(client: DbClient, step: string, table: string, patch: Row, filters: [string, unknown][]): Promise<void> {
  let query = client.from(table).update(patch);
  for (const [column, value] of filters) query = query.eq(column, value);
  const rows = await run(step, query.select('id'));
  if ((rows ?? []).length !== 1) throw new ImportFailure(step, `expected to change 1 row, changed ${(rows ?? []).length}`);
}

/**
 * Writes the plan: sources, then concepts, then items, then each question's version, its choices and its answers,
 * and last its publication. Stops at the first error (the ImportFailure says where). `progress` gets one line per
 * finished question, so a stop shows what was already done.
 */
export async function applyPlan(client: DbClient, plan: Plan, db: Snapshot, progress: (line: string) => void): Promise<void> {
  const sourceIds = new Map([...db.sources].map(([slug, row]) => [slug, row.id]));
  const conceptIds = new Map([...db.concepts].map(([slug, row]) => [slug, row.id]));

  if (plan.newSources.length) {
    const rows = await run('adding sources', client.from('sources').insert(plan.newSources).select('id,slug'));
    for (const [slug, id] of idsBy('adding sources', rows, 'slug', plan.newSources.length)) sourceIds.set(slug, id);
  }
  if (plan.publishSources.length) {
    await run('publishing sources', client.from('sources').update({ published: true }).in('slug', plan.publishSources));
  }
  if (plan.newConcepts.length) {
    const rows = await run('adding concepts', client.from('concepts').insert(plan.newConcepts).select('id,slug'));
    for (const [slug, id] of idsBy('adding concepts', rows, 'slug', plan.newConcepts.length)) conceptIds.set(slug, id);
  }
  if (plan.publishConcepts.length) {
    await run('publishing concepts', client.from('concepts').update({ published: true }).in('slug', plan.publishConcepts));
  }
  if (plan.newItems.length) {
    const rows = plan.newItems.map(item => {
      const conceptId = conceptIds.get(item.conceptSlug);
      if (!conceptId) throw new ImportFailure('adding items', `concept ${item.conceptSlug} is not in the database`);
      return { id: item.id, concept_id: conceptId, type: item.type };
    });
    idsBy('adding items', await run('adding items', client.from('items').insert(rows).select('id')), 'id', rows.length);
  }

  for (const step of plan.steps) {
    const where = (what: string) => `${what} for ${step.batchId}`;
    const sourceId = sourceIds.get(step.content.sourceSlug);
    if (!sourceId) throw new ImportFailure(where('writing the question'), `source ${step.content.sourceSlug} is not in the database`);
    let versionId = step.existingVersionId;

    if (step.action === 'new') {
      const rows = await run(where('adding version'), client.from('item_versions')
        .insert([{ item_id: step.itemId, version: step.version, stem: step.content.stem, source_id: sourceId, status: 'draft' }]).select('id'));
      versionId = str(rows?.[0]?.id);
      if (!versionId) throw new ImportFailure(where('adding version'), 'the database did not return the new version');
    } else if (step.action === 'rewrite-draft') {
      await updateOne(client, where('rewriting draft'), 'item_versions', { stem: step.content.stem, source_id: sourceId },
        [['id', versionId], ['status', 'draft']]);
      await run(where('clearing draft answers'), client.from('item_answers').delete().eq('item_version_id', versionId));
      await run(where('clearing draft choices'), client.from('item_choices').delete().eq('item_version_id', versionId));
    }
    if (step.action === 'new' || step.action === 'rewrite-draft') {
      // Choices first: each answer row points at its choice.
      await run(where('adding choices'), client.from('item_choices').insert(step.content.choices.map(c => ({ item_version_id: versionId, ...c }))));
      await run(where('adding answers'), client.from('item_answers').insert(step.content.answers.map(a => ({ item_version_id: versionId, ...a }))));
    }
    if (step.publish) {
      // One transaction: the old version is retired only if the new one is published (supabase/migrations/
      // 20261102090000_publish_item_version.sql).
      if (!versionId) throw new ImportFailure(where('publishing'), 'there is no version to publish');
      await run(where('publishing'), client.rpc('publish_item_version', { p_version_id: versionId }));
    }
    if ((step.action !== 'unchanged' && step.action !== 'retired-kept') || step.publish) progress(`  ${step.batchId}  done`);
  }
}
