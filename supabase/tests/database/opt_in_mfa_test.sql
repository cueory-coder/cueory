-- Task 301 opt-in MFA: security on server-side RLS and SECURITY DEFINER RPCs.
-- All accounts, factor IDs and records here are synthetic. Runs on the throwaway Supabase test DB.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  ('00000000-0000-4000-8000-000000000001', 'mfa-one@example.com', now(), false),
  ('00000000-0000-4000-8000-000000000002', 'mfa-two@example.com', now(), false);

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

select ok(
  (select prosrc like '%hashtextextended(''check_answer:'' || uid::text, 0)%'
     from pg_proc where oid = 'public.check_answer(uuid, uuid, text[])'::regprocedure),
  'the MFA migration preserves the Task 169 distinct answer-check rate-limit lock');

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
-- The later MFA override must retain Task 302's strict direct-RPC name rule.
select throws_ok($$ select public.update_display_name('sam' || chr(x'200b'::int) || 'smith') $$,
  '22023', 'a display name is 1 to 50 characters of plain text',
  'aal2 cannot save zero-width characters through the name RPC');
select throws_ok($$ select public.update_display_name('sam' || chr(x'202e'::int) || 'smith') $$,
  '22023', 'a display name is 1 to 50 characters of plain text',
  'aal2 cannot save a bidirectional override through the name RPC');
select lives_ok($$ select public.update_display_name('verified student') $$,
  'aal2 can change the display name through its existing rate-limited RPC');
select results_eq($$ select display_name from public.profiles $$,
  $$ values ('verified student') $$, 'aal2 profile change was stored');
-- Check the later MFA migration also preserves the Task 302 recent-token gate.
select ok(
  (select prosrc like '%max_age_seconds constant integer := 600%'
     from pg_proc where oid = 'public.delete_my_account()'::regprocedure),
  'the MFA delete RPC retains the ten-minute token check');
select ok(
  (select prosrc like '%public.display_name_ok(clean_name)%'
     from pg_proc where oid = 'public.update_display_name(text)'::regprocedure),
  'the MFA name RPC retains the single server-side validation rule');
select throws_ok($$ select public.delete_my_account() $$,
  '28R01', 'please sign in again to delete your account',
  'aal2 without a token issue time cannot delete an account');
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-4000-8000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'iat', extract(epoch from now())::bigint - 601)::text, true);
select throws_ok($$ select public.delete_my_account() $$,
  '28R01', 'please sign in again to delete your account',
  'aal2 with an eleven-minute-old token cannot delete an account');
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-4000-8000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'iat', 'invalid')::text, true);
select throws_ok($$ select public.delete_my_account() $$,
  '28R01', 'please sign in again to delete your account',
  'aal2 with a nonnumeric token issue time cannot delete an account');
-- A recently issued token plus verified MFA can still delete this test account.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-4000-8000-000000000001', 'role', 'authenticated',
  'aal', 'aal2', 'iat', extract(epoch from now())::bigint - 540)::text, true);
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

-- Verify merged Task 169's confirmed-account checks still apply after this later MFA migration.
-- Each synthetic case is tested with aal2 to ensure MFA cannot bypass account eligibility.
reset role;
update auth.users set email_confirmed_at = null where id = '00000000-0000-4000-8000-000000000002';
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select throws_ok($$ select public.check_answer(null, null, null) $$,
  '28000', 'confirm your email to use this', 'an unconfirmed user cannot invoke check_answer even with aal2');
select throws_ok($$ select public.submit_flag('/learn/sample', null, null, 'typo', null) $$,
  '28000', 'confirm your email to use this', 'an unconfirmed user cannot invoke submit_flag even with aal2');
select throws_ok($$ select public.record_study_events('[]'::jsonb) $$,
  '28000', 'confirm your email to use this', 'an unconfirmed user cannot invoke record_study_events even with aal2');

reset role;
update auth.users set email_confirmed_at = now(), is_anonymous = true where id = '00000000-0000-4000-8000-000000000002';
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select throws_ok($$ select public.check_answer(null, null, null) $$,
  '28000', 'confirm your email to use this', 'a user marked anonymous in auth.users cannot invoke check_answer even with aal2');
select throws_ok($$ select public.submit_flag('/learn/sample', null, null, 'typo', null) $$,
  '28000', 'confirm your email to use this', 'a user marked anonymous in auth.users cannot invoke submit_flag even with aal2');
select throws_ok($$ select public.record_study_events('[]'::jsonb) $$,
  '28000', 'confirm your email to use this', 'a user marked anonymous in auth.users cannot invoke record_study_events even with aal2');

reset role;
update auth.users set is_anonymous = false where id = '00000000-0000-4000-8000-000000000002';
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2","is_anonymous":true}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select throws_ok($$ select public.check_answer(null, null, null) $$,
  '28000', 'confirm your email to use this', 'a caller with the anonymous JWT claim cannot invoke check_answer even with aal2');
select throws_ok($$ select public.submit_flag('/learn/sample', null, null, 'typo', null) $$,
  '28000', 'confirm your email to use this', 'a caller with the anonymous JWT claim cannot invoke submit_flag even with aal2');
select throws_ok($$ select public.record_study_events('[]'::jsonb) $$,
  '28000', 'confirm your email to use this', 'a caller with the anonymous JWT claim cannot invoke record_study_events even with aal2');

reset role;
set local role anon;
select throws_ok($$ select public.delete_my_account() $$, '42501', null,
  'an anonymous visitor still cannot invoke account deletion');
reset role;
select results_eq($$ select count(*)::int from auth.users $$,
  $$ values (1) $$, 'deleting the verified student never deletes the other account');

select * from finish();
rollback;
