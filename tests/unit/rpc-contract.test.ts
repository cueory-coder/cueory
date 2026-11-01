import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportCsv, exportJson, type ExportData } from '../../src/islands/exportdata';
import { checkReport } from '../../src/islands/flag';
import { flagArguments } from '../../src/islands/flagsubmit';
import { studentMessage } from '../../src/islands/rpcerrors';

const sql = [
  '20261101100000_attempts_and_check_answer.sql',
  '20261101120000_flags_and_submit_flag.sql',
].map(name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')).join('\n');

type FunctionName = 'submit_flag' | 'check_answer' | 'my_flags';

/** Read the actual declarations and dollar-quoted bodies, rather than copying their contracts into a fixture. */
function declaration(name: FunctionName) {
  const match = new RegExp(
    `create\\s+function\\s+public\\.${name}\\s*\\(([^)]*)\\)\\s*returns([\\s\\S]*?)as\\s*\\$\\$([\\s\\S]*?)\\$\\$;`, 'i',
  ).exec(sql);
  if (!match) throw new Error(`The SQL declaration for ${name} was not found; update the contract reader.`);
  const names = (text: string) => text.replace(/--[^\n]*/g, '').split(',')
    .map(part => part.trim().split(/\s+/)[0]!).filter(Boolean);
  const table = /\btable\s*\(([^)]*)\)/i.exec(match[2]!);
  const messages = [...match[3]!.matchAll(/\braise\s+exception\s+'((?:[^']|'')*)'/gi)]
    .map(message => message[1]!.replace(/''/g, "'"));
  if ([...match[3]!.matchAll(/\braise\s+exception\b/gi)].length !== messages.length) {
    throw new Error(`A nonliteral exception in ${name} needs an explicit contract check.`);
  }
  return { arguments: names(match[1]!), columns: table ? names(table[1]!) : [], messages: [...new Set(messages)] };
}

describe('SQL arguments and browser request helpers', () => {
  it('submit_flag names and argument order match the validated flagArguments result', () => {
    const checked = checkReport({ page: '/learn/sample', reason: 'typo', comment: 'sample report' });
    const result = flagArguments(checked, { page: '/learn/sample' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(Object.keys(result.args)).toEqual(declaration('submit_flag').arguments);
    expect(result.args).toMatchObject({ item_id: null, item_version_id: null });
  });

  it('my_flags takes no arguments', () => {
    expect(declaration('my_flags').arguments).toEqual([]);
  });

  it.todo('check_answer needs a version-aware caller sending item_id, version_id and picked (Task 49)');
});

describe('every explicit SQL refusal has a student message', () => {
  for (const name of ['check_answer', 'submit_flag', 'my_flags'] as const) {
    const messages = declaration(name).messages;
    if (name !== 'my_flags') {
      it(`${name} exposes refusals for this contract check to cover`, () => {
        expect(messages.length).toBeGreaterThan(0);
      });
    }
    for (const message of messages) {
      it(`${name}: ${message}`, () => {
        // SQL can gain a refusal before the browser's function-name union does. Such a change must fail this test.
        const fn = name as Parameters<typeof studentMessage>[0];
        const fallback = studentMessage(fn, { message: 'sample: an unmapped database refusal' });
        const mapped = studentMessage(fn, { message });
        expect(mapped, `Add a studentMessage mapping for ${name}: ${message}`).not.toBe(fallback);
        expect(mapped.trim()).not.toBe('');
      });
    }
    if (name === 'my_flags') {
      it('reads the my_flags body even when it currently has no explicit refusals', () => {
        expect(declaration(name).columns.length).toBeGreaterThan(0);
      });
    }
  }
});

describe('my_flags and the exported reports contract', () => {
  it('exports exactly the returned report columns in JSON and CSV using the export’s camel-case field names', () => {
    const report: NonNullable<ExportData['reports']>[number] = {
      id: '00000000-0000-4000-8000-000000000001', page: '/learn/sample',
      itemId: null, itemVersionId: null, reason: 'typo', comment: null, createdAt: '2026-11-01T00:00:00.000Z',
    };
    const expected = declaration('my_flags').columns.map(name => name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()));
    expect(expected.length).toBeGreaterThan(0);
    const data: ExportData = { reports: [report] };
    const json = JSON.parse(exportJson(data, '2026-11-01'));
    expect(json.reports).toEqual([report]);
    expect(Object.keys(json.reports[0])).toEqual(expected);
    const csv = exportCsv(data).find(file => file.fileName === 'reports.csv');
    expect(csv).toBeDefined();
    expect(csv!.text.split('\r\n')[0]!.split(',')).toEqual(expected);
  });
});
