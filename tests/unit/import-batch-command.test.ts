import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkBatch, REVIEWER_ROSTER, type BatchInput } from '../../scripts/check-batch/check';
import { toCsv, type CsvRow } from '../../scripts/check-batch/csv';
import { failedCsv, passedCsv, pendingCsv } from '../../scripts/check-batch/report';
import { run } from '../../scripts/import_batch';
import { buildPlan, emptySnapshot, itemUuid, uuidV5 } from '../../scripts/import-batch/plan';
import { connectionFrom, redactor } from '../../scripts/import-batch/settings';
import { FakeSupabase } from './fakesupabase';

// Made-up placeholder data only: no clinical content belongs in tests (CLAUDE.md rule 5).
// Built at run time so no secret-shaped text sits in the (public) repository for scanners to trip on. Not a real key.
const FAKE_KEY = ['sb', 'secret', 'FAKEfakeFAKEfake0123456789abcd'].join('_');
const URL = 'https://abcdefghijklmnopqrst.supabase.co';
const ENV = { SUPABASE_URL: URL, SUPABASE_SERVICE_ROLE_KEY: FAKE_KEY };
const REVIEWERS = REVIEWER_ROSTER.slice(0, 5);

function item(n: number, over: Partial<CsvRow> = {}): CsvRow {
  return {
    item_id: `sample-${n}`, concept_id: 'sample-concept', type: 'single', stem: `sample: placeholder question ${n}`,
    choice_a: 'sample: one', choice_b: 'sample: two', choice_c: 'sample: three', choice_d: 'sample: four', choice_e: '',
    rationale: 'sample: main reason', rationale_a: 'sample: reason a', rationale_b: 'sample: reason b',
    rationale_c: 'sample: reason c', rationale_d: 'sample: reason d', rationale_e: '',
    fact_ids: 'sample-fact', source_ids: 'sample-source', ...over,
  };
}

interface Batch extends BatchInput { concepts?: CsvRow[] }
function batch(n = 2): Batch {
  const items = Array.from({ length: n }, (_, i) => item(i + 1));
  const key = items.map((it, i) => ({ item_id: it.item_id!, answer: 'ABCD'[i % 4]! }));
  return {
    items, key,
    facts: [{ fact_id: 'sample-fact', source_id: 'sample-source' }],
    sources: [{ source_id: 'sample-source', url: 'https://example.org/sample', title: 'Sample book', publisher: 'Sample press', license: 'CC BY 4.0' }],
    reviewers: Object.fromEntries(REVIEWERS.map(r => [r, key.map(k => ({ item_id: k.item_id, answer: k.answer, verdict: 'pass' }))])),
    concepts: [{ concept_id: 'sample-concept', title: 'Sample concept' }],
  };
}

let dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

/** Writes the batch files, then the checker's results (as `npm run check-batch` does) unless `checked` is false. */
function write(input: Batch, checked = true, dir = mkdtempSync(join(tmpdir(), 'cueory-import-'))): string {
  if (!dirs.includes(dir)) dirs.push(dir);
  const cols = (rows: CsvRow[]) => [...new Set(rows.flatMap(row => Object.keys(row)))];
  writeFileSync(join(dir, 'items.csv'), toCsv(cols(input.items), input.items));
  writeFileSync(join(dir, 'key.csv'), toCsv(['item_id', 'answer'], input.key));
  writeFileSync(join(dir, 'facts.csv'), toCsv(['fact_id', 'source_id'], input.facts));
  writeFileSync(join(dir, 'sources.csv'), toCsv(cols(input.sources), input.sources));
  if (input.concepts) writeFileSync(join(dir, 'concepts.csv'), toCsv(['concept_id', 'title'], input.concepts));
  rmSync(join(dir, 'reviewers'), { recursive: true, force: true });
  mkdirSync(join(dir, 'reviewers'));
  for (const [name, rows] of Object.entries(input.reviewers)) writeFileSync(join(dir, 'reviewers', `${name}.csv`), toCsv(['item_id', 'answer', 'verdict'], rows));
  if (checked) {
    const result = checkBatch(input);
    writeFileSync(join(dir, 'passed.csv'), passedCsv(result, input));
    writeFileSync(join(dir, 'failed.csv'), failedCsv(result));
    writeFileSync(join(dir, 'pending.csv'), pendingCsv(result));
  }
  return dir;
}

