import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkBatch, linkProblem, type BatchInput } from '../../scripts/check-batch/check.ts';
import { CsvError, parseCsv, toCsv, type CsvRow } from '../../scripts/check-batch/csv.ts';
import { failedCsv, passedCsv, reportMd } from '../../scripts/check-batch/report.ts';

// Made-up placeholder data only: no clinical content belongs in tests (CLAUDE.md rule 5).
const REVIEWERS = ['claude_sonnet', 'codex', 'gemini', 'gpt1', 'gpt2'];
const LETTERS = ['A', 'B', 'C', 'D'];

function item(n: number, over: Partial<CsvRow> = {}): CsvRow {
  return {
    item_id: `q${n}`,
    concept_id: 'c1',
    stem: `Placeholder question ${n}?`,
    choice_a: 'Option one',
    choice_b: 'Option two',
    choice_c: 'Option three',
    choice_d: 'Option four',
    rationale: 'Placeholder rationale.',
    fact_ids: 'f1',
    source_ids: 's1',
    ...over,
  };
}

/** A clean batch of `n` items with answers spread evenly over A–D and every reviewer agreeing. */
function batch(n = 4): BatchInput {
  const items = Array.from({ length: n }, (_, i) => item(i + 1));
  const key = items.map((it, i) => ({ item_id: it.item_id!, answer: LETTERS[i % 4]! }));
  return {
    items,
    key,
    facts: [{ fact_id: 'f1', source_id: 's1' }],
    sources: [{ source_id: 's1', url: 'https://example.org/page' }],
    reviewers: Object.fromEntries(
      REVIEWERS.map((r) => [r, key.map((k) => ({ item_id: k.item_id, answer: k.answer, verdict: 'pass' }))]),
    ),
  };
}

const reasonsFor = (input: BatchInput, id: string): string[] =>
  checkBatch(input).failed.find((f) => f.item_id === id)?.reasons ?? [];

describe('csv', () => {
  it('reads quotes, commas, doubled quotes, CRLF, a byte-order mark and blank trailing lines', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n', ['a', 'b']);
    expect(rows).toEqual([{ a: 'x, y', b: 'say "hi"' }]);
  });

  it('keeps line breaks inside quoted fields', () => {
    expect(parseCsv('a\n"one\ntwo"\n')).toEqual([{ a: 'one\ntwo' }]);
  });

  it.each([
    ['', 'empty'],
    ['a,a\n1,2\n', 'twice'],
    ['a,\n1,2\n', 'empty column name'],
    ['a,b\n1\n', 'has 1 fields'],
    ['a\n"open\n', 'never closed'],
    ['a\n"x"y\n', 'after a closing quote'],
    ['a\nx"y"\n', 'can only start'],
  ])('rejects malformed input %j', (text, message) => {
    expect(() => parseCsv(text)).toThrow(CsvError);
    expect(() => parseCsv(text)).toThrow(message);
  });

  it('reports missing required columns', () => {
    expect(() => parseCsv('a\n1\n', ['a', 'b'])).toThrow('missing column(s): b');
  });

  it('round-trips through toCsv', () => {
    const rows = [{ a: 'x, "y"', b: 'line\nbreak' }];
    expect(parseCsv(toCsv(['a', 'b'], rows))).toEqual(rows);
  });

  it('neutralizes cells that a spreadsheet would run as formulas', () => {
    const out = toCsv(['a'], [{ a: '=HYPERLINK("x")' }, { a: '+1' }, { a: '-1' }, { a: '@SUM(1)' }, { a: 'ok' }]);
    expect(out.split('\n').slice(1, 6)).toEqual([`"'=HYPERLINK(""x"")"`, "'+1", "'-1", "'@SUM(1)", 'ok']);
  });
});

describe('linkProblem', () => {
  it('accepts a plain https address', () => {
    expect(linkProblem('https://example.org/a?b=1')).toBeNull();
  });

  it.each([
    ['', 'no url'],
    ['not a url', 'not a valid address'],
    ['http://example.org', 'https://'],
    ['ftp://example.org', 'https://'],
    ['javascript:alert(1)', 'https://'],
    ['https://localhost/x', 'no proper site name'],
    ['https://user:pw@example.org', 'user name or password'],
  ])('rejects %j', (url, message) => {
    expect(linkProblem(url)).toContain(message);
  });
});

