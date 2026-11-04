import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkGuard, formatReport, judge, LIMITS, run, STAGING_FLAG } from '../../scripts/ratelimit-check.mjs';

const REF = 'abcdefghijklmnopqrst';
const PROD = 'zyxwvutsrqponmlkjihg';
const KEY = 'sb_publishable_test-only-not-a-real-key';
const PASSWORD = 'not-a-real-password-123';

function env(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    SUPABASE_URL: `https://${REF}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: KEY,
    CUEORY_STAGING_PROJECT_REF: REF,
    CUEORY_PROD_PROJECT_REF: PROD,
    RATELIMIT_EMAIL: 'test@example.com',
    RATELIMIT_PASSWORD: PASSWORD,
    RATELIMIT_ITEM_ID: '00000000-0000-4000-8000-0000000000e1',
    RATELIMIT_VERSION_ID: '00000000-0000-4000-8000-0000000000f1',
    RATELIMIT_CHOICE: 'a',
    ...overrides,
  };
}

describe('the staging-only guard', () => {
  it('runs only with the flag, the staging ref and the exact staging address', () => {
    expect(checkGuard([STAGING_FLAG], env())).toEqual({ ok: true, url: `https://${REF}.supabase.co`, ref: REF });
  });

  it('refuses without --i-am-on-staging', () => {
    expect(checkGuard([], env()).ok).toBe(false);
    expect(checkGuard(['--i-am-on-staging=yes'], env()).ok).toBe(false);
  });

  it('refuses without a well-formed staging ref', () => {
    expect(checkGuard([STAGING_FLAG], env({ CUEORY_STAGING_PROJECT_REF: undefined })).ok).toBe(false);
    expect(checkGuard([STAGING_FLAG], env({ CUEORY_STAGING_PROJECT_REF: 'short' })).ok).toBe(false);
  });

  it('refuses any address that is not exactly the staging project', () => {
    for (const url of [
      `https://${PROD}.supabase.co`,
      `https://${REF}.supabase.co/`,
      `http://${REF}.supabase.co`,
      `https://${REF}.supabase.co.evil.example`,
      `https://evil.example/${REF}.supabase.co`,
      undefined,
    ]) {
      expect(checkGuard([STAGING_FLAG], env({ SUPABASE_URL: url })).ok, String(url)).toBe(false);
    }
  });

  it('refuses when the staging ref is the prod ref, even with the flag and a matching address', () => {
    const result = checkGuard([STAGING_FLAG], env({ CUEORY_STAGING_PROJECT_REF: PROD, SUPABASE_URL: `https://${PROD}.supabase.co` }));
    expect(result.ok).toBe(false);
  });

  it('refuses a secret or legacy key', () => {
    expect(checkGuard([STAGING_FLAG], env({ SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).ok).toBe(false);
    expect(checkGuard([STAGING_FLAG], env({ SUPABASE_PUBLISHABLE_KEY: ['eyJhbGciOiJIUzI1NiJ9', 'x', 'y'].join('.') })).ok).toBe(false);
  });

  it('refuses when a test-account or question setting is missing', () => {
    for (const name of ['RATELIMIT_EMAIL', 'RATELIMIT_PASSWORD', 'RATELIMIT_ITEM_ID', 'RATELIMIT_VERSION_ID', 'RATELIMIT_CHOICE']) {
      expect(checkGuard([STAGING_FLAG], env({ [name]: '' })).ok, name).toBe(false);
    }
  });

  it('never puts the key or password in a refusal', () => {
    const reasons = [
      checkGuard([], env()),
      checkGuard([STAGING_FLAG], env({ SUPABASE_URL: 'https://elsewhere.example' })),
      checkGuard([STAGING_FLAG], env({ SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })),
    ].map((result) => (result.ok ? '' : result.reason));
    for (const reason of reasons) {
      expect(reason).not.toContain(KEY);
      expect(reason).not.toContain(PASSWORD);
      expect(reason).not.toContain('sb_secret_abc');
    }
  });

  it('run() stops at the guard before loading anything or calling the network', async () => {
    const lines: string[] = [];
    expect(await run([], env(), (line: string) => lines.push(line))).toBe(2);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(STAGING_FLAG);
  });
});

