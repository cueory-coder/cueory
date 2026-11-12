import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  gameSampleSchemas, helloCardsSampleSchema, pulseSampleSchema,
  statSampleSchema, triageSampleSchema,
} from '../../src/content/game-schemas';

const folders = [
  { name: 'pulse', filename: /^sample-\d{2}\.json$/ },
  { name: 'stat', filename: /^sample\.json$/ },
  { name: 'hello-cards', filename: /^starters\.json$/ },
  { name: 'triage', filename: /^sample-\d{2}\.json$/ },
] as const;

const pulse = () => ({ status: 'sample', word: 'aaaaa', cue: '[sample cue]' });
const triage = () => ({
  status: 'sample',
  groups: [
    { name: 'group one', terms: ['term aa', 'term ab', 'term ac'] },
    { name: 'group two', terms: ['term ba', 'term bb', 'term bc'] },
    { name: 'group three', terms: ['term ca', 'term cb', 'term cc'] },
  ],
  oddOne: 'sample odd',
});
const stat = () => ({
  status: 'sample',
  note: '[sample]',
  questions: Array.from({ length: 15 }, (_, index) => ({
    id: 'sample-' + String(index + 1).padStart(2, '0'),
    stem: '[sample question ' + (index + 1) + ']',
    choices: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: '[sample choice ' + id + ']' })),
    sampleKey: 'a',
  })),
});
const helloCards = () => ({
  status: 'sample',
  note: '[sample]',
  starters: (['patients', 'coworkers', 'classmates', 'yourself'] as const).flatMap((category) =>
    (['small', 'deep'] as const).map((depth) => ({
      id: category + '-' + depth,
      category,
      depth,
      text: '[sample starter ' + category + '-' + depth + ']?',
    })),
  ),
});

describe('all daily-game sample files', () => {
  for (const { name, filename } of folders) {
    it('validates each ' + name + ' JSON file and its sample label', () => {
      const folder = new URL('../../content/games/' + name + '/', import.meta.url);
      const files = readdirSync(folder).filter((file) => file.endsWith('.json'));
      expect(files.length, name + ' must have sample files').toBeGreaterThan(0);
      for (const file of files) {
        expect(file, name + ' filename').toMatch(filename);
        const data: unknown = JSON.parse(readFileSync(new URL(file, folder), 'utf8'));
        const result = gameSampleSchemas[name].safeParse(data);
        if (!result.success) {
          const issues = result.error.issues.map((issue) =>
            issue.path.join('.') + ': ' + issue.message).join('\n');
          throw new Error(name + '/' + file + ' has an invalid sample schema:\n' + issues);
        }
        expect(result.data.status).toBe('sample');
      }
    });
  }
});

describe('pulse malformed samples', () => {
  it('accepts a valid placeholder', () => {
    expect(pulseSampleSchema.safeParse(pulse()).success).toBe(true);
  });
  it('rejects wrong status, word, cue or unknown fields', () => {
    expect(pulseSampleSchema.safeParse({ ...pulse(), status: 'approved' }).success).toBe(false);
    expect(pulseSampleSchema.safeParse({ ...pulse(), word: 'aaaaaa' }).success).toBe(false);
    expect(pulseSampleSchema.safeParse({ ...pulse(), word: 'Abcde' }).success).toBe(false);
    expect(pulseSampleSchema.safeParse({ ...pulse(), cue: '   ' }).success).toBe(false);
    expect(pulseSampleSchema.safeParse({ ...pulse(), cue: 'x'.repeat(121) }).success).toBe(false);
    expect(pulseSampleSchema.safeParse({ ...pulse(), answerKey: 'private' }).success).toBe(false);
  });
});

describe('triage malformed samples', () => {
  it('accepts distinct groups and terms', () => {
    expect(triageSampleSchema.safeParse(triage()).success).toBe(true);
  });
  it('rejects wrong status, group count, duplicated names or terms', () => {
    expect(triageSampleSchema.safeParse({ ...triage(), status: 'draft' }).success).toBe(false);
    expect(triageSampleSchema.safeParse({ ...triage(), groups: triage().groups.slice(0, 2) }).success).toBe(false);
    const duplicateName = triage();
    duplicateName.groups[1]!.name = duplicateName.groups[0]!.name;
    expect(triageSampleSchema.safeParse(duplicateName).success).toBe(false);
    const duplicateTerm = triage();
    duplicateTerm.groups[2]!.terms[0] = duplicateTerm.groups[0]!.terms[0]!;
    expect(triageSampleSchema.safeParse(duplicateTerm).success).toBe(false);
    expect(triageSampleSchema.safeParse({ ...triage(), oddOne: 'term aa' }).success).toBe(false);
  });
  it('rejects wrong group size, uppercase terms or extra fields', () => {
    const shortGroup = triage();
    shortGroup.groups[0]!.terms.pop();
    expect(triageSampleSchema.safeParse(shortGroup).success).toBe(false);
    expect(triageSampleSchema.safeParse({ ...triage(), oddOne: 'UPPERCASE' }).success).toBe(false);
    expect(triageSampleSchema.safeParse({ ...triage(), extra: true }).success).toBe(false);
  });
});

