/** Pure batch parsing. Reads no files, writes no database rows and never invents missing question data. */
import { answerLetters, ITEM_COLUMNS, itemType, KEY_COLUMNS, type ItemType } from '../check-batch/check.ts';
import { CsvError, parseCsv, type CsvRow } from '../check-batch/csv.ts';

type ChoiceId = 'a' | 'b' | 'c' | 'd' | 'e';
export interface ImportItem {
  id: string;
  conceptId: string;
  type: ItemType;
  stem: string;
  choices: { id: ChoiceId; text: string }[];
  key: ChoiceId[];
  rationales: Partial<Record<ChoiceId, string>>;
  sourceIds: string[];
  version: 1;
}
export interface ImportProblem {
  file: 'passed.csv' | 'items.csv' | 'key.csv';
  /** CSV record number, including the header. Syntax errors use the CSV reader's reported line. */
  row: number;
  message: string;
}
export interface ParsedBatch { items: ImportItem[]; problems: ImportProblem[] }
export interface BatchFiles { itemsCsv: string; keyCsv: string }

const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;
const normalize = (value: string) => value.toLowerCase().replace(/\s+/gu, ' ').trim();

function itemFromRows(item: CsvRow, key: CsvRow, itemRow: number, keyRow: number, problems: ImportProblem[]): ImportItem | undefined {
  const before = problems.length;
  const itemProblem = (message: string) => problems.push({ file: 'items.csv', row: itemRow, message });
  const keyProblem = (message: string) => problems.push({ file: 'key.csv', row: keyRow, message });
  if (!ID.test(item.item_id ?? '')) itemProblem('use an item id of up to 64 letters, digits, dots, underscores or hyphens, starting with a letter or digit.');
  if (!ID.test(item.concept_id ?? '')) itemProblem('use a concept id of up to 64 letters, digits, dots, underscores or hyphens, starting with a letter or digit.');
  const type = itemType(item);
  if (type === null) itemProblem('choose single or sata for the question type.');
  if (!item.stem) itemProblem('fill in the stem.');
  if (!item.rationale) itemProblem('fill in the main rationale.');
  const choices: ImportItem['choices'] = [];
  const rationales: ImportItem['rationales'] = {};
  const offered: (typeof LETTERS[number])[] = [];
  const seen = new Set<string>();
  for (const letter of LETTERS) {
    const id = letter.toLowerCase() as ChoiceId;
    const text = item[`choice_${id}`] ?? '';
    if (letter === 'E' && !text) continue;
    if (!text) { itemProblem(`fill in choice ${id}.`); continue; }
    offered.push(letter);
    const normalized = normalize(text);
    if (seen.has(normalized)) itemProblem('give each choice different text, including when capitals or spacing change.');
    seen.add(normalized);
    const rationale = item[`rationale_${id}`];
    if (!rationale) itemProblem(`fill in the rationale for choice ${id}; the main rationale cannot replace it.`);
    else rationales[id] = rationale;
    choices.push({ id, text });
  }
  const answer = answerLetters(key.answer ?? '', offered);
  if ('problem' in answer) keyProblem('the key must name at least one offered choice, separated by semicolons, with no repeats or empty places.');
  else if (type === 'single' && answer.letters.length !== 1) keyProblem('a single-answer question needs exactly one choice in its key.');
  const sourceIds = (item.source_ids ?? '').split(';').map(value => value.trim());
  if (!sourceIds.length || sourceIds.some(value => !ID.test(value))) itemProblem('give at least one source id, separated by semicolons, with no empty places.');
  else if (new Set(sourceIds).size !== sourceIds.length) itemProblem('name each source id only once.');
  const factIds = (item.fact_ids ?? '').split(';').map(value => value.trim());
  if (!factIds.length || factIds.some(value => !ID.test(value))) itemProblem('give at least one fact id, separated by semicolons, with no empty places.');
  if (problems.length !== before || type === null || 'problem' in answer) return;
  return {
    id: item.item_id, conceptId: item.concept_id, type, stem: item.stem, choices,
    key: answer.letters.map(letter => letter.toLowerCase() as ChoiceId), rationales, sourceIds, version: 1,
  };
}

function readCsv(text: string, columns: readonly string[], file: ImportProblem['file'], problems: ImportProblem[]): CsvRow[] {
  try {
    return parseCsv(text, columns);
  } catch (error) {
    const message = error instanceof CsvError ? error.message : 'the file could not be read as CSV text.';
    const location = /^(?:line|row) (\d+):/.exec(message);
    problems.push({ file, row: location ? Number(location[1]) : 1, message });
    return [];
  }
}
interface IndexedRow { data: CsvRow; row: number }
function index(rows: CsvRow[]): Map<string, IndexedRow[]> {
  const byId = new Map<string, IndexedRow[]>();
  rows.forEach((data, position) => {
    const entries = byId.get(data.item_id) ?? [];
    entries.push({ data, row: position + 2 });
    byId.set(data.item_id, entries);
  });
  return byId;
}

/** passed.csv is an ID allowlist, never a source of question text or an answer key. */
export function parsePassed(passedCsv: string, batch?: BatchFiles): ParsedBatch {
  const result: ParsedBatch = { items: [], problems: [] };
  if (!batch || typeof batch.itemsCsv !== 'string' || typeof batch.keyCsv !== 'string') {
    result.problems.push({ file: 'passed.csv', row: 1, message: 'the original items.csv and key.csv texts are needed; passed.csv contains only ids.' });
    return result;
  }
  const passed = readCsv(passedCsv, ['item_id', 'concept_id'], 'passed.csv', result.problems);
  const items = readCsv(batch.itemsCsv, ITEM_COLUMNS, 'items.csv', result.problems);
  const keys = readCsv(batch.keyCsv, KEY_COLUMNS, 'key.csv', result.problems);
  if (result.problems.length) return result;
  const approved = index(passed);
  const itemIndex = index(items);
  const keyIndex = index(keys);
  passed.forEach((entry, position) => {
    const row = position + 2;
    const problem = (message: string) => result.problems.push({ file: 'passed.csv', row, message });
    if (!ID.test(entry.item_id) || !ID.test(entry.concept_id)) {
      problem('give both the item and concept a valid id: up to 64 letters, digits, dots, underscores or hyphens, starting with a letter or digit.');
      return;
    }
    if (approved.get(entry.item_id)!.length !== 1) { problem('this item id is listed more than once; list it only once.'); return; }
    const original = itemIndex.get(entry.item_id) ?? [];
    const key = keyIndex.get(entry.item_id) ?? [];
    if (original.length !== 1 || key.length !== 1) {
      if (!original.length) problem('this id has no matching row in items.csv.');
      else if (original.length > 1) problem('this id has more than one matching row in items.csv; the row is ambiguous.');
      if (!key.length) problem('this id has no matching row in key.csv.');
      else if (key.length > 1) problem('this id has more than one matching row in key.csv; the row is ambiguous.');
      return;
    }
    if (original[0].data.concept_id !== entry.concept_id) {
      problem(`the concept id must match items.csv row ${original[0].row}.`);
      return;
    }
    const parsed = itemFromRows(original[0].data, key[0].data, original[0].row, key[0].row, result.problems);
    if (parsed) result.items.push(parsed);
  });
  return result;
}