async function cli(args: string[], db = new FakeSupabase(), env: Record<string, string | undefined> = ENV) {
  const lines: string[] = [];
  let connects = 0;
  const code = await run(args, {
    env, out: line => lines.push(line), err: line => lines.push(line),
    connect: async (url, key) => {
      connects += 1;
      expect(url).toBe(URL);
      expect(key).toBe(FAKE_KEY);
      return db;
    },
  });
  return { code, out: lines.join('\n'), db, connects };
}
const writesOf = (db: FakeSupabase) => db.writes.filter(w => w.rows > 0);
const versionsOf = (db: FakeSupabase, batchId: string) =>
  db.tables.item_versions!.filter(v => v.item_id === itemUuid(batchId)).sort((a, b) => Number(a.version) - Number(b.version));

describe('import-batch dry run (the default)', () => {
  it('prints what it would write and never connects without --project', async () => {
    const { code, out, connects } = await cli([write(batch())]);
    expect(code).toBe(0);
    expect(connects).toBe(0);
    expect(out).toContain('Checked again: 2 question(s)');
    expect(out).toContain('sources:       1 new row (sample-source, unpublished)');
    expect(out).toContain('concepts:      1 new row (sample-concept, unpublished)');
    expect(out).toContain('items:         2 new rows');
    expect(out).toContain('item_versions: 2 new rows');
    expect(out).toContain('item_choices:  8 rows written');
    expect(out).toContain('sample-1  new question, version 1, left as a draft');
    expect(out).toContain('Dry run: nothing was written.');
  });

  it('reads a named project but writes nothing to it', async () => {
    const { code, out, db } = await cli([write(batch()), '--project', 'staging', '--publish']);
    expect(code).toBe(0);
    expect(db.reads).toBeGreaterThan(0);
    expect(db.writes).toEqual([]);
    expect(out).toContain(`Project: staging (cueory-staging) at ${URL}`);
    expect(out).toContain('2 published, 0 retired');
  });

  it('never prints question text, choices, rationales or the key', async () => {
    const { out } = await cli([write(batch())]);
    expect(out).not.toMatch(/placeholder question|sample: one|sample: reason/);
  });
});

describe('import-batch refuses batches that are not passed as they stand', () => {
  it('refuses an unchecked batch (no passed.csv)', async () => {
    const { code, out, connects } = await cli([write(batch(), false), '--project', 'staging', '--apply']);
    expect(code).toBe(1);
    expect(connects).toBe(0);
    expect(out).toContain('has not been checked');
  });

  it('refuses an item edited after the check (hash mismatch)', async () => {
    const input = batch();
    const dir = write(input);
    input.items[0] = { ...input.items[0]!, stem: 'sample: edited afterwards' };
    write(input, false, dir);
    const { code, out, db } = await cli([dir, '--project', 'staging', '--apply']);
    expect(code).toBe(1);
    expect(out).toContain('the item hash does not match');
    expect(db.writes).toEqual([]);
  });

  it.each([['fail'], ['pending']])('refuses everything when a reviewer now says %s', async verdict => {
    const input = batch();
    const dir = write(input);
    input.reviewers.codex = input.reviewers.codex!.map((row, i) => (i === 0 ? { ...row, verdict } : row));
    write(input, false, dir);
    const { code, out, db } = await cli([dir, '--project', 'staging', '--apply']);
    expect(code).toBe(1);
    expect(out).toContain('the batch checker does not pass this item now');
    expect(out).toContain('nothing was imported');
    expect(db.writes).toEqual([]);
  });

  it('never imports failed or pending items that are not on passed.csv', async () => {
    const input = batch(3);
    input.reviewers.codex = input.reviewers.codex!.map(row => (row.item_id === 'sample-2' ? { ...row, verdict: 'fail' } : row));
    input.reviewers.gemini = input.reviewers.gemini!.map(row => (row.item_id === 'sample-3' ? { ...row, verdict: 'pending' } : row));
    const { code, out, db } = await cli([write(input), '--project', 'staging', '--apply']);
    expect(code).toBe(0);
    expect(out).toContain('2 other question(s) in items.csv are not on passed.csv');
    expect(db.tables.items!.map(i => i.id)).toEqual([itemUuid('sample-1')]);
  });

  it.each([
    ['two sources', { source_ids: 'sample-source;sample-other' }, 'keeps one source per question version'],
    ['a line break in the stem', { stem: 'sample: line one\nline two' }, 'line break'],
    ['a choice over 300 characters', { choice_b: `sample: ${'x'.repeat(300)}` }, 'at most 300'],
  ])('refuses content the database would refuse: %s', async (_name, over, words) => {
    const input = batch(1);
    input.items[0] = item(1, over);
    input.sources.push({ source_id: 'sample-other', url: 'https://example.org/other', title: 'Other', publisher: 'Other press', license: 'CC BY 4.0' });
    const { code, out, db } = await cli([write(input), '--project', 'staging', '--apply']);
    expect(code).toBe(1);
    expect(out).toContain(words);
    expect(out).toContain('nothing was written');
    expect(db.writes).toEqual([]);
  });

  it('refuses a concept id the database slug cannot hold, and a new source without its credit details', async () => {
    const input = batch(1);
    input.items[0] = item(1, { concept_id: 'Sample_Concept' });
    input.sources = [{ source_id: 'sample-source', url: 'https://example.org/sample' }];
    const { code, out } = await cli([write(input), '--project', 'staging', '--apply']);
    expect(code).toBe(1);
    expect(out).toContain('concept id "Sample_Concept" can\'t be stored as-is');
    expect(out).toContain('sources.csv needs its title, publisher, license');
  });

  it('refuses a new concept without a title', async () => {
    const input = batch(1);
    delete input.concepts;
    const { code, out } = await cli([write(input), '--project', 'staging', '--apply']);
    expect(code).toBe(1);
    expect(out).toContain('add a concepts.csv');
  });
});

