/**
 * Loads a passed review batch into Supabase (Task 139). Steps for Christian: docs/BATCHES.md, "Importing a passed batch".
 *
 *   npm run import-batch -- <batch-folder>                                   dry run, offline: checks, writes nothing
 *   npm run import-batch -- <batch-folder> --project staging                 dry run compared with that database
 *   npm run import-batch -- <batch-folder> --project staging --apply         writes (questions stay drafts)
 *   npm run import-batch -- <batch-folder> --project staging --apply --publish
 *   npm run import-batch -- <batch-folder> --project prod --apply --publish --yes
 *
 * Before anything else it runs the batch checker again on the same files (BATCHES.md, "The importer checks again"),
 * and refuses the whole batch if any row of passed.csv is refused. A dry run is the default; only --apply writes.
 * The project address and secret key come only from SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (scripts/import-batch/
 * settings.ts), and every line printed goes through a filter that hides the key.
 *
 * Exit code: 0 done (or a clean dry run), 1 refused or stopped (the message says why), 2 the command was typed wrong.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadBatch } from './check_batch.ts';
import { CsvError, parseCsv, type CsvRow } from './check-batch/csv.ts';
import { applyPlan, ImportFailure, loadSnapshot, type DbClient } from './import-batch/db.ts';
import { parsePassed } from './import-batch/parse.ts';
import { buildPlan, describePlan, emptySnapshot, itemUuid, planIsEmpty, type Snapshot } from './import-batch/plan.ts';
import { connectionFrom, PROJECT_NAMES, redactor } from './import-batch/settings.ts';

export interface Deps {
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  err: (line: string) => void;
  /** Makes the database client. Called only when a project is named and its settings are valid. */
  connect: (url: string, key: string) => Promise<DbClient>;
}

const USAGE = 'Usage: npm run import-batch -- <batch-folder> [--project staging|prod] [--apply] [--publish] [--yes]';

function readText(dir: string, file: string): string {
  const path = join(dir, file);
  if (!existsSync(path)) throw new CsvError(`${file} is missing from the batch folder`);
  return readFileSync(path, 'utf8');
}

function byId(rows: CsvRow[], column: string): Map<string, CsvRow> {
  return new Map(rows.map(row => [row[column] ?? '', row]));
}

/** Runs the command. Every line it prints, including an unexpected error's, has the key hidden. */
export async function run(argv: string[], deps: Deps): Promise<number> {
  const hide = redactor([deps.env.SUPABASE_SERVICE_ROLE_KEY]);
  const out = (line = '') => deps.out(hide(line));
  const err = (line: string) => deps.err(hide(line));
  try {
    return await importBatch(argv, deps, out, err);
  } catch (e) {
    err(`Stopped by an unexpected error: ${e instanceof Error ? e.message.slice(0, 300) : 'unknown'}. If anything was written, it is safe to run the same command again.`);
    return 1;
  }
}

const OPTIONS = {
  apply: { type: 'boolean', default: false },
  publish: { type: 'boolean', default: false },
  yes: { type: 'boolean', default: false },
  project: { type: 'string' },
} as const;