describe('checkBatch', () => {
  it('passes a clean batch', () => {
    const r = checkBatch(batch());
    expect(r.batchErrors).toEqual([]);
    expect(r.failed).toEqual([]);
    expect(r.passed.map((p) => p.item_id)).toEqual(['q1', 'q2', 'q3', 'q4']);
    expect(r.balance).toEqual({ A: 1, B: 1, C: 1, D: 1 });
    expect(r.agreement.gpt1).toEqual({ matched: 4, answered: 4 });
  });

  it('fails an item when a reviewer disagrees with the key', () => {
    const b = batch();
    b.reviewers.gemini![0]!.answer = 'D';
    expect(reasonsFor(b, 'q1')).toEqual(['gemini: answered D, key says A']);
    expect(checkBatch(b).agreement.gemini).toEqual({ matched: 3, answered: 4 });
  });

  it('fails an item a reviewer marked fail or pending, or did not review', () => {
    const b = batch();
    b.reviewers.gpt1![0]!.verdict = 'fail';
    b.reviewers.gpt2![0]!.verdict = 'Pending';
    b.reviewers.codex = b.reviewers.codex!.filter((r) => r.item_id !== 'q1');
    expect(reasonsFor(b, 'q1')).toEqual(['codex: no review', 'gpt1: marked it fail', 'gpt2: review still pending']);
  });

  it('rejects unknown verdicts and answers outside the choices', () => {
    const b = batch();
    b.reviewers.gpt1![0]!.verdict = 'ok';
    b.reviewers.gpt2![0]!.answer = 'E';
    expect(reasonsFor(b, 'q1')).toEqual([
      'gpt1: verdict "ok" must be pass, fail or pending',
      'gpt2: answer "E" is not one of the choices',
    ]);
  });

  it('fails items with no key, or a key that is not a choice', () => {
    const b = batch();
    b.key = b.key.filter((k) => k.item_id !== 'q1');
    b.key.find((k) => k.item_id === 'q2')!.answer = 'E';
    expect(reasonsFor(b, 'q1')).toContain('has no answer in key.csv');
    expect(reasonsFor(b, 'q2')).toContain('key answer "E" is not one of the choices (A, B, C, D)');
  });

  it('accepts a fifth choice E only on items that fill choice_e', () => {
    const b = batch();
    b.items[0]!.choice_e = 'Option five';
    b.key[0]!.answer = 'E';
    for (const r of REVIEWERS) b.reviewers[r]![0]!.answer = 'E';
    for (const it of b.items.slice(1)) it.choice_e = '';
    expect(checkBatch(b).failed).toEqual([]);
  });

  it('flags missing rationales, empty stems, empty and duplicate choices', () => {
    const b = batch();
    Object.assign(b.items[0]!, { rationale: '', stem: '', choice_b: '', choice_d: '  option ONE ' });
    expect(reasonsFor(b, 'q1')).toEqual([
      'the question (stem) is empty',
      'the rationale is missing',
      'choice B is empty',
      'choices A and D are the same',
    ]);
  });

  it('flags duplicate questions across the batch, ignoring case and spacing', () => {
    const b = batch();
    b.items[1]!.stem = '  placeholder   QUESTION 1? ';
    expect(reasonsFor(b, 'q1')).toEqual(['same question as q2']);
    expect(reasonsFor(b, 'q2')).toEqual(['same question as q1']);
  });

  it('treats duplicate item ids as a batch problem that fails everything', () => {
    const b = batch();
    b.items.push(item(1));
    const r = checkBatch(b);
    expect(r.batchErrors).toContain('items.csv: item_id "q1" appears more than once');
    expect(r.passed).toEqual([]);
    expect(r.failed.every((f) => f.reasons[0] === 'the batch has errors (see report)')).toBe(true);
  });

  it('requires at least five reviewer files with safe names', () => {
    const b = batch();
    delete b.reviewers.gpt2;
    b.reviewers['Bad Name'] = b.reviewers.gpt1!;
    delete b.reviewers.gpt1;
    const errors = checkBatch(b).batchErrors;
    expect(errors).toContain('reviewer file "Bad Name.csv": name must be lower-case letters, digits or _ (like gpt1)');
    expect(errors).toContain('found 4 reviewer file(s); at least 5 are required');
  });

  it('reports key and review rows for items that do not exist', () => {
    const b = batch();
    b.key.push({ item_id: 'ghost', answer: 'A' });
    b.reviewers.gpt1!.push({ item_id: 'ghost', answer: 'A', verdict: 'pass' });
    const errors = checkBatch(b).batchErrors;
    expect(errors).toContain('key.csv has an answer for unknown item "ghost"');
    expect(errors).toContain('reviewers/gpt1.csv reviews unknown item "ghost"');
  });

  it('rejects malformed ids', () => {
    const b = batch();
    b.items[0]!.item_id = 'has space';
    expect(checkBatch(b).batchErrors[0]).toContain('item_id "has space" is blank or uses characters');
  });

  it('flags unknown fact ids and source ids, and items that cite none', () => {
    const b = batch();
    Object.assign(b.items[0]!, { fact_ids: 'f1; f9', source_ids: 's9' });
    Object.assign(b.items[1]!, { fact_ids: '', source_ids: ' ; ' });
    expect(reasonsFor(b, 'q1')).toEqual(['unknown fact id "f9"', 'unknown source id "s9"']);
    expect(reasonsFor(b, 'q2')).toEqual(['cites no fact ids', 'cites no sources']);
  });

  it('fails items that cite a broken source, directly or through a fact', () => {
    const b = batch();
    b.sources.push({ source_id: 's2', url: 'http://example.org' });
    b.facts.push({ fact_id: 'f2', source_id: 's2' }, { fact_id: 'f3', source_id: 'nope' });
    Object.assign(b.items[0]!, { source_ids: 's2' });
    Object.assign(b.items[1]!, { fact_ids: 'f2;f3' });
    expect(reasonsFor(b, 'q1')).toEqual(['source "s2" url "http://example.org" must start with https://']);
    expect(reasonsFor(b, 'q2')).toEqual([
      'fact "f2" cites a broken source: source "s2" url "http://example.org" must start with https://',
      'fact "f3" cites unknown source "nope"',
    ]);
  });

  it('warns when correct answers lean on one letter, but only for batches of 20 or more', () => {
    expect(checkBatch(batch(4)).warnings).toEqual(['answer balance not judged: fewer than 20 keyed items']);
    expect(checkBatch(batch(20)).warnings).toEqual([]);

    const skewed = batch(20);
    for (const k of skewed.key.slice(0, 10)) k.answer = 'A';
    for (const r of REVIEWERS) skewed.reviewers[r] = skewed.key.map((k) => ({ ...k, verdict: 'pass' }));
    const w = checkBatch(skewed).warnings;
    expect(w).toContain('answer balance: A is correct in 60% of items (an even share is 25%)');
    expect(checkBatch(skewed).failed).toEqual([]); // a warning, not an item failure
  });
});

