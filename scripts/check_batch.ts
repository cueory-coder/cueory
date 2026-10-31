/**
 * Checks one review batch and writes passed.csv, failed.csv and report.md (Roadmap Task 3, format in docs/BATCHES.md).
 *
 * Run: npm run check-batch -- <batch-folder> [--out <folder>] [--check-links]
 *
 * Exit code: 0 every item passed, 1 some items failed, 2 the batch has problems of its own (missing or malformed
 * files, too few reviewers, duplicate ids) and no item can pass.
 * --check-links also asks each source's website whether the page exists. It needs the internet, so CI never uses it.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  checkBatch,
  FACT_COLUMNS,
  ITEM_COLUMNS,
  KEY_COLUMNS,
  REVIEWER_COLUMNS,
  SOURCE_COLUMNS,
  type BatchInput,
} from './check-batch/check.ts';
import { CsvError, parseCsv, type CsvRow } from './check-batch/csv.ts';
import { failedCsv, passedCsv, reportMd } from './check-batch/report.ts';

const LINK_TIMEOUT_MS = 10_000;

/**
 * A batch that can't be read must never keep the results of an earlier run: remove the old passed.csv and
 * failed.csv and replace report.md with one that says nothing was checked.
 */
function writeNotChecked(out: string, batchName: string, problem: string): void {
  mkdirSync(out, { recursive: true });
  rmSync(join(out, 'passed.csv'), { force: true });
  rmSync(join(out, 'failed.csv'), { force: true });
  writeFileSync(
    join(out, 'report.md'),
    `# Batch ${batchName}: not checked\n\n` +
      `The batch could not be read, so no item has passed: ${problem}\n\n` +
      'Fix the file and run the check again.\n',
  );
}

function read(dir: string, file: string, columns: readonly string[]): CsvRow[] {
  const path = join(dir, file);
  if (!existsSync(path)) throw new CsvError(`${file} is missing from the batch folder`);
  try {
    return parseCsv(readFileSync(path, 'utf8'), columns);
  } catch (e) {
    throw e instanceof CsvError ? new CsvError(`${file}: ${e.message}`) : e;
  }
}

export function loadBatch(dir: string): BatchInput {
  const reviewerDir = join(dir, 'reviewers');
  const reviewerFiles = existsSync(reviewerDir) ? readdirSync(reviewerDir).filter((f) => f.endsWith('.csv')) : [];
  return {
    items: read(dir, 'items.csv', ITEM_COLUMNS),
    key: read(dir, 'key.csv', KEY_COLUMNS),
    facts: read(dir, 'facts.csv', FACT_COLUMNS),
    sources: read(dir, 'sources.csv', SOURCE_COLUMNS),
    reviewers: Object.fromEntries(
      reviewerFiles.map((f) => [f.replace(/\.csv$/, ''), read(dir, join('reviewers', f), REVIEWER_COLUMNS)]),
    ),
  };
}

/** Live check: each https source answers with a success status. Problems become warnings, not item failures. */
async function checkLinksOnline(sources: CsvRow[]): Promise<string[]> {
  const warnings: string[] = [];
  for (const s of sources) {
    const url = s.url ?? '';
    if (!url.startsWith('https://')) continue; // already reported by the offline check
    try {
      let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(LINK_TIMEOUT_MS) });
      if (res.status === 405 || res.status === 403) {
        // Some sites refuse HEAD requests; ask for the page itself instead.
        res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(LINK_TIMEOUT_MS) });
      }
      if (!res.ok) warnings.push(`source "${s.source_id}": ${url} answered ${res.status}`);
    } catch {
      warnings.push(`source "${s.source_id}": ${url} could not be reached`);
    }
  }
  return warnings;
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { out: { type: 'string' }, 'check-links': { type: 'boolean', default: false } },
  });
  if (positionals.length !== 1) {
    console.error('Usage: npm run check-batch -- <batch-folder> [--out <folder>] [--check-links]');
    return 2;
  }
  const dir = resolve(positionals[0]!);
  const out = resolve(values.out ?? dir);

  let input: BatchInput;
  try {
    input = loadBatch(dir);
  } catch (e) {
    if (!(e instanceof CsvError)) throw e;
    console.error(`Could not check the batch: ${e.message}`);
    writeNotChecked(out, basename(dir), e.message);
    return 2;
  }

  const result = checkBatch(input);
  const linkWarnings = values['check-links'] ? await checkLinksOnline(input.sources) : [];

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'passed.csv'), passedCsv(result));
  writeFileSync(join(out, 'failed.csv'), failedCsv(result));
  writeFileSync(join(out, 'report.md'), reportMd(result, basename(dir), linkWarnings));

  console.log(
    `${result.passed.length} passed, ${result.failed.length} failed` +
      (result.batchErrors.length > 0 ? `, ${result.batchErrors.length} batch problem(s)` : '') +
      `. Report: ${join(out, 'report.md')}`,
  );
  return result.batchErrors.length > 0 ? 2 : result.failed.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
