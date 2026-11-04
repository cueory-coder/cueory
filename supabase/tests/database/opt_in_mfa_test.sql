-- Task 301 opt-in MFA: security on server-side RLS and SECURITY DEFINER RPCs.
-- All accounts, factor IDs and records here are synthetic. Runs on the throwaway Supabase test DB.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'mfa-one@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'mfa-two@example.com');

-- User one has an active factor, user two has only an unfinished enrollment.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000001',
   'fake verified', 'totp', 'verified', now(), now()),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000002',
   'fake pending', 'totp', 'unverified', now(), now());

insert into public.flags (user_id, page, reason, comment) values
  ('00000000-0000-4000-8000-000000000001', '/learn/sample', 'typo', 'sample one'),
  ('00000000-0000-4000-8000-000000000002', '/learn/sample', 'typo', 'sample two');

select ok(has_function_privilege('authenticated', 'app_private.mfa_access_allowed()', 'execute')
    and not has_function_privilege('anon', 'app_private.mfa_access_allowed()', 'execute'),
  'only authenticated sessions can call the private boolean MFA check');
select ok((select prosecdef from pg_proc where oid = 'app_private.mfa_access_allowed()'::regprocedure)
    and (select proconfig @> array['search_path=""'] from pg_proc where oid = 'app_private.mfa_access_allowed()'::regprocedure),
  'private factor lookup is SECURITY DEFINER with an empty search path');
select results_eq(
  $$ select count(*)::int from pg_policies
     where schemaname = 'public' and tablename = any(array['profiles', 'attempts', 'review_state', 'exam_plans', 'study_events'])
       and permissive = 'RESTRICTIVE' and policyname like 'opt-in MFA required%' $$,
  $$ values (5) $$,
  'all five personal data tables have restrictive MFA policies');
select ok(not has_schema_privilege('anon', 'app_private', 'USAGE'),
  'signed-out visitors cannot resolve the private MFA helper');

-- A verified factor at aal1 must not expose any personal records or bypass SECURITY DEFINER checks.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
select is((select app_private.mfa_access_allowed()), false, 'verified factor rejects aal1');
select is_empty($$ select id from public.profiles $$, 'verified student cannot read a profile at aal1');
select is_empty($$ select id from public.my_flags() $$, 'verified student cannot export flags at aal1');
select throws_ok($$ select public.delete_my_account() $$,
  '28000', 'complete two-factor sign-in to continue',
  'aal1 cannot permanently delete a verified-factor account');
select throws_ok($$ select public.update_display_name('try change') $$,
  '28000', 'complete two-factor sign-in to continue',
  'aal1 cannot mutate the verified-factor profile via an elevated RPC');
select throws_ok($$ select public.check_answer(null, null, array['a']) $$,
  '28000', 'complete two-factor sign-in to continue',
  'aal1 cannot disclose answer keys or record attempts');
select throws_ok($$ select public.record_study_events('[]'::jsonb) $$,
  '28000', 'complete two-factor sign-in to continue',
  'aal1 cannot write history through a SECURITY DEFINER function');
select throws_ok($$ select public.submit_flag('/learn/sample', null, null, 'typo', null) $$,
  '28000', 'complete two-factor sign-in to continue',
  'aal1 cannot submit a report via an elevated RPC');

-- Completing MFA upgrades the same user to aal2 and restores scoped access.
set local "request.jwt.claims" to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
select is((select app_private.mfa_access_allowed()), true, 'verified factor accepts aal2');
select results_eq($$ select id from public.profiles $$,
  $$ values ('00000000-0000-4000-8000-000000000001'::uuid) $$,
  'aal2 can read only its own profile');
select results_eq($$ select count(*)::int from public.my_flags() $$,
  $$ values (1) $$, 'aal2 can export its own report');
select lives_ok($$ select public.update_display_name('verified student') $$,
  'aal2 can change the display name through its existing rate-limited RPC');
select results_eq($$ select display_name from public.profiles $$,
  $$ values ('verified student') $$, 'aal2 profile change was stored');
select lives_ok($$ select public.delete_my_account() $$,
  'aal2 can still delete its own account');

-- The other account's unverified TOTP setup cannot lock that account out or leak the first account.
set local "request.jwt.claims" to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select results_eq($$ select id from public.profiles $$,
  $$ values ('00000000-0000-4000-8000-000000000002'::uuid) $$,
  'an account with only an unverified factor still works at aal1');
select results_eq($$ select count(*)::int from public.my_flags() $$,
  $$ values (1) $$, 'unverified account can export its own report');
select lives_ok($$ select public.update_display_name('pending student') $$,
  'unverified account can still change its display name');
select results_eq($$ select display_name from public.profiles $$,
  $$ values ('pending student') $$, 'unverified-account update was stored');

set local "request.jwt.claims" to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal0"}';
select is((select app_private.mfa_access_allowed()), false,
  'unexpected assurance claims are never treated as authenticated');
set local "request.jwt.claims" to '{"role":"authenticated","aal":"aal2"}';
set local "request.jwt.claim.sub" to '';
select is((select app_private.mfa_access_allowed()), false,
  'a missing user ID is refused even if the token says aal2');

set local role anon;
select throws_ok($$ select public.delete_my_account() $$, '42501', null,
  'an anonymous visitor still cannot invoke account deletion');
reset role;
select results_eq($$ select count(*)::int from auth.users $$,
  $$ values (1) $$, 'deleting the verified student never deletes the other account');

select * from finish();
rollback;
