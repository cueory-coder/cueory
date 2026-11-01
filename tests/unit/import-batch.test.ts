import { describe, expect, it } from 'vitest';
import { checkBatch, ITEM_COLUMNS, KEY_COLUMNS, REVIEWER_ROSTER } from '../../scripts/check-batch/check';
import { passedCsv } from '../../scripts/check-batch/report';
import { toCsv, type CsvRow } from '../../scripts/check-batch/csv';
import { parsePassed, itemHash, type BatchFiles } from '../../scripts/import-batch/parse';

const columns = [...ITEM_COLUMNS, 'type', 'choice_e', 'rationale_a', 'rationale_b', 'rationale_c', 'rationale_d', 'rationale_e'];
const sample: CsvRow = {
  item_id: 'sample-1', concept_id: 'sample-concept', type: 'single', stem: 'sample: choose a shape',
  choice_a: 'sample: circle', choice_b: 'sample: square', choice_c: 'sample: triangle', choice_d: 'sample: star',
  rationale: 'sample: main explanation', rationale_a: 'sample: first explanation', rationale_b: 'sample: second explanation',
  rationale_c: 'sample: third explanation', rationale_d: 'sample: fourth explanation', fact_ids: 'sample-fact', source_ids: 'sample-source',
};
const sampleKey = { item_id: 'sample-1', answer: 'A' };
const allow = (rows: CsvRow[] = [sample]) => toCsv(['item_id', 'concept_id'], rows);
const files = (items: CsvRow[] = [sample], key: CsvRow[] = [sampleKey]): BatchFiles => ({
  itemsCsv: toCsv(columns, items), keyCsv: toCsv(KEY_COLUMNS, key),
});
const parse = (item: CsvRow = sample, key: CsvRow = sampleKey) => parsePassed(allow([item]), files([item], [key]));

