/**
 * Works out what importing a passed batch would write (Task 139). Pure: no files, no network. The database's current
 * rows come in as a Snapshot (empty when the dry run is not connected to a project), so every rule is unit tested.
 *
 * The schema it targets (supabase/migrations, D-84, D-85):
 * - `sources` (slug, title, publisher, url, license, published) and `concepts` (slug, title, published), matched by slug.
 * - `items` (id, concept_id, type). The schema has no column for the batch's item_id, so an item's uuid is derived from
 *   it (UUID version 5, RFC 9562): the same batch id always gives the same uuid, which is what makes a re-run find it.
 * - `item_versions` (item_id, version, stem, status, source_id), `item_choices` (choice_id, text) and `item_answers`
 *   (choice_id, is_correct, rationale: the key, which only ever goes in that table).
 * A published version is never edited: a changed question gets a new version (D-85).
 */
import { createHash } from 'node:crypto';
import type { CsvRow } from '../check-batch/csv.ts';
import type { ImportItem } from './parse.ts';

// ---------------------------------------------------------------- ids

/** Fixed namespace for item uuids. Never change it: every imported item's uuid depends on it. */
export const ITEM_NAMESPACE = 'a3c1e7d2-5b8f-4c6e-9d0a-2f71b4e8c953';

/** RFC 9562 UUID version 5 (SHA-1 of the namespace bytes and the name). */
export function uuidV5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replaceAll('-', ''), 'hex');
  if (ns.length !== 16) throw new Error('the namespace must be a uuid');
  const bytes = createHash('sha1').update(ns).update(name, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The database uuid of a batch item id. Ids are case-sensitive, as the checker treats them. */
export const itemUuid = (batchItemId: string): string => uuidV5(`item:${batchItemId}`, ITEM_NAMESPACE);

// ---------------------------------------------------------------- database shapes (only the columns we read)

export interface ConceptRow { id: string; slug: string; title: string; published: boolean }
export interface SourceRow { id: string; slug: string; title: string; publisher: string; url: string; license: string; published: boolean }
export interface ItemRow { id: string; concept_id: string; type: string }
export interface VersionRow { id: string; item_id: string; version: number; stem: string; status: string; source_id: string | null }
export interface ChoiceRow { choice_id: string; text: string }
export interface AnswerRow { choice_id: string; is_correct: boolean; rationale: string }

export interface Snapshot {
  /** False for an offline dry run: the database is treated as empty and nothing is compared. */
  connected: boolean;
  concepts: Map<string, ConceptRow>;
  sources: Map<string, SourceRow>;
  items: Map<string, ItemRow>;
  /** Item uuid → every version of it. */
  versions: Map<string, VersionRow[]>;
  /** Version id → its choices and answers. Only the latest version of each item is loaded. */
  parts: Map<string, { choices: ChoiceRow[]; answers: AnswerRow[] }>;
}

export const emptySnapshot = (): Snapshot => ({
  connected: false, concepts: new Map(), sources: new Map(), items: new Map(), versions: new Map(), parts: new Map(),
});

// ---------------------------------------------------------------- the plan

export interface VersionContent { stem: string; sourceSlug: string; choices: ChoiceRow[]; answers: AnswerRow[] }

export type VersionAction =
  /** A new version row (version 1 of a new item, or the next number after a published or retired one). */
  | 'new'
  /** The latest version is an unpublished draft that differs (or is incomplete): it is rewritten in place. */
  | 'rewrite-draft'
  /** The latest version already matches. With --publish it may still need publishing (see `publish`). */
  | 'unchanged'
  /** The latest version matches but was retired in the database: it is left retired, never brought back. */
  | 'retired-kept';

export interface VersionStep {
  batchId: string;
  itemId: string;
  conceptSlug: string;
  action: VersionAction;
  version: number;
  /** The version row this step works on, when it exists already, and its status now. */
  existingVersionId?: string;
  existingStatus?: string;
  /** Set when this step publishes its version. */
  publish: boolean;
  /** The version that is published now and has to be retired first (one published version per item). */
  retireVersionId?: string;
  retireVersion?: number;
  content: VersionContent;
}

export interface Plan {
  /** New rows; `published` is true under --publish, so a new credit line or concept is never left hidden. */
  newSources: { slug: string; title: string; publisher: string; url: string; license: string; published: boolean }[];
  newConcepts: { slug: string; title: string; published: boolean }[];
  /** Existing unpublished rows that --publish marks published, by slug. */
  publishSources: string[];
  publishConcepts: string[];
  newItems: { id: string; batchId: string; conceptSlug: string; type: 'single' | 'sata' }[];
  steps: VersionStep[];
  notes: string[];
  problems: string[];
}

export interface BatchExtras {
  /** sources.csv rows by source_id (title, publisher and license are needed only for a source new to the database). */
  sources: Map<string, CsvRow>;
  /** concepts.csv rows by concept_id (optional file; a title is needed only for a concept new to the database). */
  concepts: Map<string, CsvRow>;
}

// ---------------------------------------------------------------- the database's own limits, checked first

// public.slug: lowercase words separated by single dashes, at most 80 characters.
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// The tables refuse text matching Postgres' [[:cntrl:]]. This is a superset of it (C0, DEL, C1, line and paragraph
// separators), so anything the database would refuse is caught here, before any row is written.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const URL_SHAPE = /^https:\/\/[^\s\u0000-\u001f\u007f-\u009f]+$/u;
/** char_length counts characters (code points), not UTF-16 units. */
const length = (text: string): number => [...text].length;

function textProblem(text: string, what: string, max: number): string | null {
  if (length(text) < 1) return `${what} is empty`;
  if (length(text) > max) return `${what} is ${length(text)} characters; the database allows at most ${max}`;
  if (CONTROL.test(text)) return `${what} has a line break, tab or other control character; the database refuses those, so put it on one line`;
  return null;
}

function slugProblem(id: string, what: string): string | null {
  if (id.length > 80 || !SLUG.test(id)) {
    return `${what} id "${id}" can't be stored as-is: the database needs lowercase letters and digits in words joined by single dashes (like "fluid-balance"), at most 80 characters`;
  }
  return null;
}

const unique = <T>(values: T[]): T[] => [...new Set(values)];

/** The version a batch item becomes. Fails (returns problems) when the schema cannot hold it exactly. */
function contentOf(item: ImportItem): { content?: VersionContent; problems: string[] } {
  const problems: string[] = [];
  const sources = unique(item.sourceIds);
  if (sources.length !== 1) {
    problems.push(`cites ${sources.length} sources (${sources.join(', ')}), but the database keeps one source per question version; cite one, or wait for a schema change`);
  }
  const stem = textProblem(item.stem, 'the question (stem)', 1000);
  if (stem) problems.push(stem);
  for (const choice of item.choices) {
    const text = textProblem(choice.text, `choice ${choice.id}`, 300);
    if (text) problems.push(text);
    const why = textProblem(item.rationales[choice.id] ?? '', `the rationale for choice ${choice.id}`, 600);
    if (why) problems.push(why);
  }
  if (item.choices.length < 2 || item.choices.length > 5) problems.push('a question needs two to five choices');
  if (problems.length) return { problems };
  return {
    problems,
    content: {
      stem: item.stem,
      sourceSlug: sources[0]!,
      choices: item.choices.map(c => ({ choice_id: c.id, text: c.text })),
      answers: item.choices.map(c => ({ choice_id: c.id, is_correct: item.key.includes(c.id), rationale: item.rationales[c.id]! })),
    },
  };
}

const byChoice = <T extends { choice_id: string }>(rows: T[]): T[] => [...rows].sort((a, b) => a.choice_id.localeCompare(b.choice_id));

/** True when a stored version holds exactly this content: same stem, source, choices, key and rationales. */
export function sameContent(version: VersionRow, parts: { choices: ChoiceRow[]; answers: AnswerRow[] } | undefined, content: VersionContent, sourceId: string | undefined): boolean {
  if (!parts || version.stem !== content.stem || version.source_id !== (sourceId ?? null)) return false;
  const choices = byChoice(parts.choices).map(c => [c.choice_id, c.text]);
  const answers = byChoice(parts.answers).map(a => [a.choice_id, a.is_correct, a.rationale]);
  return JSON.stringify(choices) === JSON.stringify(byChoice(content.choices).map(c => [c.choice_id, c.text]))
    && JSON.stringify(answers) === JSON.stringify(byChoice(content.answers).map(a => [a.choice_id, a.is_correct, a.rationale]));
}

export function buildPlan(items: ImportItem[], extras: BatchExtras, db: Snapshot, options: { publish: boolean }): Plan {
  const plan: Plan = { newSources: [], newConcepts: [], publishSources: [], publishConcepts: [], newItems: [], steps: [], notes: [], problems: [] };
  const offline = (text: string) => `${text}, unless it is already in the database (this dry run did not look)`;

  // Sources and concepts the batch uses, each looked up once.
  const sourceSlugs = unique(items.flatMap(item => item.sourceIds));
  for (const slug of sourceSlugs) {
    const bad = slugProblem(slug, 'source');
    if (bad) { plan.problems.push(bad); continue; }
    const stored = db.sources.get(slug);
    const row = extras.sources.get(slug) ?? {};
    if (stored) {
      if (stored.url !== row.url) plan.notes.push(`source ${slug}: the database has a different url; the database copy is kept unchanged`);
      if (options.publish && !stored.published) plan.publishSources.push(slug);
      continue;
    }
    const source = { slug, title: row.title ?? '', publisher: row.publisher ?? '', url: row.url ?? '', license: row.license ?? '', published: options.publish };
    const missing = (['title', 'publisher', 'license'] as const).filter(column => !source[column]);
    const issues = missing.length
      ? [`source ${slug} is new to the database, so sources.csv needs its ${missing.join(', ')} (add the column${missing.length > 1 ? 's' : ''})`]
      : [
          textProblem(source.title, `source ${slug}'s title`, 300),
          textProblem(source.publisher, `source ${slug}'s publisher`, 200),
          textProblem(source.license, `source ${slug}'s license`, 100),
          URL_SHAPE.test(source.url) && length(source.url) <= 500 ? null : `source ${slug}'s url must be a plain https:// address of at most 500 characters`,
        ].filter((issue): issue is string => issue !== null);
    if (issues.length && !db.connected && missing.length) plan.notes.push(offline(issues[0]!));
    else if (issues.length) plan.problems.push(...issues);
    else plan.newSources.push(source);
  }

  for (const slug of unique(items.map(item => item.conceptId))) {
    const bad = slugProblem(slug, 'concept');
    if (bad) { plan.problems.push(bad); continue; }
    const stored = db.concepts.get(slug);
    if (stored) {
      if (options.publish && !stored.published) plan.publishConcepts.push(slug);
      continue;
    }
    const title = extras.concepts.get(slug)?.title ?? '';
    if (!title) {
      const issue = `concept ${slug} is new to the database, so it needs a title: add a concepts.csv with the columns concept_id and title`;
      if (db.connected) plan.problems.push(issue);
      else plan.notes.push(offline(issue));
      continue;
    }
    const issue = textProblem(title, `concept ${slug}'s title`, 200);
    if (issue) { plan.problems.push(issue); continue; }
    plan.newConcepts.push({ slug, title, published: options.publish });
  }

  for (const item of items) {
    const { content, problems } = contentOf(item);
    if (!content) { plan.problems.push(...problems.map(problem => `${item.id}: ${problem}`)); continue; }
    const id = itemUuid(item.id);
    const stored = db.items.get(id);
    if (stored) {
      const concept = db.concepts.get(item.conceptId);
      if (!concept || concept.id !== stored.concept_id) {
        plan.problems.push(`${item.id}: is already in the database under another concept; a question can't move to another concept by import`);
        continue;
      }
      if (stored.type !== item.type) {
        plan.problems.push(`${item.id}: is already in the database as a ${stored.type} question; its type can't change by import`);
        continue;
      }
    } else {
      plan.newItems.push({ id, batchId: item.id, conceptSlug: item.conceptId, type: item.type });
    }

    const versions = [...(db.versions.get(id) ?? [])].sort((a, b) => a.version - b.version);
    const latest = versions.at(-1);
    const published = versions.find(v => v.status === 'published');
    const step: VersionStep = { batchId: item.id, itemId: id, conceptSlug: item.conceptId, action: 'new', version: (latest?.version ?? 0) + 1, publish: false, content };
    if (latest) {
      const same = sameContent(latest, db.parts.get(latest.id), content, db.sources.get(content.sourceSlug)?.id);
      if (latest.status === 'draft') {
        step.action = same ? 'unchanged' : 'rewrite-draft';
        step.version = latest.version;
        step.existingVersionId = latest.id;
        step.existingStatus = latest.status;
      } else if (same) {
        step.action = latest.status === 'retired' ? 'retired-kept' : 'unchanged';
        step.version = latest.version;
        step.existingVersionId = latest.id;
        step.existingStatus = latest.status;
      }
    }
    if (options.publish && step.action !== 'retired-kept' && !(step.action === 'unchanged' && latest?.status === 'published')) {
      step.publish = true;
      if (published && published.id !== step.existingVersionId) {
        step.retireVersionId = published.id;
        step.retireVersion = published.version;
      }
    }
    if (step.action === 'retired-kept') {
      plan.notes.push(`${item.id}: version ${step.version} matches the batch but was retired in the database, so it stays retired`);
    }
    plan.steps.push(step);
  }

  plan.notes.push(
    'The main "rationale" column is not stored: the database keeps one rationale per choice (item_answers, D-85).',
    'fact_ids are checked but not stored: the database has no facts table yet.',
  );
  return plan;
}

// ---------------------------------------------------------------- describing it

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Plain lines saying what the plan writes. Ids and counts only: never question text, keys or rationales. */
export function describePlan(plan: Plan): string[] {
  const lines: string[] = [];
  const changed = plan.steps.filter(s => s.action === 'new' || s.action === 'rewrite-draft');
  const choiceRows = changed.reduce((n, s) => n + s.content.choices.length, 0);
  const newVersions = plan.steps.filter(s => s.action === 'new').length;
  const rewritten = plan.steps.filter(s => s.action === 'rewrite-draft').length;
  const publishing = plan.steps.filter(s => s.publish);
  const retiring = publishing.filter(s => s.retireVersionId);
  const list = (values: string[]) => (values.length ? ` (${values.join(', ')})` : '');

  lines.push('Rows to write, by table:');
  const state = (published: boolean) => (published ? 'published' : 'unpublished');
  lines.push(`  sources:       ${count(plan.newSources.length, 'new row')}${list(plan.newSources.map(s => `${s.slug}, ${state(s.published)}`))}` +
    (plan.publishSources.length ? `; ${plan.publishSources.length} existing marked published${list(plan.publishSources)}` : ''));
  lines.push(`  concepts:      ${count(plan.newConcepts.length, 'new row')}${list(plan.newConcepts.map(c => `${c.slug}, ${state(c.published)}`))}` +
    (plan.publishConcepts.length ? `; ${plan.publishConcepts.length} existing marked published${list(plan.publishConcepts)}` : ''));
  lines.push(`  items:         ${count(plan.newItems.length, 'new row')}`);
  lines.push(`  item_versions: ${count(newVersions, 'new row')}, ${count(rewritten, 'draft')} rewritten, ` +
    `${publishing.length} published, ${retiring.length} retired`);
  lines.push(`  item_choices:  ${count(choiceRows, 'row')} written`);
  lines.push(`  item_answers:  ${count(choiceRows, 'row')} written (the answer key and rationales; only this table holds them)`);
  lines.push('', 'Questions:');
  for (const step of plan.steps) {
    const isNewItem = plan.newItems.some(item => item.id === step.itemId);
    let what: string;
    if (step.action === 'new') what = isNewItem ? `new question, version ${step.version}` : `changed: new version ${step.version}`;
    else if (step.action === 'rewrite-draft') what = `changed: unpublished draft version ${step.version} rewritten`;
    else if (step.action === 'retired-kept') what = `unchanged: version ${step.version} stays retired`;
    else what = `unchanged (version ${step.version}, ${step.existingStatus ?? 'draft'})`;
    if (step.publish) what += step.retireVersionId ? `, published (version ${step.retireVersion} retired)` : ', published';
    else if (step.action === 'new' || step.action === 'rewrite-draft') what += ', left as a draft';
    lines.push(`  ${step.batchId}  ${what}`);
  }
  return lines;
}

/** True when applying the plan would write nothing at all. */
export function planIsEmpty(plan: Plan): boolean {
  return !plan.newSources.length && !plan.newConcepts.length && !plan.publishSources.length && !plan.publishConcepts.length &&
    !plan.newItems.length && plan.steps.every(s => (s.action === 'unchanged' || s.action === 'retired-kept') && !s.publish);
}
