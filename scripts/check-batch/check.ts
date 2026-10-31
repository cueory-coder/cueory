/**
 * Batch checker logic (Roadmap Task 3). Pure functions only: no files, no network, so every rule is unit tested.
 * Batch format: docs/BATCHES.md.
 */
import type { CsvRow } from './csv.ts';

export const ITEM_COLUMNS = [
  'item_id',
  'concept_id',
  'stem',
  'choice_a',
  'choice_b',
  'choice_c',
  'choice_d',
  'rationale',
  'fact_ids',
  'source_ids',
] as const;
export const KEY_COLUMNS = ['item_id', 'answer'] as const;
export const REVIEWER_COLUMNS = ['item_id', 'answer', 'verdict'] as const;
export const FACT_COLUMNS = ['fact_id', 'source_id'] as const;
export const SOURCE_COLUMNS = ['source_id', 'url'] as const;

/** Every batch needs at least this many independent reviewer files. */
export const MIN_REVIEWERS = 5;
/** Answer balance: warn when a letter's share of correct answers is this many percentage points off an even share. */
export const BALANCE_TOLERANCE_POINTS = 10;
/** Answer balance is only judged on batches at least this big; smaller ones are too noisy to mean anything. */
export const BALANCE_MIN_ITEMS = 20;

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;
type Letter = (typeof LETTERS)[number];
const VERDICTS = new Set(['pass', 'fail', 'pending']);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
/** The reviewers Task 2's admin screen has a column for. A file with any other name is a typo until proven otherwise. */
export const REVIEWER_ROSTER = [
  'claude_final',
  'claude_sonnet',
  'christian',
  'codex',
  'gemini',
  'gpt1',
  'gpt2',
  'gpt3',
] as const;

export interface BatchInput {
  items: CsvRow[];
  key: CsvRow[];
  /** Reviewer name (from the file name) → that reviewer's rows. */
  reviewers: Record<string, CsvRow[]>;
  facts: CsvRow[];
  sources: CsvRow[];
}

export interface ItemResult {
  item_id: string;
  concept_id: string;
  /** What is wrong. Any entry here means the item failed. */
  reasons: string[];
  /** Reviews that haven't come in yet. With no `reasons`, the item is pending: neither passed nor failed. */
  waiting: string[];
}

export interface BatchResult {
  /** Problems with the batch as a whole. Any error here fails every item. */
  batchErrors: string[];
  warnings: string[];
  passed: ItemResult[];
  failed: ItemResult[];
  /** Nothing is wrong, but some reviewer's verdict is still `pending`. A pending item never passes. */
  pending: ItemResult[];
  /** Correct-answer count per letter, over items that have a usable key. */
  balance: Partial<Record<Letter, number>>;
  /** Reviewer → items where their answer matched the key / items they answered. */
  agreement: Record<string, { matched: number; answered: number }>;
}

const list = (cell: string | undefined): string[] =>
  (cell ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s !== '');

const normalize = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim();

/** Letters this item offers: A–D always, E only when the batch has a `choice_e` column and this item fills it. */
function choiceLetters(item: CsvRow): Letter[] {
  return LETTERS.filter((l) => l !== 'E' || (item.choice_e ?? '') !== '');
}

/**
 * Offline link check: an https address with a host and no user name or password in it. It does not prove the page
 * exists; `--check-links` does that (see check_batch.ts).
 */
export function linkProblem(url: string): string | null {
  if (url === '') return 'has no url';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `url "${url}" is not a valid address`;
  }
  if (parsed.protocol !== 'https:') return `url "${url}" must start with https://`;
  if (parsed.hostname === '' || !parsed.hostname.includes('.')) return `url "${url}" has no proper site name`;
  if (parsed.username !== '' || parsed.password !== '') return `url "${url}" must not contain a user name or password`;
  return null;
}