describe('import-batch --apply', () => {
  it('writes sources, concepts, items, then versions with their choices and answers', async () => {
    const { code, out, db } = await cli([write(batch()), '--project', 'staging', '--apply']);
    expect(code).toBe(0);
    expect(out).toContain('Done. Read back from the database: it matches the batch.');
    const order = writesOf(db).map(w => w.table);
    expect(order.slice(0, 3)).toEqual(['sources', 'concepts', 'items']);
    expect(order.slice(3)).toEqual(['item_versions', 'item_choices', 'item_answers', 'item_versions', 'item_choices', 'item_answers']);
    expect(db.tables.items!.map(i => i.id)).toEqual([itemUuid('sample-1'), itemUuid('sample-2')]);
    const [v1] = versionsOf(db, 'sample-2');
    expect(v1).toMatchObject({ version: 1, status: 'draft', stem: 'sample: placeholder question 2' });
    const answers = db.tables.item_answers!.filter(a => a.item_version_id === v1!.id);
    expect(answers.filter(a => a.is_correct).map(a => a.choice_id)).toEqual(['b']);
    expect(answers.find(a => a.choice_id === 'c')?.rationale).toBe('sample: reason c');
    // The key goes only to item_answers: no other table has an is_correct or rationale column.
    for (const table of ['concepts', 'sources', 'items', 'item_versions', 'item_choices']) {
      expect(db.tables[table]!.every(row => !('is_correct' in row) && !('rationale' in row))).toBe(true);
    }
  });

  it('is idempotent: a second run writes nothing', async () => {
    const dir = write(batch());
    const first = await cli([dir, '--project', 'staging', '--apply', '--publish']);
    expect(first.code).toBe(0);
    const writes = first.db.writes.length;
    const again = await cli([dir, '--project', 'staging', '--apply', '--publish'], first.db);
    expect(again.code).toBe(0);
    expect(again.out).toContain('Nothing to write: the database already matches this batch.');
    expect(again.db.writes.length).toBe(writes);
  });

  it('publishes with --publish, including the new source and concept', async () => {
    const { code, db } = await cli([write(batch()), '--project', 'staging', '--apply', '--publish']);
    expect(code).toBe(0);
    expect(db.tables.sources![0]!.published).toBe(true);
    expect(db.tables.concepts![0]!.published).toBe(true);
    expect(db.tables.item_versions!.every(v => v.status === 'published')).toBe(true);
  });

  it('an edited item gets a new version; the published one is never changed', async () => {
    const input = batch();
    const dir = write(input);
    const { db } = await cli([dir, '--project', 'staging', '--apply', '--publish']);
    const published = structuredClone(versionsOf(db, 'sample-1')[0]!);
    const oldChoices = structuredClone(db.tables.item_choices!.filter(c => c.item_version_id === published.id));

    input.items[0] = { ...input.items[0]!, stem: 'sample: placeholder question 1, reworded', rationale_a: 'sample: reason a, reworded' };
    write(input, true, dir);
    const draft = await cli([dir, '--project', 'staging', '--apply'], db);
    expect(draft.code).toBe(0);
    expect(draft.out).toContain('sample-1  changed: new version 2, left as a draft');
    expect(draft.out).toContain('sample-2  unchanged (version 1, published)');
    expect(versionsOf(db, 'sample-1').map(v => [v.version, v.status])).toEqual([[1, 'published'], [2, 'draft']]);

    const live = await cli([dir, '--project', 'staging', '--apply', '--publish'], db);
    expect(live.code).toBe(0);
    expect(live.out).toContain('sample-1  unchanged (version 2, draft), published (version 1 retired)');
    const [v1, v2] = versionsOf(db, 'sample-1');
    expect(v1).toEqual({ ...published, status: 'retired' });
    expect(db.tables.item_choices!.filter(c => c.item_version_id === published.id)).toEqual(oldChoices);
    expect(v2).toMatchObject({ version: 2, status: 'published', stem: 'sample: placeholder question 1, reworded' });
  });

  it('a failed publish of a new version leaves the old version live (one transaction)', async () => {
    const input = batch();
    const dir = write(input);
    const { db } = await cli([dir, '--project', 'staging', '--apply', '--publish']);
    input.items[0] = { ...input.items[0]!, stem: 'sample: placeholder question 1, reworded' };
    write(input, true, dir);

    db.failPublishMidway = true;
    const failed = await cli([dir, '--project', 'staging', '--apply', '--publish'], db);
    expect(failed.code).toBe(1);
    expect(failed.out).toContain('Stopped while publishing for sample-1');
    expect(versionsOf(db, 'sample-1').map(v => [v.version, v.status])).toEqual([[1, 'published'], [2, 'draft']]);

    db.failPublishMidway = false;
    const again = await cli([dir, '--project', 'staging', '--apply', '--publish'], db);
    expect(again.code).toBe(0);
    expect(versionsOf(db, 'sample-1').map(v => [v.version, v.status])).toEqual([[1, 'retired'], [2, 'published']]);
  });

  it('stops at the first error, says where, and a re-run finishes the job', async () => {
    const dir = write(batch());
    const db = new FakeSupabase();
    let answersInserts = 0;
    db.failWith = (op, table) => (op === 'insert' && table === 'item_answers' && ++answersInserts === 2
      ? { message: 'sample: the database said no', code: '23514' } : undefined);
    const first = await cli([dir, '--project', 'staging', '--apply', '--publish'], db);
    expect(first.code).toBe(1);
    expect(first.out).toContain('sample-1  done');
    expect(first.out).toContain('Stopped while adding answers for sample-2: sample: the database said no (code 23514).');
    expect(first.out).toContain('safe to run the same command again');
    expect(versionsOf(db, 'sample-2')[0]).toMatchObject({ status: 'draft' });

    db.failWith = undefined;
    const second = await cli([dir, '--project', 'staging', '--apply', '--publish'], db);
    expect(second.code).toBe(0);
    expect(second.out).toContain('sample-2  changed: unpublished draft version 1 rewritten, published');
    expect(db.tables.item_versions!.map(v => v.status)).toEqual(['published', 'published']);
    expect(db.tables.item_answers!.length).toBe(8);
  });

  it('refuses --apply without a project, and without the environment variables', async () => {
    const dir = write(batch());
    expect((await cli([dir, '--apply'])).out).toContain('--apply needs a project');
    const noKey = await cli([dir, '--project', 'staging', '--apply'], new FakeSupabase(), { SUPABASE_URL: URL });
    expect(noKey.code).toBe(1);
    expect(noKey.connects).toBe(0);
    expect(noKey.out).toContain('SUPABASE_SERVICE_ROLE_KEY is not set');
    const noUrl = await cli([dir, '--project', 'staging', '--apply'], new FakeSupabase(), { SUPABASE_SERVICE_ROLE_KEY: FAKE_KEY });
    expect(noUrl.out).toContain('SUPABASE_URL is not set');
    expect(noUrl.connects).toBe(0);
  });

  it('needs --yes to write to prod, and dry-runs prod without it', async () => {
    const dir = write(batch());
    const refused = await cli([dir, '--project', 'prod', '--apply']);
    expect(refused.code).toBe(1);
    expect(refused.connects).toBe(0);
    expect(refused.out).toContain('add --yes to confirm');
    expect((await cli([dir, '--project', 'prod'])).code).toBe(0);
    const yes = await cli([dir, '--project', 'prod', '--apply', '--yes']);
    expect(yes.code).toBe(0);
    expect(yes.db.tables.items!.length).toBe(2);
  });

  it('never prints the key, even when an error message echoes it', async () => {
    const dir = write(batch());
    const db = new FakeSupabase();
    db.failWith = (op) => (op === 'insert' ? { message: `Invalid API key ${FAKE_KEY}`, code: 'PGRST301' } : undefined);
    const failed = await cli([dir, '--project', 'staging', '--apply'], db);
    expect(failed.code).toBe(1);
    expect(failed.out).toContain('the project refused the key');
    const lines: string[] = [];
    const thrown = await run([dir, '--project', 'staging', '--apply'], {
      env: ENV, out: () => {}, err: line => lines.push(line),
      connect: async () => { throw new Error(`could not use ${FAKE_KEY}`); },
    });
    expect(thrown).toBe(1);
    expect(lines.join('\n')).toContain('Stopped while connecting');
    const ok = await cli([dir, '--project', 'staging', '--apply']);
    for (const out of [failed.out, lines.join('\n'), ok.out]) {
      expect(out).not.toContain(FAKE_KEY);
      expect(out).not.toContain('FAKEfakeFAKE');
    }
  });
});

