#!/usr/bin/env node
// Rate-limit check for cueory-STAGING only (Task 302 follow-up).
//
// Signs in with a test account and calls check_answer, submit_flag, record_study_events and update_display_name past
// their limits, then reports, for each one, after how many calls (and how long) the limit refused, against what the
// migrations say. It never runs against cueory-prod, and it keeps no credentials: everything comes from environment
// variables for this one run, and no key, password or token is ever printed.
//
// Hard guard: it refuses to start unless `--i-am-on-staging` is passed AND SUPABASE_URL is exactly
// https://<CUEORY_STAGING_PROJECT_REF>.supabase.co (and, if CUEORY_PROD_PROJECT_REF is set, that ref isn't prod's).
//
// Environment (all required unless marked optional):
//   SUPABASE_URL                     the staging project address
//   SUPABASE_PUBLISHABLE_KEY         staging's sb_publishable_ key (secret and legacy JWT keys are refused)
//   CUEORY_STAGING_PROJECT_REF       staging's 20-character project ref
//   CUEORY_PROD_PROJECT_REF          optional: prod's ref, refused if it matches
//   RATELIMIT_EMAIL, RATELIMIT_PASSWORD   a throwaway, email-confirmed test account on staging
//   RATELIMIT_ITEM_ID, RATELIMIT_VERSION_ID, RATELIMIT_CHOICE   one published single-answer question on staging
//
// Use a fresh test account: the limits count the account's own rows (attempts, flags, study events, name changes),
// so anything it did in the last hour or day makes a limit refuse sooner. The run leaves those rows behind (about 200
// attempts, 5 reports, 600 study events, 10 name changes); delete the test account from /account afterwards.
//
// Calls use supabase-js (https://supabase.com/docs/reference/javascript/auth-signinwithpassword and
// https://supabase.com/docs/reference/javascript/rpc).

import { pathToFileURL } from 'node:url';

export const STAGING_FLAG = '--i-am-on-staging';

/**
 * The limits as the migrations state them. `refused` is the message each function raises, word for word, and
 * `expectRefusalAt` the call that should be the first one refused when the account starts with nothing counted.
 */
export const LIMITS = {
  check_answer: {
    source: 'supabase/migrations/20261101100000_attempts_and_check_answer.sql',
    rule: '200 checks an hour per account',
    refused: 'too many answers checked this hour; try again later',
    code: '54000',
    expectRefusalAt: 201,
    maxCalls: 230,
  },
  submit_flag: {
    source: 'supabase/migrations/20261101120000_flags_and_submit_flag.sql',
    rule: '5 reports an hour, 20 a day, per account',
    refused: 'that is a lot of reports; please try again later',
    code: '54000',
    expectRefusalAt: 6,
    maxCalls: 10,
  },
  record_study_events: {
    source: 'supabase/migrations/20261102100000_study_events.sql',
    rule: '600 events an hour, 2,000 a day, per account; batches of 50, so the 13th batch passes 600',
    refused: 'too many study events recorded recently; try again later',
    code: '54000',
    expectRefusalAt: 13,
    maxCalls: 16,
  },
  update_display_name: {
    source: 'supabase/migrations/20261102140000_update_display_name.sql (PR #230)',
    rule: '10 name changes an hour per account',
    refused: 'that is a lot of name changes; please try again later',
    code: '54000',
    expectRefusalAt: 11,
    maxCalls: 14,
  },
};

const REF = /^[a-z0-9]{20}$/;

/**
 * Decides whether the check may run. Returns { ok: true, url, ref } or { ok: false, reason }. The reason never
 * contains a key or password.
 */
export function checkGuard(argv, env) {
  const args = Array.isArray(argv) ? argv : [];
  if (!args.includes(STAGING_FLAG)) return { ok: false, reason: `refusing to run: pass ${STAGING_FLAG} to confirm this is cueory-staging.` };
  const ref = env?.CUEORY_STAGING_PROJECT_REF;
  if (typeof ref !== 'string' || !REF.test(ref)) {
    return { ok: false, reason: 'refusing to run: set CUEORY_STAGING_PROJECT_REF to staging\'s 20-character project ref.' };
  }
  const prodRef = env?.CUEORY_PROD_PROJECT_REF;
  if (typeof prodRef === 'string' && prodRef !== '' && prodRef === ref) {
    return { ok: false, reason: 'refusing to run: the staging ref is the same as CUEORY_PROD_PROJECT_REF.' };
  }
  const url = env?.SUPABASE_URL;
  if (url !== `https://${ref}.supabase.co`) {
    return { ok: false, reason: 'refusing to run: SUPABASE_URL is not exactly https://<CUEORY_STAGING_PROJECT_REF>.supabase.co.' };
  }
  const key = env?.SUPABASE_PUBLISHABLE_KEY;
  if (typeof key !== 'string' || !key.startsWith('sb_publishable_')) {
    return { ok: false, reason: 'refusing to run: SUPABASE_PUBLISHABLE_KEY must be the staging publishable key (sb_publishable_...), never a secret key.' };
  }
  for (const name of ['RATELIMIT_EMAIL', 'RATELIMIT_PASSWORD', 'RATELIMIT_ITEM_ID', 'RATELIMIT_VERSION_ID', 'RATELIMIT_CHOICE']) {
    if (typeof env?.[name] !== 'string' || env[name] === '') return { ok: false, reason: `refusing to run: set ${name}.` };
  }
  return { ok: true, url, ref };
}