/** Indexes rows by an id column, recording blank, malformed and duplicate ids as batch errors. */
function index(rows: CsvRow[], column: string, file: string, errors: string[]): Map<string, CsvRow> {
  const map = new Map<string, CsvRow>();
  rows.forEach((row, i) => {
    const id = row[column] ?? '';
    if (!ID.test(id)) {
      errors.push(`${file} row ${i + 2}: ${column} "${id}" is blank or uses characters other than letters, digits, . _ -`);
    } else if (map.has(id)) {
      errors.push(`${file}: ${column} "${id}" appears more than once`);
    } else {
      map.set(id, row);
    }
  });
  return map;
}

export function checkBatch(input: BatchInput): BatchResult {
  const batchErrors: string[] = [];
  const warnings: string[] = [];

  const reviewerNames = Object.keys(input.reviewers).sort();
  for (const name of reviewerNames) {
    if (!(REVIEWER_ROSTER as readonly string[]).includes(name)) {
      batchErrors.push(
        `reviewer file "${name}.csv": not a known reviewer (expected one of ${REVIEWER_ROSTER.join(', ')}); check for a typo`,
      );
    }
  }
  if (reviewerNames.length < MIN_REVIEWERS) {
    batchErrors.push(`found ${reviewerNames.length} reviewer file(s); at least ${MIN_REVIEWERS} are required`);
  }
  if (input.items.length === 0) batchErrors.push('items.csv has no items');

  const items = index(input.items, 'item_id', 'items.csv', batchErrors);
  const key = index(input.key, 'item_id', 'key.csv', batchErrors);
  const facts = index(input.facts, 'fact_id', 'facts.csv', batchErrors);
  const sources = index(input.sources, 'source_id', 'sources.csv', batchErrors);
  const reviews = new Map(
    reviewerNames.map((name) => [name, index(input.reviewers[name] ?? [], 'item_id', `reviewers/${name}.csv`, batchErrors)]),
  );

  // Rows that point at items the batch doesn't have.
  for (const id of key.keys()) if (!items.has(id)) batchErrors.push(`key.csv has an answer for unknown item "${id}"`);
  for (const [name, rows] of reviews) {
    for (const id of rows.keys()) {
      if (!items.has(id)) batchErrors.push(`reviewers/${name}.csv reviews unknown item "${id}"`);
    }
  }

  // Sources and facts are checked once; items that cite a broken one fail.
  const badSources = new Map<string, string>();
  for (const [id, source] of sources) {
    const problem = linkProblem(source.url ?? '');
    if (problem) badSources.set(id, `source "${id}" ${problem}`);
  }
  const badFacts = new Map<string, string>();
  for (const [id, fact] of facts) {
    const src = fact.source_id ?? '';
    if (!sources.has(src)) badFacts.set(id, `fact "${id}" cites unknown source "${src}"`);
    else if (badSources.has(src)) badFacts.set(id, `fact "${id}" cites a broken source: ${badSources.get(src)}`);
  }

  // Duplicate stems across the batch (ignoring case and spacing).
  const stemOwners = new Map<string, string[]>();
  for (const [id, item] of items) {
    const stem = normalize(item.stem ?? '');
    if (stem !== '') stemOwners.set(stem, [...(stemOwners.get(stem) ?? []), id]);
  }

  const balance: Partial<Record<Letter, number>> = {};
  const agreement: BatchResult['agreement'] = Object.fromEntries(
    reviewerNames.map((n) => [n, { matched: 0, answered: 0 }]),
  );
  const results: ItemResult[] = [];

  for (const [id, item] of items) {
    const reasons: string[] = [];
    const waiting: string[] = [];
    const letters = choiceLetters(item);

    if (!ID.test(item.concept_id ?? '')) reasons.push('concept_id is blank or malformed');
    if ((item.stem ?? '') === '') reasons.push('the question (stem) is empty');
    if ((item.rationale ?? '') === '') reasons.push('the rationale is missing');

    const seenChoices = new Map<string, Letter>();
    for (const l of letters) {
      const text = normalize(item[`choice_${l.toLowerCase()}`] ?? '');
      if (text === '') {
        reasons.push(`choice ${l} is empty`);
        continue;
      }
      const twin = seenChoices.get(text);
      if (twin) reasons.push(`choices ${twin} and ${l} are the same`);
      else seenChoices.set(text, l);
    }

    const sameStem = (stemOwners.get(normalize(item.stem ?? '')) ?? []).filter((other) => other !== id);
    if (sameStem.length > 0) reasons.push(`same question as ${sameStem.join(', ')}`);

    const factIds = list(item.fact_ids);
    if (factIds.length === 0) reasons.push('cites no fact ids');
    for (const f of factIds) {
      if (!facts.has(f)) reasons.push(`unknown fact id "${f}"`);
      else if (badFacts.has(f)) reasons.push(badFacts.get(f) as string);
    }
    const sourceIds = list(item.source_ids);
    if (sourceIds.length === 0) reasons.push('cites no sources');
    for (const s of sourceIds) {
      if (!sources.has(s)) reasons.push(`unknown source id "${s}"`);
      else if (badSources.has(s)) reasons.push(badSources.get(s) as string);
    }

    const answer = (key.get(id)?.answer ?? '').toUpperCase();
    const keyed = (letters as string[]).includes(answer);
    if (answer === '') reasons.push('has no answer in key.csv');
    else if (!keyed) reasons.push(`key answer "${answer}" is not one of the choices (${letters.join(', ')})`);
    if (keyed) balance[answer as Letter] = (balance[answer as Letter] ?? 0) + 1;

    for (const [name, rows] of reviews) {
      const review = rows.get(id);
      if (!review) {
        reasons.push(`${name}: no review`);
        continue;
      }
      const given = (review.answer ?? '').toUpperCase();
      const verdict = (review.verdict ?? '').toLowerCase();
      if (!(letters as string[]).includes(given)) {
        reasons.push(`${name}: answer "${review.answer ?? ''}" is not one of the choices`);
      } else {
        agreement[name]!.answered += 1;
        if (keyed && given === answer) agreement[name]!.matched += 1;
        else if (keyed) reasons.push(`${name}: answered ${given}, key says ${answer}`);
      }
      if (!VERDICTS.has(verdict)) reasons.push(`${name}: verdict "${review.verdict ?? ''}" must be pass, fail or pending`);
      else if (verdict === 'fail') reasons.push(`${name}: marked it fail`);
      else if (verdict === 'pending') waiting.push(`${name}: review still pending`);
    }

    results.push({ item_id: id, concept_id: item.concept_id ?? '', reasons, waiting });
  }

  const keyedTotal = Object.values(balance).reduce((a, b) => a + b, 0);
  if (keyedTotal >= BALANCE_MIN_ITEMS) {
    // Every item offers A–D; E counts only if some item offers it.
    const offered = LETTERS.filter((l) => l !== 'E' || [...items.values()].some((it) => (it.choice_e ?? '') !== ''));
    const even = 100 / offered.length;
    for (const l of offered) {
      const share = ((balance[l] ?? 0) / keyedTotal) * 100;
      if (Math.abs(share - even) > BALANCE_TOLERANCE_POINTS) {
        warnings.push(
          `answer balance: ${l} is correct in ${share.toFixed(0)}% of items (an even share is ${even.toFixed(0)}%)`,
        );
      }
    }
  } else if (keyedTotal > 0) {
    warnings.push(`answer balance not judged: fewer than ${BALANCE_MIN_ITEMS} keyed items`);
  }

  if (batchErrors.length > 0) {
    for (const r of results) r.reasons.unshift('the batch has errors (see report)');
  }
  return {
    batchErrors,
    warnings,
    passed: results.filter((r) => r.reasons.length === 0 && r.waiting.length === 0),
    failed: results.filter((r) => r.reasons.length > 0),
    pending: results.filter((r) => r.reasons.length === 0 && r.waiting.length > 0),
    balance,
    agreement,
  };
}
