import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { answerLetters, checkBatch, itemType, linkProblem, REVIEWER_ROSTER, type BatchInput } from '../../scripts/check-batch/check.ts';
import { CsvError, parseCsv, toCsv, type CsvRow } from '../../scripts/check-batch/csv.ts';
import { failedCsv, passedCsv, pendingCsv, reportMd } from '../../scripts/check-batch/report.ts';

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

  it('fails an item a reviewer marked fail or did not review', () => {
    const b = batch();
    b.reviewers.gpt1![0]!.verdict = 'fail';
    b.reviewers.codex = b.reviewers.codex!.filter((r) => r.item_id !== 'q1');
    expect(reasonsFor(b, 'q1')).toEqual(['codex: no review', 'gpt1: marked it fail']);
  });

  it('puts an item that is only waiting on a reviewer in pending, never in passed or failed', () => {
    const b = batch();
    b.reviewers.gpt2![0]!.verdict = 'Pending';
    b.reviewers.gemini![0]!.verdict = 'pending';
    const r = checkBatch(b);
    expect(r.pending.map((p) => [p.item_id, p.waiting])).toEqual([
      ['q1', ['gemini: review still pending', 'gpt2: review still pending']],
    ]);
    expect(r.passed.map((p) => p.item_id)).toEqual(['q2', 'q3', 'q4']);
    expect(r.failed).toEqual([]);
  });

  it('fails, rather than parks, an item that is both pending and wrong', () => {
    const b = batch();
    b.reviewers.gpt2![0]!.verdict = 'pending';
    b.reviewers.gpt1![0]!.verdict = 'fail';
    const r = checkBatch(b);
    expect(r.failed.map((f) => f.item_id)).toEqual(['q1']);
    expect(r.pending).toEqual([]);
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

  it('requires at least five reviewer files', () => {
    const b = batch();
    delete b.reviewers.gpt2;
    expect(checkBatch(b).batchErrors).toEqual(['found 4 reviewer file(s); at least 5 are required']);
  });

  it('accepts every name on the reviewer roster', () => {
    const rows = batch().reviewers.gpt1!;
    const b = batch();
    b.reviewers = Object.fromEntries(REVIEWER_ROSTER.map((name) => [name, rows]));
    expect(checkBatch(b).batchErrors).toEqual([]);
  });

  it.each(['gtp1', 'GPT1', 'gpt4', 'claude', 'Bad Name'])('treats reviewer file "%s.csv" as a batch problem', (name) => {
    const b = batch();
    b.reviewers[name] = b.reviewers.gpt1!;
    delete b.reviewers.gpt1;
    const r = checkBatch(b);
    expect(r.batchErrors).toEqual([
      `reviewer file "${name}.csv": not a known reviewer (expected one of ${REVIEWER_ROSTER.join(', ')}); check for a typo`,
    ]);
    expect(r.passed).toEqual([]);
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
    expect(checkBatch(batch(4)).warnings).toEqual(['answer balance not judged: fewer than 20 keyed single-answer items']);
    expect(checkBatch(batch(20)).warnings).toEqual([]);

    const skewed = batch(20);
    for (const k of skewed.key.slice(0, 10)) k.answer = 'A';
    for (const r of REVIEWERS) skewed.reviewers[r] = skewed.key.map((k) => ({ ...k, verdict: 'pass' }));
    const w = checkBatch(skewed).warnings;
    expect(w).toContain('answer balance: A is correct in 60% of items (an even share is 25%)');
    expect(checkBatch(skewed).failed).toEqual([]); // a warning, not an item failure
  });
});

/** A select-all-that-apply item with a rationale for every choice. */
function sataItem(n: number, over: Partial<CsvRow> = {}): CsvRow {
  return item(n, {
    type: 'sata',
    rationale_a: 'Placeholder reason A.',
    rationale_b: 'Placeholder reason B.',
    rationale_c: 'Placeholder reason C.',
    rationale_d: 'Placeholder reason D.',
    ...over,
  });
}

/** A clean batch: the four single-answer items plus one select-all-that-apply item keyed A;C. */
function sataBatch(over: Partial<CsvRow> = {}, answers: Record<string, string> = {}): BatchInput {
  const b = batch(4);
  b.items.push(sataItem(5, over));
  b.key.push({ item_id: 'q5', answer: 'A;C' });
  for (const r of REVIEWERS) b.reviewers[r]!.push({ item_id: 'q5', answer: answers[r] ?? 'A;C', verdict: 'pass' });
  return b;
}