describe('stat malformed samples', () => {
  it('accepts fifteen labeled sample questions', () => {
    expect(statSampleSchema.safeParse(stat()).success).toBe(true);
  });
  it('rejects wrong status, count, unlabeled prompts or duplicate ids', () => {
    expect(statSampleSchema.safeParse({ ...stat(), status: 'published' }).success).toBe(false);
    expect(statSampleSchema.safeParse({ ...stat(), questions: stat().questions.slice(0, 14) }).success).toBe(false);
    const unlabeled = stat();
    unlabeled.questions[0]!.stem = 'not labeled';
    expect(statSampleSchema.safeParse(unlabeled).success).toBe(false);
    const duplicateId = stat();
    duplicateId.questions[1]!.id = duplicateId.questions[0]!.id;
    expect(statSampleSchema.safeParse(duplicateId).success).toBe(false);
  });
  it('rejects swapped choices, unlabeled choices, invalid keys or extra fields', () => {
    const wrongOrder = stat();
    wrongOrder.questions[0]!.choices[0]!.id = 'b';
    expect(statSampleSchema.safeParse(wrongOrder).success).toBe(false);
    const unlabeled = stat();
    unlabeled.questions[0]!.choices[0]!.text = 'not labeled';
    expect(statSampleSchema.safeParse(unlabeled).success).toBe(false);
    const badKey = stat();
    badKey.questions[0]!.sampleKey = 'e';
    expect(statSampleSchema.safeParse(badKey).success).toBe(false);
    expect(statSampleSchema.safeParse({ ...stat(), hiddenAnswers: [] }).success).toBe(false);
    const rationale = stat();
    expect(statSampleSchema.safeParse({
      ...rationale,
      questions: [{ ...rationale.questions[0], rationale: '[sample]' }, ...rationale.questions.slice(1)],
    }).success).toBe(false);
  });
});

describe('stat label boundaries', () => {
  it('rejects misleading labels and text outside the sample brackets', () => {
    const invalid = [
      '[sampled]',
      '[samples]',
      '[sampled] outside text [1]',
      '[sample] extra text',
      '[sample text] extra',
      '[sample [nested]]',
      '[sample][additional]',
    ];
    for (const text of invalid) {
      const badStem = stat();
      badStem.questions[0]!.stem = text;
      expect(statSampleSchema.safeParse(badStem).success, 'stem: ' + text).toBe(false);
      const badChoice = stat();
      badChoice.questions[0]!.choices[0]!.text = text;
      expect(statSampleSchema.safeParse(badChoice).success, 'choice: ' + text).toBe(false);
    }
  });
  it('accepts fully bracketed sample-only text', () => {
    const minimal = stat();
    minimal.questions[0]!.stem = '[sample]';
    minimal.questions[0]!.choices[0]!.text = '[sample]';
    expect(statSampleSchema.safeParse(minimal).success).toBe(true);
  });
});

describe('hello-cards malformed samples', () => {
  it('accepts a labeled sample with all category and depth combinations', () => {
    expect(helloCardsSampleSchema.safeParse(helloCards()).success).toBe(true);
  });
  it('rejects wrong status, missing category coverage or repeated values', () => {
    expect(helloCardsSampleSchema.safeParse({ ...helloCards(), status: 'approved' }).success).toBe(false);
    const missingDepth = helloCards();
    missingDepth.starters.pop();
    expect(helloCardsSampleSchema.safeParse(missingDepth).success).toBe(false);
    const duplicateId = helloCards();
    duplicateId.starters[1]!.id = duplicateId.starters[0]!.id;
    expect(helloCardsSampleSchema.safeParse(duplicateId).success).toBe(false);
    const duplicateText = helloCards();
    duplicateText.starters[1]!.text = duplicateText.starters[0]!.text;
    expect(helloCardsSampleSchema.safeParse(duplicateText).success).toBe(false);
  });
  it('rejects links, missing question marks and extra fields', () => {
    const link = helloCards();
    link.starters[0]!.text = 'Visit https://example.com?';
    expect(helloCardsSampleSchema.safeParse(link).success).toBe(false);
    const notQuestion = helloCards();
    notQuestion.starters[0]!.text = 'not a question';
    expect(helloCardsSampleSchema.safeParse(notQuestion).success).toBe(false);
    expect(helloCardsSampleSchema.safeParse({ ...helloCards(), hidden: true }).success).toBe(false);
  });
});