async function importBatch(argv: string[], deps: Deps, out: (line?: string) => void, err: (line: string) => void): Promise<number> {
  let args: ReturnType<typeof parseArgs<{ args: string[]; allowPositionals: true; options: typeof OPTIONS }>>;
  try {
    args = parseArgs({ args: argv, allowPositionals: true, options: OPTIONS });
  } catch {
    err(USAGE);
    return 2;
  }
  if (args.positionals.length !== 1) {
    err(USAGE);
    return 2;
  }
  const { apply, publish, yes, project } = args.values;
  const dir = resolve(args.positionals[0]!);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    err(`There is no batch folder at ${dir}.`);
    return 2;
  }

  // 1. The batch, checked again exactly as the checker would, before any database is involved.
  let passed: ReturnType<typeof parsePassed>;
  let concepts = new Map<string, CsvRow>();
  let sources = new Map<string, CsvRow>();
  let itemCount = 0;
  try {
    if (!existsSync(join(dir, 'passed.csv'))) {
      err('This batch has not been checked: there is no passed.csv. Run npm run check-batch -- <batch-folder> first. Nothing was imported.');
      return 1;
    }
    const recheck = loadBatch(dir);
    itemCount = recheck.items.length;
    sources = byId(recheck.sources, 'source_id');
    if (existsSync(join(dir, 'concepts.csv'))) {
      try {
        concepts = byId(parseCsv(readText(dir, 'concepts.csv'), ['concept_id', 'title']), 'concept_id');
      } catch (e) {
        if (e instanceof CsvError) throw new CsvError(`concepts.csv: ${e.message}`);
        throw e;
      }
    }
    passed = parsePassed(readText(dir, 'passed.csv'), {
      itemsCsv: readText(dir, 'items.csv'), keyCsv: readText(dir, 'key.csv'),
      recheck: { reviewers: recheck.reviewers, facts: recheck.facts, sources: recheck.sources },
    });
  } catch (e) {
    if (!(e instanceof CsvError)) throw e;
    err(`Could not read the batch: ${e.message}. Nothing was imported.`);
    return 1;
  }
  if (passed.problems.length) {
    err('The batch was refused, so nothing was imported:');
    for (const p of passed.problems) err(`  ${p.file} row ${p.row}: ${p.message}`);
    err('Fix the files, run npm run check-batch -- <batch-folder> again, then run this again.');
    return 1;
  }
  if (!passed.items.length) {
    err('passed.csv lists no questions, so there is nothing to import.');
    return 1;
  }
  out(`Batch: ${dir}`);
  out(`Checked again: ${passed.items.length} question(s) on passed.csv pass the batch check with matching hashes.` +
    (itemCount > passed.items.length ? ` ${itemCount - passed.items.length} other question(s) in items.csv are not on passed.csv and are not imported.` : ''));

  // 2. Which database, if any. A dry run without --project compares with nothing and needs no key.
  if (apply && project === undefined) {
    err('--apply needs a project: add --project staging (or --project prod). Nothing was written.');
    return 1;
  }
  let snapshot: Snapshot = emptySnapshot();
  let client: DbClient | undefined;
  if (project !== undefined) {
    const settings = connectionFrom(deps.env, project);
    if (!settings.ok) {
      err(`Can't connect: ${settings.reason} Nothing was written.`);
      return 1;
    }
    const { connection } = settings;
    out(`Project: ${connection.project} (${PROJECT_NAMES[connection.project]}) at ${connection.url}`);
    out(`  Check that this address is the one Supabase shows for ${PROJECT_NAMES[connection.project]} (its Connect button).`);
    if (apply && connection.project === 'prod' && !yes) {
      err('This would write to the live site\'s database (cueory-prod). Do a dry run first, then add --yes to confirm. Nothing was written.');
      return 1;
    }
    try {
      client = await deps.connect(connection.url, connection.key);
      const unique = (values: string[]) => [...new Set(values)];
      snapshot = await loadSnapshot(client, {
        conceptSlugs: unique(passed.items.map(i => i.conceptId)),
        sourceSlugs: unique(passed.items.flatMap(i => i.sourceIds)),
        itemIds: passed.items.map(i => itemUuid(i.id)),
      });
    } catch (e) {
      err(`Stopped while ${e instanceof ImportFailure ? e.step : 'connecting'}: ${describeError(e)} Nothing was written.`);
      return 1;
    }
  } else {
    out('Project: none. This dry run did not look at a database, so everything is shown as new. Add --project staging to compare.');
  }

  // 3. The plan.
  const plan = buildPlan(passed.items, { concepts, sources }, snapshot, { publish });
  out('');
  for (const line of describePlan(plan)) out(line);
  if (plan.notes.length) {
    out();
    out('Notes:');
    for (const note of plan.notes) out(`  - ${note}`);
  }
  if (plan.problems.length) {
    err('');
    err('The database would refuse these, so nothing was written:');
    for (const problem of plan.problems) err(`  - ${problem}`);
    return 1;
  }
  out('');
  if (!apply) {
    out(`Dry run: nothing was written.${project ? ` To write, run the same command with --apply${publish ? '' : ' (and --publish to make the questions visible)'}.` : ' Next: the same command with --project staging.'}`);
    return 0;
  }
  if (planIsEmpty(plan)) {
    out('Nothing to write: the database already matches this batch.');
    return 0;
  }

  // 4. Write, then read back and check that the database now matches.
  try {
    out('Writing:');
    await applyPlan(client!, plan, snapshot, out);
    const after = await loadSnapshot(client!, {
      conceptSlugs: [...new Set(passed.items.map(i => i.conceptId))],
      sourceSlugs: [...new Set(passed.items.flatMap(i => i.sourceIds))],
      itemIds: passed.items.map(i => itemUuid(i.id)),
    });
    const left = buildPlan(passed.items, { concepts, sources }, after, { publish });
    if (!planIsEmpty(left) || left.problems.length) {
      err('Written, but reading it back does not match the batch. Run the dry run again to see what differs.');
      return 1;
    }
  } catch (e) {
    err('');
    err(`Stopped while ${e instanceof ImportFailure ? e.step : 'writing'}: ${describeError(e)}`);
    err('Questions listed as done above were written. Nothing after this point was. It is safe to run the same command again: it picks up where it stopped.');
    return 1;
  }
  out('Done. Read back from the database: it matches the batch.');
  return 0;
}

/** A short, plain reason. The message is already cut to the database's own short text (db.ts) and the key is hidden. */
function describeError(e: unknown): string {
  if (e instanceof ImportFailure) {
    if (e.code === 'network') return `could not reach the project (${e.message}). Check the internet connection and SUPABASE_URL.`;
    if (e.code === '42501' || e.code === 'PGRST301' || /invalid api key|unauthorized|jwt/i.test(e.message)) {
      return 'the project refused the key. Check that SUPABASE_SERVICE_ROLE_KEY is this project\'s secret key.';
    }
    return `${e.message}${e.code ? ` (code ${e.code})` : ''}.`;
  }
  return e instanceof Error ? `${e.message.slice(0, 300)}.` : 'an unexpected error.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.argv.slice(2), {
    env: process.env,
    out: line => console.log(line),
    err: line => console.error(line),
    connect: async (url, key) => {
      const { createClient } = await import('@supabase/supabase-js');
      // No session to keep: nothing is stored on disk or refreshed in the background.
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      return client as unknown as DbClient;
    },
  });
}