/**
 * Turns one function's run into a verdict. `calls` is the list of results in order: { ok: true } or
 * { ok: false, code, message }, each with `ms` since the first call.
 */
export function judge(fn, calls) {
  const limit = LIMITS[fn];
  if (!limit) throw new Error(`no limit is known for ${fn}`);
  const list = Array.isArray(calls) ? calls : [];
  const index = list.findIndex(call => !call.ok);
  if (index === -1) {
    return { fn, verdict: 'never-refused', calls: list.length, expected: limit.expectRefusalAt, rule: limit.rule, source: limit.source };
  }
  const first = list[index];
  const at = index + 1;
  const base = { fn, calls: list.length, refusedAt: at, afterMs: first.ms, expected: limit.expectRefusalAt, rule: limit.rule, source: limit.source };
  if (first.message !== limit.refused || first.code !== limit.code) {
    // Another refusal (signed out, missing function, bad input) says nothing about the limit.
    return { ...base, verdict: 'other-error', code: first.code ?? '', message: first.message ?? '' };
  }
  if (at === limit.expectRefusalAt) return { ...base, verdict: 'matches' };
  return { ...base, verdict: at < limit.expectRefusalAt ? 'refused-early' : 'refused-late' };
}

const WORDS = {
  matches: 'matches the migration',
  'refused-early': 'refused EARLIER than the migration says (calls from the last hour or day may already count)',
  'refused-late': 'refused LATER than the migration says: the limit is looser than written',
  'never-refused': 'NEVER refused: the limit did not kick in',
  'other-error': 'stopped by a different error, so the limit was not tested',
};

/** One plain line per function, then an overall line. Never includes credentials. */
export function formatReport(results) {
  const lines = results.map(r => {
    const when = r.refusedAt ? `refused at call ${r.refusedAt} after ${(r.afterMs / 1000).toFixed(1)} s` : `${r.calls} calls, no refusal`;
    const extra = r.verdict === 'other-error' ? ` (${r.code}: ${r.message})` : '';
    return `${r.fn}: ${when}; expected the first refusal at call ${r.expected} (${r.rule}; ${r.source}): ${WORDS[r.verdict]}${extra}.`;
  });
  const bad = results.filter(r => r.verdict !== 'matches').length;
  lines.push(bad === 0 ? 'all limits match the migrations.' : `${bad} of ${results.length} limits need a look.`);
  return lines.join('\n');
}

// ---------------------------------------------------------------- the run itself (staging only)

const errorOf = error => ({ ok: false, code: typeof error?.code === 'string' ? error.code : '', message: typeof error?.message === 'string' ? error.message : '' });

async function hammer(fn, call) {
  const limit = LIMITS[fn];
  const results = [];
  const start = Date.now();
  for (let n = 1; n <= limit.maxCalls; n++) {
    let result;
    try {
      const { error } = await call(n);
      result = error ? errorOf(error) : { ok: true };
    } catch (error) {
      result = errorOf(error);
    }
    results.push({ ...result, ms: Date.now() - start });
    if (!result.ok) break;
  }
  return judge(fn, results);
}

function studyBatch(env, batch, startMs) {
  return Array.from({ length: 50 }, (_unused, i) => ({
    item_id: env.RATELIMIT_ITEM_ID,
    version_id: env.RATELIMIT_VERSION_ID,
    kind: 'answered',
    ms_on_item: 1000,
    // A distinct whole second for every event, so none counts as a repeat of another.
    at: new Date(startMs - ((batch - 1) * 50 + i + 1) * 1000).toISOString(),
  }));
}

export async function run(argv = process.argv.slice(2), env = process.env, log = console.log) {
  const guard = checkGuard(argv, env);
  if (!guard.ok) {
    log(guard.reason);
    return 2;
  }
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(guard.url, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email: env.RATELIMIT_EMAIL, password: env.RATELIMIT_PASSWORD });
  if (signInError) {
    log('sign-in failed for the test account; check RATELIMIT_EMAIL and RATELIMIT_PASSWORD (not shown).');
    return 1;
  }
  log(`signed in on staging (${guard.ref}); this takes a minute or two.`);
  const startMs = Date.now();
  const results = [];
  results.push(await hammer('check_answer', () => client.rpc('check_answer', {
    item_id: env.RATELIMIT_ITEM_ID, version_id: env.RATELIMIT_VERSION_ID, picked: [env.RATELIMIT_CHOICE],
  })));
  results.push(await hammer('submit_flag', n => client.rpc('submit_flag', {
    page: '/learn/questions', item_id: null, item_version_id: null, reason: 'other', comment: `rate-limit check ${n}`,
  })));
  results.push(await hammer('record_study_events', n => client.rpc('record_study_events', { events: studyBatch(env, n, startMs) })));
  results.push(await hammer('update_display_name', n => client.rpc('update_display_name', { new_name: `limit check ${n}` })));
  await client.auth.signOut();
  log(formatReport(results));
  return results.every(r => r.verdict === 'matches') ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then(code => { process.exitCode = code; }, () => {
    console.log('the check stopped with an unexpected error (details hidden so no credential is printed).');
    process.exitCode = 1;
  });
}