describe('report', () => {
  it('writes passed and failed CSVs and a readable report', () => {
    const b = batch();
    b.reviewers.gemini![0]!.answer = 'D';
    const r = checkBatch(b);
    expect(passedCsv(r)).toBe('item_id,concept_id\nq2,c1\nq3,c1\nq4,c1\n');
    expect(failedCsv(r)).toBe('item_id,concept_id,reasons\nq1,c1,"gemini: answered D, key says A"\n');
    const md = reportMd(r, 'demo');
    expect(md).toContain('**3 of 4 items passed.** 1 need another look.');
    expect(md).toContain('| gemini | 3 | 4 |');
    expect(md).toContain('- gemini: answered D, key says A');
  });

  it('says "Not ready" when the batch itself has problems', () => {
    const b = batch();
    b.reviewers = {};
    expect(reportMd(checkBatch(b), 'demo')).toContain('**Not ready.**');
  });
});

describe('check_batch command', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function write(input: BatchInput): string {
    dir = mkdtempSync(join(tmpdir(), 'cueory-batch-'));
    const cols = (rows: CsvRow[]) => Object.keys(rows[0] ?? {});
    writeFileSync(join(dir, 'items.csv'), toCsv(cols(input.items), input.items));
    writeFileSync(join(dir, 'key.csv'), toCsv(['item_id', 'answer'], input.key));
    writeFileSync(join(dir, 'facts.csv'), toCsv(['fact_id', 'source_id'], input.facts));
    writeFileSync(join(dir, 'sources.csv'), toCsv(['source_id', 'url'], input.sources));
    mkdirSync(join(dir, 'reviewers'));
    for (const [name, rows] of Object.entries(input.reviewers)) {
      writeFileSync(join(dir, 'reviewers', `${name}.csv`), toCsv(['item_id', 'answer', 'verdict'], rows));
    }
    return dir;
  }

  function run(folder: string): { code: number; out: string } {
    try {
      const out = execFileSync(process.execPath, ['scripts/check_batch.ts', folder], { encoding: 'utf8' });
      return { code: 0, out };
    } catch (e) {
      const err = e as { status: number; stdout: string; stderr: string };
      return { code: err.status, out: err.stdout + err.stderr };
    }
  }

  it('exits 0 and writes all three files for a clean batch', () => {
    const folder = write(batch());
    const { code, out } = run(folder);
    expect(code).toBe(0);
    expect(out).toContain('4 passed, 0 failed');
    expect(readFileSync(join(folder, 'passed.csv'), 'utf8')).toContain('q4,c1');
    expect(readFileSync(join(folder, 'failed.csv'), 'utf8')).toBe('item_id,concept_id,reasons\n');
    expect(readFileSync(join(folder, 'report.md'), 'utf8')).toContain('4 of 4 items passed');
  });

  it('exits 1 when some items fail', () => {
    const b = batch();
    b.reviewers.gpt1![0]!.verdict = 'fail';
    expect(run(write(b)).code).toBe(1);
  });

  it('exits 2 with a clear message when a file is missing or malformed', () => {
    const folder = write(batch());
    rmSync(join(folder, 'key.csv'));
    expect(run(folder)).toEqual({ code: 2, out: expect.stringContaining('key.csv is missing') });
    writeFileSync(join(folder, 'key.csv'), 'item_id\nq1\n');
    expect(run(folder)).toEqual({ code: 2, out: expect.stringContaining('key.csv: missing column(s): answer') });
  });
});
