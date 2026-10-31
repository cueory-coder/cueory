/**
 * Small, strict CSV reader and writer (RFC 4180: commas, double-quoted fields, "" for a quote inside quotes,
 * CRLF or LF line endings). Strict on purpose: a malformed file stops the checker instead of being half-read.
 */

export type CsvRow = Record<string, string>;

export class CsvError extends Error {}

/** Splits CSV text into rows of raw fields. Throws CsvError on malformed quoting. */
export function parseRows(text: string): string[][] {
  const src = text.startsWith('﻿') ? text.slice(1) : text; // spreadsheet apps add a byte-order mark
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let i = 0;

  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        const next = src[i];
        if (next !== undefined && next !== ',' && next !== '\n' && next !== '\r') {
          throw new CsvError(`line ${line}: unexpected text after a closing quote`);
        }
        continue;
      }
      if (c === '\n') line += 1;
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      if (field !== '') throw new CsvError(`line ${line}: a quote can only start a field`);
      quoted = true;
      i += 1;
    } else if (c === ',') {
      row.push(field);
      field = '';
      i += 1;
    } else if (c === '\r' || c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += c === '\r' && src[i + 1] === '\n' ? 2 : 1;
      line += 1;
    } else {
      field += c;
      i += 1;
    }
  }
  if (quoted) throw new CsvError(`line ${line}: a quoted field is never closed`);
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Ignore fully blank lines (often left at the end of a file by spreadsheet apps).
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/**
 * Reads CSV text with a header row. Every row must have exactly as many fields as the header, header names must be
 * unique, and every name in `required` must be present. Values are trimmed.
 */
export function parseCsv(text: string, required: readonly string[] = []): CsvRow[] {
  const [header, ...body] = parseRows(text);
  if (!header) throw new CsvError('the file is empty (it needs a header row)');
  const names = header.map((h) => h.trim());
  const seen = new Set<string>();
  for (const n of names) {
    if (n === '') throw new CsvError('the header row has an empty column name');
    if (seen.has(n)) throw new CsvError(`the header row lists "${n}" twice`);
    seen.add(n);
  }
  const missing = required.filter((r) => !seen.has(r));
  if (missing.length > 0) throw new CsvError(`missing column(s): ${missing.join(', ')}`);

  return body.map((fields, index) => {
    if (fields.length !== names.length) {
      throw new CsvError(`row ${index + 2}: has ${fields.length} fields, the header has ${names.length}`);
    }
    const out: CsvRow = {};
    names.forEach((n, j) => {
      out[n] = (fields[j] ?? '').trim();
    });
    return out;
  });
}

function quote(raw: string): string {
  // A cell starting with = + - @ (or a tab / carriage return) can run as a formula when the file is opened in a
  // spreadsheet app. A leading apostrophe makes the app show it as plain text (OWASP "CSV injection" advice).
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Writes rows as CSV with the given column order and LF line endings. Cells are made safe to open in a spreadsheet. */
export function toCsv(columns: readonly string[], rows: readonly CsvRow[]): string {
  const lines = [columns.map(quote).join(',')];
  for (const r of rows) lines.push(columns.map((c) => quote(r[c] ?? '')).join(','));
  return `${lines.join('\n')}\n`;
}