describe('import-batch settings and ids', () => {
  it('derives item uuids with RFC 9562 version 5', () => {
    // The RFC's own example: "www.example.com" in the DNS namespace.
    expect(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
    expect(itemUuid('sample-1')).toBe(itemUuid('sample-1'));
    expect(itemUuid('sample-1')).not.toBe(itemUuid('Sample-1'));
    expect(itemUuid('sample-1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it.each([
    [{ ...ENV, SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_abcdefghijklmnop' }, 'publishable key'],
    [{ ...ENV, SUPABASE_SERVICE_ROLE_KEY: ['eyJhbGciOiJIUzI1NiJ9', 'e30', 'abc'].join('.') }, 'legacy JWT'],
    [{ ...ENV, SUPABASE_SERVICE_ROLE_KEY: 'not a key' }, 'does not look like a secret key'],
    [{ ...ENV, SUPABASE_URL: 'http://abcdefghijklmnopqrst.supabase.co' }, 'hosted project address'],
    [{ ...ENV, SUPABASE_URL: 'http://localhost:54321' }, 'hosted project address'],
    [{ ...ENV, SUPABASE_URL: 'https://example.org' }, 'hosted project address'],
  ])('refuses settings %#', (env, words) => {
    const result = connectionFrom(env, 'staging');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(words);
      expect(result.reason).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY);
    }
  });

  it('accepts a hosted address and a secret key, and hides keys in any text', () => {
    expect(connectionFrom(ENV, 'staging')).toEqual({ ok: true, connection: { project: 'staging', url: URL, key: FAKE_KEY } });
    expect(connectionFrom(ENV, 'production').ok).toBe(false);
    const hide = redactor([FAKE_KEY]);
    const other = ['sb', 'secret', 'other123'].join('_');
    expect(hide(`a ${FAKE_KEY} b ${other} c`)).toBe('a [hidden] b [hidden] c');
  });

  it('an offline plan treats the database as empty and turns missing credit details into notes', () => {
    const plan = buildPlan([], { sources: new Map(), concepts: new Map() }, emptySnapshot(), { publish: false });
    expect(plan.problems).toEqual([]);
    expect(plan.notes.some(note => note.includes('main "rationale" column is not stored'))).toBe(true);
  });
});

describe('import_batch command line', () => {
  it('runs under Node and refuses --apply without the environment variables', () => {
    const dir = write(batch());
    const env = { ...process.env };
    delete env.SUPABASE_URL;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    let status = 0;
    let output = '';
    try {
      execFileSync(process.execPath, ['scripts/import_batch.ts', dir, '--project', 'staging', '--apply'], { encoding: 'utf8', env, stdio: 'pipe' });
    } catch (e) {
      const err = e as { status: number; stdout: string; stderr: string };
      status = err.status;
      output = err.stdout + err.stderr;
    }
    expect(status).toBe(1);
    expect(output).toContain('SUPABASE_URL is not set');
  });
});