describe('passed batch parsing', () => {
  it("joins the real checker's ID-only report to its original item and key files", () => {
    const checked = checkBatch({
      items: [sample], key: [sampleKey],
      facts: [{ fact_id: 'sample-fact', source_id: 'sample-source' }],
      sources: [{ source_id: 'sample-source', url: 'https://example.invalid/sample' }],
      reviewers: Object.fromEntries(REVIEWER_ROSTER.slice(0, 5).map(name => [name, [{ item_id: 'sample-1', answer: 'A', verdict: 'pass' }]])),
    });
    expect(checked.passed).toHaveLength(1);
    expect(passedCsv(checked).split('\n')[0]).toBe('item_id,concept_id');
    expect(parsePassed(passedCsv(checked), files())).toEqual({ items: [{
      id: 'sample-1', conceptId: 'sample-concept', type: 'single', stem: 'sample: choose a shape', rationale: 'sample: main explanation',
      choices: [
        { id: 'a', text: 'sample: circle' }, { id: 'b', text: 'sample: square' },
        { id: 'c', text: 'sample: triangle' }, { id: 'd', text: 'sample: star' },
      ],
      key: ['a'], rationales: { a: 'sample: first explanation', b: 'sample: second explanation', c: 'sample: third explanation', d: 'sample: fourth explanation' },
      sourceIds: ['sample-source'], version: 1,
    }], problems: [] });
  });

  it('parses SATA and a fifth choice, canonicalizing letters without guessing text', () => {
    const item = { ...sample, type: 'sata', choice_e: 'sample: oval', rationale_e: 'sample: fifth explanation', source_ids: 'sample-source;sample-other' };
    const result = parse(item, { ...sampleKey, answer: ' e ; a ; C ' });
    expect(result.problems).toEqual([]);
    expect(result.items[0]).toMatchObject({ type: 'sata', key: ['a', 'c', 'e'], sourceIds: ['sample-source', 'sample-other'], version: 1 });
    expect(result.items[0].choices[4]).toEqual({ id: 'e', text: 'sample: oval' });
    expect(result.items[0].rationales.e).toBe('sample: fifth explanation');
  });

  it('uses the documented single default when the optional type column is absent or blank', () => {
    const data = files();
    data.itemsCsv = toCsv(columns.filter(column => column !== 'type'), [sample]);
    expect(parsePassed(allow(), data).items[0].type).toBe('single');
    expect(parse({ ...sample, type: '' }).items[0].type).toBe('single');
  });

  it('preserves quoted commas, quotes, Unicode and line breaks inside sample cells', () => {
    const item = {
      ...sample, stem: 'sample: first line, "quoted"\nsecond line 王',
      choice_a: 'sample: circle, "round"', rationale_a: 'sample: one\r\ntwo, "three"', rationale: 'sample: main, "explanation"\nsecond line',
    };
    const result = parse(item);
    expect(result.problems).toEqual([]);
    expect(result.items[0].stem).toBe(item.stem);
    expect(result.items[0].choices[0].text).toBe(item.choice_a);
    expect(result.items[0].rationales.a).toBe(item.rationale_a);
    expect(result.items[0].rationale).toBe(item.rationale);
  });

  it('imports only the allowlisted rows, in allowlist order', () => {
    const second = { ...sample, item_id: 'sample-2', stem: 'sample: second question' };
    const ignored = { ...sample, item_id: 'sample-ignored', stem: 'sample: unapproved data', choice_a: '' };
    const result = parsePassed(allow([second, sample]), files([sample, ignored, second], [sampleKey, { ...sampleKey, item_id: 'sample-2' }]));
    expect(result.problems).toEqual([]);
    expect(result.items.map(item => item.id)).toEqual(['sample-2', 'sample-1']);
    expect(JSON.stringify(result.items)).not.toContain('unapproved');
  });

  it('requires the original files instead of filling an ID-only row', () => {
    const result = parsePassed(allow());
    expect(result.items).toEqual([]);
    expect(result.problems).toEqual([{
      file: 'passed.csv', row: 1, message: 'the original items.csv and key.csv texts are needed; passed.csv contains only ids.',
    }]);
  });

  it.each([
    [{ itemsCsv: '', keyCsv: undefined }, 'the original'],
    [{ itemsCsv: undefined, keyCsv: '' }, 'the original'],
  ])('refuses missing batch text %j', (data, words) => {
    const result = parsePassed(allow(), data as unknown as BatchFiles);
    expect(result.items).toEqual([]);
    expect(result.problems[0].message).toContain(words);
  });

  it('accepts an empty allowlist without importing any other original rows', () => {
    expect(parsePassed(allow([]), files())).toEqual({ items: [], problems: [] });
  });

  it.each([
    [[], [sampleKey], 'items.csv'],
    [[sample], [], 'key.csv'],
    [[sample, sample], [sampleKey], 'items.csv'],
    [[sample], [sampleKey, sampleKey], 'key.csv'],
  ] as const)('refuses missing or ambiguous joined rows in %s / %s', (items, keys, file) => {
    const result = parsePassed(allow(), files([...items], [...keys]));
    expect(result.items).toEqual([]);
    expect(result.problems[0]).toMatchObject({ file: 'passed.csv', row: 2 });
    expect(result.problems[0].message).toContain(file);
  });

  it('refuses every copy of a repeated passed ID', () => {
    const result = parsePassed(allow([sample, sample]), files());
    expect(result.items).toEqual([]);
    expect(result.problems.map(problem => problem.row)).toEqual([2, 3]);
    expect(result.problems.every(problem => problem.message.includes('more than once'))).toBe(true);
  });

  it('refuses a concept mismatch instead of replacing either supplied concept', () => {
    const result = parsePassed(allow([{ ...sample, concept_id: 'sample-other-concept' }]), files());
    expect(result.items).toEqual([]);
    expect(result.problems).toEqual([{ file: 'passed.csv', row: 2, message: 'the concept id must match items.csv row 2.' }]);
  });

  it.each(['', 'sample with spaces', '-sample', 'x'.repeat(65)])('refuses an invalid passed ID %j', id => {
    const result = parsePassed(allow([{ ...sample, item_id: id }]), files());
    expect(result.items).toEqual([]);
    expect(result.problems[0]).toMatchObject({ file: 'passed.csv', row: 2 });
  });
});