describe('the limits it checks are the ones the migrations state', () => {
  it.each([
    ['check_answer', 'supabase/migrations/20261101100000_attempts_and_check_answer.sql', 'hourly_limit constant integer := 200;'],
    ['submit_flag', 'supabase/migrations/20261101120000_flags_and_submit_flag.sql', 'hourly_limit constant integer := 5;'],
    ['record_study_events', 'supabase/migrations/20261102100000_study_events.sql', 'hourly_limit constant integer := 600;'],
  ] as const)('%s', (fn, file, constant) => {
    const sql = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    expect(sql).toContain(constant);
    expect(sql).toContain(`raise exception '${LIMITS[fn].refused}' using errcode = '54000'`);
  });

  it('update_display_name (PR #230, not merged here) is listed with its own refusal', () => {
    expect(LIMITS.update_display_name.expectRefusalAt).toBe(11);
    expect(LIMITS.update_display_name.refused).toBe('that is a lot of name changes; please try again later');
  });
});

const okCalls = (n: number) => Array.from({ length: n }, (_unused, i) => ({ ok: true, ms: i * 10 }));
const refusal = (fn: keyof typeof LIMITS, ms: number) => ({ ok: false, code: LIMITS[fn].code, message: LIMITS[fn].refused, ms });

describe('judge', () => {
  it('matches when the first refusal is the call right after the limit', () => {
    const result = judge('submit_flag', [...okCalls(5), refusal('submit_flag', 1234)]);
    expect(result).toMatchObject({ verdict: 'matches', refusedAt: 6, afterMs: 1234, expected: 6 });
  });

  it('says early or late when the refusal comes at another call', () => {
    expect(judge('submit_flag', [...okCalls(3), refusal('submit_flag', 30)]).verdict).toBe('refused-early');
    expect(judge('submit_flag', [...okCalls(7), refusal('submit_flag', 70)]).verdict).toBe('refused-late');
  });

  it('says never when no call was refused', () => {
    expect(judge('check_answer', okCalls(230))).toMatchObject({ verdict: 'never-refused', calls: 230 });
  });

  it('does not count a different error as the limit', () => {
    const result = judge('update_display_name', [{ ok: false, code: 'PGRST202', message: 'Could not find the function', ms: 5 }]);
    expect(result).toMatchObject({ verdict: 'other-error', refusedAt: 1, code: 'PGRST202' });
  });

  it('needs the exact message and code', () => {
    const wrongCode = { ...refusal('check_answer', 9), code: '22023' };
    expect(judge('check_answer', [...okCalls(200), wrongCode]).verdict).toBe('other-error');
  });

  it('knows only the four functions', () => {
    expect(() => judge('nope' as keyof typeof LIMITS, [])).toThrow();
  });
});

describe('formatReport', () => {
  it('gives one line per function and an overall line', () => {
    const report = formatReport([
      judge('submit_flag', [...okCalls(5), refusal('submit_flag', 2500)]),
      judge('check_answer', okCalls(230)),
    ]);
    const lines = report.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      'submit_flag: refused at call 6 after 2.5 s; expected the first refusal at call 6 (5 reports an hour, 20 a day, per account; ' +
      'supabase/migrations/20261101120000_flags_and_submit_flag.sql): matches the migration.',
    );
    expect(lines[1]).toContain('check_answer: 230 calls, no refusal');
    expect(lines[1]).toContain('NEVER refused');
    expect(lines[2]).toBe('1 of 2 limits need a look.');
  });

  it('says so when everything matches', () => {
    expect(formatReport([judge('submit_flag', [...okCalls(5), refusal('submit_flag', 1)])]).split('\n').at(-1))
      .toBe('all limits match the migrations.');
  });
});
