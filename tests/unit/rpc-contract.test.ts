import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { checkAnswer, type AnswerTransport } from '../../src/islands/checkanswer';
import { exportCsv, exportJson, type ExportData } from '../../src/islands/exportdata';
import { checkReport } from '../../src/islands/flag';
import { flagArguments } from '../../src/islands/flagsubmit';
import { studentMessage } from '../../src/islands/rpcerrors';

const sql = [
  '20261101100000_attempts_and_check_answer.sql',
  '20261101120000_flags_and_submit_flag.sql',
  '20261102100000_study_events.sql',
  '20261102110000_delete_my_account.sql',
  // Task 169 redefines check_answer, submit_flag and record_study_events; the last definition is the live one.
  '20261102120000_confirmed_accounts_only.sql',
].map(name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')).join('\n');

type FunctionName = 'submit_flag' | 'check_answer' | 'my_flags' | 'record_study_events' | 'delete_my_account';

/** Read the actual declarations and dollar-quoted bodies, rather than copying their contracts into a fixture. */
function declaration(name: FunctionName) {
  const match = [...sql.matchAll(new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(([^)]*)\\)\\s*returns([\\s\\S]*?)as\\s*\\$\\$([\\s\\S]*?)\\$\\$;`, 'gi',
  ))].at(-1);
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

  it('the version-aware checkAnswer transport matches the SQL argument names and order', async () => {
    const version = { item_id: '00000000-0000-4000-8000-000000000001', id: '00000000-0000-4000-8000-000000000002' };
    const rpc = vi.fn<AnswerTransport['rpc']>(async () => ({
      data: { correct: false, key: ['b'], rationales: { b: 'sample rationale' }, version_id: version.id }, error: null,
    }));
    const result = await checkAnswer({ rpc }, version, ['c', 'a']);
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledOnce();
    const [name, args] = rpc.mock.calls[0]!;
    expect(name).toBe('check_answer');
    expect(Object.keys(args)).toEqual(declaration('check_answer').arguments);
    expect(args).toEqual({ item_id: version.item_id, version_id: version.id, picked: ['a', 'c'] });
  });
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

describe('record_study_events contract (Task 140)', () => {
  const studyEventsSql = readFileSync(
    new URL('../../supabase/migrations/20261102100000_study_events.sql', import.meta.url), 'utf8',
  );
  const body = /create\s+function\s+public\.record_study_events[\s\S]*?as\s*\$\$([\s\S]*?)\$\$;/i.exec(studyEventsSql)![1]!;

  it('takes one jsonb argument named events and returns the number stored', () => {
    expect(declaration('record_study_events').arguments).toEqual(['events']);
    expect(studyEventsSql).toMatch(/create\s+function\s+public\.record_study_events\(events jsonb\)\s+returns integer\s/i);
  });

  it('raises exactly these literal refusals, which the Task 146 recorder handles', () => {
    // A change here is a contract change for the browser recorder: update it in the same pull request.
    expect(declaration('record_study_events').messages).toEqual([
      'sign in to record study activity',
      'confirm your email to use this',
      'send between 1 and 50 study events',
      'a study event has the wrong shape',
      'a study event time must be between 7 days ago and 5 minutes from now',
      'a study event names a question that was not found',
      'too many study events recorded recently; try again later',
    ]);
  });

  it('accepts exactly the agreed event keys, kinds and marks', () => {
    const list = (pattern: RegExp) => [...pattern.exec(body)![1]!.matchAll(/'([^']*)'/g)].map(m => m[1]);
    expect(list(/k\s*<>\s*all\s*\(array\[([^\]]*)\]\)/i).sort())
      .toEqual(['at', 'item_id', 'kind', 'mark', 'ms_on_item', 'version_id']);
    expect(list(/'kind'\)\s*<>\s*all\s*\(array\[([^\]]*)\]\)/i)).toEqual(['answered', 'marked', 'skipped']);
    expect(list(/'mark'\)\s*<>\s*all\s*\(array\[([^\]]*)\]\)/i)).toEqual(['know', 'learning']);
    expect(body).toMatch(/> 1800000/);
    expect(body).toMatch(/n_events < 1 or n_events > 50/);
  });

  it('is signed-in only, security definer with an empty search_path, and writes as the caller', () => {
    expect(studyEventsSql).toMatch(/returns integer\s+language plpgsql\s+security definer\s+set search_path = ''/i);
    expect(studyEventsSql).toContain('revoke execute on function public.record_study_events(jsonb) from public, anon, authenticated;');
    expect(studyEventsSql).toContain('grant execute on function public.record_study_events(jsonb) to authenticated;');
    expect(body).toMatch(/select uid, \(e ->> 'item_id'\)::uuid/);
  });

  it('gives students only select on their own rows, which the export loader reads', () => {
    expect(studyEventsSql).toContain('grant select on table public.study_events to authenticated;');
    expect(studyEventsSql).not.toMatch(/grant\s+(insert|update|delete)[^;]*to\s+authenticated/i);
    expect(studyEventsSql).toContain('alter table public.study_events enable row level security;');
    expect(studyEventsSql).toMatch(/for select\s+to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/);
    // Every column the export loader selects exists in the table.
    const table = /create table public\.study_events \(([\s\S]*?)\n\);/.exec(studyEventsSql)![1]!;
    for (const column of 'id,item_id,item_version_id,kind,ms_on_item,mark,at,created_at'.split(',')) {
      expect(table).toMatch(new RegExp(`^\\s+${column} `, 'm'));
    }
    expect(table).toMatch(/user_id uuid not null references auth\.users \(id\) on delete cascade/);
  });
});

describe('delete_my_account contract (Task 60)', () => {
  const deleteSql = readFileSync(
    new URL('../../supabase/migrations/20261102110000_delete_my_account.sql', import.meta.url), 'utf8',
  );

  it('takes no arguments and returns nothing, so the browser calls supabase.rpc(\'delete_my_account\')', () => {
    expect(declaration('delete_my_account').arguments).toEqual([]);
    expect(deleteSql).toMatch(/create\s+function\s+public\.delete_my_account\(\)\s+returns void\s/i);
  });

  it('raises exactly this literal refusal, which the account page handles', () => {
    // A change here is a contract change for the /account page: update it in the same pull request.
    expect(declaration('delete_my_account').messages).toEqual(['sign in to delete your account']);
  });

  it('is signed-in only and security definer with an empty search_path', () => {
    expect(deleteSql).toMatch(/returns void\s+language plpgsql\s+security definer\s+set search_path = ''/i);
    expect(deleteSql).toContain('revoke execute on function public.delete_my_account() from public, anon, authenticated;');
    expect(deleteSql).toContain('grant execute on function public.delete_my_account() to authenticated;');
    expect(deleteSql).not.toMatch(/grant\s+execute[^;]*to\s+(anon|public)\b/i);
  });
});