describe('row refusals and problem locations', () => {
  it.each(['F', 'A;A', 'A;;B', '', 'A;E'])('refuses a key outside the offered choices or malformed key %j', answer => {
    const result = parse(sample, { ...sampleKey, answer });
    expect(result.items).toEqual([]);
    expect(result.problems[0]).toMatchObject({ file: 'key.csv', row: 2 });
  });

  it('refuses an empty SATA key and multiple choices in a single key', () => {
    expect(parse({ ...sample, type: 'sata' }, { ...sampleKey, answer: '' }).items).toEqual([]);
    const single = parse(sample, { ...sampleKey, answer: 'A;B' });
    expect(single.problems).toEqual([{ file: 'key.csv', row: 2, message: 'a single-answer question needs exactly one choice in its key.' }]);
  });

  it('refuses choices that repeat after capitalization and whitespace normalization', () => {
    const result = parse({ ...sample, choice_b: ' SAMPLE:   CIRCLE ' });
    expect(result.items).toEqual([]);
    expect(result.problems.some(problem => problem.message.includes('different text'))).toBe(true);
  });

  it.each(['rationale_a', 'rationale_b', 'rationale_c', 'rationale_d'])('requires per-choice rationale %s for sata, refuses missing with main', field => {
    const result = parse({ ...sample, type: 'sata', [field]: '' }, { ...sampleKey, answer: 'A;B;C;D' });
    expect(result.items).toEqual([]);
    expect(result.problems[0]).toMatchObject({ file: 'items.csv', row: 2 });
    expect(result.problems[0].message).toContain(`choice ${field.slice(-1)}`);
  });

  it('requires a rationale for an optional fifth choice on sata too', () => {
    const result = parse({ ...sample, type: 'sata', choice_e: 'sample: oval' }, { ...sampleKey, answer: 'A;B;C;D;E' });
    expect(result.items).toEqual([]);
    expect(result.problems[0].message).toContain('choice e');
  });

  it.each(['stem', 'choice_a', 'rationale', 'fact_ids', 'source_ids'])('refuses the missing required field %s', field => {
    const result = parse({ ...sample, [field]: '' });
    expect(result.items).toEqual([]);
    expect(result.problems.every(problem => problem.file === 'items.csv' || problem.file === 'key.csv')).toBe(true);
  });

  it.each(['sample source', ';;'])('refuses unusable source ids %s', source_ids => {
    expect(parse({ ...sample, source_ids }).items).toEqual([]);
  });

  it.each([
    ['sample-source;', ['sample-source']],
    ['; sample-source ;;', ['sample-source']],
    ['sample-source;sample-source', ['sample-source', 'sample-source']],
  ] as const)("matches the checker's source-list handling for %s", (source_ids, expected) => {
    const result = parse({ ...sample, source_ids, fact_ids: '; sample-fact ;;' });
    expect(result.problems).toEqual([]);
    expect(result.items[0].sourceIds).toEqual(expected);
  });

  it('refuses an unknown question type', () => {
    expect(parse({ ...sample, type: 'sample: invented' }).problems[0].message).toBe('choose single or sata for the question type.');
  });

  it("reports the original file's record number, not the allowlist position", () => {
    const invalid = { ...sample, item_id: 'sample-2', type: 'sata', rationale_c: '' };
    const result = parsePassed(allow([invalid]), files([sample, invalid], [{ item_id: 'sample-2', answer: 'A;B;C;D' }]));
    expect(result.problems).toEqual([{ file: 'items.csv', row: 3, message: 'fill in the rationale for choice c; the main rationale cannot replace it.' }]);
  });

  it('keeps a valid passed row while refusing another, without mutating any input', () => {
    const invalid = { ...sample, item_id: 'sample-2', type: 'sata', rationale_c: '' };
    const batch = Object.freeze(files([sample, invalid], [sampleKey, { item_id: 'sample-2', answer: 'A;B;C;D' }]));
    const original = { ...batch };
    const result = parsePassed(allow([invalid, sample]), batch);
    expect(result.items.map(item => item.id)).toEqual(['sample-1']);
    expect(result.problems).toHaveLength(1);
    result.items[0].key.push('b');
    expect(parsePassed(allow(), batch).items[0].key).toEqual(['a']);
    expect(batch).toEqual(original);
  });

  it.each(['passed.csv', 'items.csv', 'key.csv'] as const)('reports malformed quoting in %s without an exception', file => {
    const batch = files();
    let passed = allow();
    const broken = 'item_id,concept_id\n"sample: never closed';
    if (file === 'passed.csv') passed = broken;
    else batch[file === 'items.csv' ? 'itemsCsv' : 'keyCsv'] = broken;
    const result = parsePassed(passed, batch);
    expect(result.items).toEqual([]);
    expect(result.problems[0]).toMatchObject({ file, row: 2 });
    expect(result.problems[0].message).toContain('never closed');
  });

  it('accepts a single-answer item with no per-choice rationales (Gap 2 fix)', () => {
    const noRationales = { ...sample, rationale_a: '', rationale_b: '', rationale_c: '', rationale_d: '' };
    const result = parse(noRationales);
    expect(result.problems).toEqual([]);
    expect(result.items[0].rationales).toEqual({});
  });

  it('accepts a single-answer item with some per-choice rationales and omits the rest', () => {
    const partial = { ...sample, rationale_b: '', rationale_d: '' };
    const result = parse(partial);
    expect(result.problems).toEqual([]);
    expect(result.items[0].rationales).toEqual({ a: sample.rationale_a, c: sample.rationale_c });
  });

  it('refuses an item whose hash does not match (Gap 1 fix)', () => {
    const correctHash = itemHash(sample, sampleKey);
    const brokenHash = correctHash.replace(/.$/, correctHash.at(-1) === 'f' ? '0' : 'f');
    const passedWithHash = toCsv(['item_id', 'concept_id', 'hash'], [{ ...sample, hash: brokenHash }]);
    const result = parsePassed(passedWithHash, files());
    expect(result.items).toEqual([]);
    expect(result.problems).toEqual([{
      file: 'passed.csv', row: 2, message: 'the item hash does not match; the question may have changed since it passed review.',
    }]);
  });

  it('accepts an item whose hash matches and imports it normally', () => {
    const correctHash = itemHash(sample, sampleKey);
    const passedWithHash = toCsv(['item_id', 'concept_id', 'hash'], [{ ...sample, hash: correctHash }]);
    const result = parsePassed(passedWithHash, files());
    expect(result.problems).toEqual([]);
    expect(result.items[0].id).toBe('sample-1');
  });

  it('skips hash verification when the hash column is absent (backward compatibility)', () => {
    const result = parsePassed(allow(), files());
    expect(result.problems).toEqual([]);
    expect(result.items[0].id).toBe('sample-1');
  });

  it('refuses missing headers and partial CSV records before importing anything', () => {
    const batch = files();
    batch.keyCsv = 'item_id\nsample-1\n';
    expect(parsePassed(allow(), batch).problems[0].message).toContain('missing column(s): answer');
    const partial = parsePassed('item_id,concept_id\nsample-1\n', files());
    expect(partial.items).toEqual([]);
    expect(partial.problems[0]).toMatchObject({ file: 'passed.csv', row: 2 });
    expect(parsePassed('', files()).problems[0].message).toContain('header');
  });
});