describe('select-all-that-apply items (D-45)', () => {
  it('reads the type, blank meaning single', () => {
    expect(itemType(item(1))).toBe('single');
    expect(itemType(item(1, { type: ' Single ' }))).toBe('single');
    expect(itemType(item(1, { type: 'SATA' }))).toBe('sata');
    expect(itemType(item(1, { type: 'multi' }))).toBeNull();
  });

  it('reads answer letters in any order, case or spacing, and rejects bad ones', () => {
    const offered = ['A', 'B', 'C', 'D'] as const;
    expect(answerLetters(' c ; a ', offered)).toEqual({ letters: ['A', 'C'] });
    expect(answerLetters('', offered)).toEqual({ problem: 'is empty' });
    expect(answerLetters('A;E', offered)).toEqual({ problem: '"A;E" is not one of the choices (A, B, C, D)' });
    expect(answerLetters('A;a', offered)).toEqual({ problem: '"A;a" names a choice twice' });
    expect(answerLetters('A;', offered)).toEqual({ problem: '"A;" has an empty place between ;' });
    expect(answerLetters('A;;C', offered)).toEqual({ problem: '"A;;C" has an empty place between ;' });
  });

  it('keeps single-answer cells to exactly one letter, as before', () => {
    const b = batch(4);
    b.key[0] = { item_id: 'q1', answer: 'A;' };
    b.reviewers.gpt1![1] = { item_id: 'q2', answer: 'B;', verdict: 'pass' };
    expect(reasonsFor(b, 'q1')).toContain('key answer "A;" is not one of the choices (A, B, C, D)');
    expect(reasonsFor(b, 'q2')).toEqual(['gpt1: answer "B;" is not one of the choices']);
    // q2's answer isn't counted; q1 has no usable key, so it is answered but can't match.
    expect(checkBatch(b).agreement.gpt1).toEqual({ matched: 2, answered: 3 });
  });

  it('passes when every reviewer picks exactly the key letters, in any order', () => {
    const result = checkBatch(sataBatch({}, { codex: 'C;A', gemini: ' a ; c ' }));
    expect(result.failed).toEqual([]);
    expect(result.passed.map((p) => p.item_id)).toContain('q5');
    expect(result.sata).toBe(1);
    expect(result.agreement.codex).toEqual({ matched: 5, answered: 5 });
  });

  it('is all-or-nothing: missing or adding a letter is a disagreement', () => {
    expect(reasonsFor(sataBatch({}, { codex: 'A' }), 'q5')).toEqual(['codex: answered A, key says A;C']);
    expect(reasonsFor(sataBatch({}, { gpt1: 'A;B;C' }), 'q5')).toEqual(['gpt1: answered A;B;C, key says A;C']);
  });

  it('needs a rationale for every choice', () => {
    expect(reasonsFor(sataBatch({ rationale_b: ' ' }), 'q5')).toEqual([
      'choice B has no rationale (rationale_b); select-all-that-apply needs one for every choice',
    ]);
    const withE = sataBatch({ choice_e: 'Option five' });
    expect(reasonsFor(withE, 'q5')).toEqual([
      'choice E has no rationale (rationale_e); select-all-that-apply needs one for every choice',
    ]);
  });

  it('catches a key with several letters on a single-answer item, and unknown types', () => {
    const b = batch(4);
    b.key[0] = { item_id: 'q1', answer: 'A;C' };
    expect(reasonsFor(b, 'q1')).toContain(
      'key gives A;C but the item is single-answer; set type to sata for select-all-that-apply',
    );
    const typo = batch(4);
    typo.items[1] = item(2, { type: 'multi' });
    expect(reasonsFor(typo, 'q2')).toContain('type "multi" must be single or sata (blank means single)');
  });

  it('rejects key and reviewer answers that are not clean lists of choices', () => {
    const b = sataBatch({}, { gpt2: 'A;F' });
    b.key[4] = { item_id: 'q5', answer: 'A;A' };
    const reasons = reasonsFor(b, 'q5');
    expect(reasons).toContain('key answer "A;A" names a choice twice');
    expect(reasons).toContain('gpt2: answer "A;F" must be letters from the choices, separated by ;');
  });

  it('leaves select-all-that-apply items out of the answer balance', () => {
    const b = batch(20);
    for (let n = 21; n <= 30; n++) {
      b.items.push(sataItem(n));
      b.key.push({ item_id: `q${n}`, answer: 'A;B' });
      for (const r of REVIEWERS) b.reviewers[r]!.push({ item_id: `q${n}`, answer: 'A;B', verdict: 'pass' });
    }
    const result = checkBatch(b);
    expect(result.failed).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.balance).toEqual({ A: 5, B: 5, C: 5, D: 5 });
    expect(result.sata).toBe(10);
    expect(reportMd(result, 'mixed')).toContain('10 select-all-that-apply items are scored all-or-nothing');
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
    expect(md).toContain('**3 of 4 items passed.** 1 failed and 0 are waiting on a reviewer.');
    expect(md).toContain('| gemini | 3 | 4 |');
    expect(md).toContain('- gemini: answered D, key says A');
  });

  it('lists pending items in pending.csv and the report, separately from failures', () => {
    const b = batch();
    b.reviewers.gpt2![0]!.verdict = 'pending';
    const r = checkBatch(b);
    expect(pendingCsv(r)).toBe('item_id,concept_id,waiting_for\nq1,c1,gpt2: review still pending\n');
    expect(failedCsv(r)).toBe('item_id,concept_id,reasons\n');
    const md = reportMd(r, 'demo');
    expect(md).toContain('**3 of 4 items passed.** 0 failed and 1 are waiting on a reviewer.');
    expect(md).toContain('## Items waiting on a reviewer (not passed yet)');
    expect(md).not.toContain('## Items that need another look');
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

  function run(folder: string, ...args: string[]): { code: number; out: string } {
    try {
      const out = execFileSync(process.execPath, ['scripts/check_batch.ts', folder, ...args], { encoding: 'utf8' });
      return { code: 0, out };
    } catch (e) {
      const err = e as { status: number; stdout: string; stderr: string };
      return { code: err.status, out: err.stdout + err.stderr };
    }
  }

  it('exits 0 and writes all four files for a clean batch', () => {
    const folder = write(batch());
    const { code, out } = run(folder);
    expect(code).toBe(0);
    expect(out).toContain('4 passed, 0 failed, 0 pending');
    expect(readFileSync(join(folder, 'pending.csv'), 'utf8')).toBe('item_id,concept_id,waiting_for\n');
    expect(readFileSync(join(folder, 'passed.csv'), 'utf8')).toContain('q4,c1');
    expect(readFileSync(join(folder, 'failed.csv'), 'utf8')).toBe('item_id,concept_id,reasons\n');
    expect(readFileSync(join(folder, 'report.md'), 'utf8')).toContain('4 of 4 items passed');
  });

  it('exits 1 when some items fail', () => {
    const b = batch();
    b.reviewers.gpt1![0]!.verdict = 'fail';
    expect(run(write(b)).code).toBe(1);
  });

  it('exits 1 when an item is only pending, and lists it in pending.csv', () => {
    const b = batch();
    b.reviewers.gpt1![0]!.verdict = 'pending';
    const folder = write(b);
    const { code, out } = run(folder);
    expect(code).toBe(1);
    expect(out).toContain('3 passed, 0 failed, 1 pending');
    expect(readFileSync(join(folder, 'pending.csv'), 'utf8')).toContain('q1,c1,gpt1: review still pending');
    expect(readFileSync(join(folder, 'passed.csv'), 'utf8')).not.toContain('q1');
  });

  it('exits 2 with a clear message when a file is missing or malformed', () => {
    const folder = write(batch());
    rmSync(join(folder, 'key.csv'));
    expect(run(folder)).toEqual({ code: 2, out: expect.stringContaining('key.csv is missing') });
    writeFileSync(join(folder, 'key.csv'), 'item_id\nq1\n');
    expect(run(folder)).toEqual({ code: 2, out: expect.stringContaining('key.csv: missing column(s): answer') });
  });

  it.each([[[] as string[]], [['--out', 'results']]])(
    'removes earlier results when a later run cannot read the batch (%j)',
    (args) => {
      const folder = write(batch());
      const outArgs = args.map((a) => (a === 'results' ? join(folder, 'results') : a));
      const out = outArgs.length > 0 ? outArgs[1]! : folder;
      expect(run(folder, ...outArgs).code).toBe(0);
      expect(readFileSync(join(out, 'report.md'), 'utf8')).toContain('4 of 4 items passed');

      writeFileSync(join(folder, 'reviewers', 'gpt1.csv'), 'item_id,answer\nq1,A\n');
      expect(run(folder, ...outArgs).code).toBe(2);
      expect(existsSync(join(out, 'passed.csv'))).toBe(false);
      expect(existsSync(join(out, 'failed.csv'))).toBe(false);
      expect(existsSync(join(out, 'pending.csv'))).toBe(false);
      const report = readFileSync(join(out, 'report.md'), 'utf8');
      expect(report).toContain('not checked');
      expect(report).toContain('reviewers/gpt1.csv');
      expect(report).not.toContain('items passed');
    },
  );

  it('removes earlier results when a batch file cannot be read at all', () => {
    const folder = write(batch());
    expect(run(folder).code).toBe(0);

    // A folder where a file should be makes reading it fail with a file-system error, not a CSV error.
    rmSync(join(folder, 'reviewers', 'gpt1.csv'));
    mkdirSync(join(folder, 'reviewers', 'gpt1.csv'));
    expect(run(folder)).toEqual({ code: 2, out: expect.stringContaining('reviewers/gpt1.csv could not be read') });
    expect(existsSync(join(folder, 'passed.csv'))).toBe(false);
    expect(existsSync(join(folder, 'failed.csv'))).toBe(false);
    expect(readFileSync(join(folder, 'report.md'), 'utf8')).toContain('not checked');
  });
});
