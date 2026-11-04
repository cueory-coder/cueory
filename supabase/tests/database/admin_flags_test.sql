-- The admin check and the flag-inbox functions (Task 65): only an account in public.admins, signed in with two-factor
-- (JWT aal = aal2), can list reports and mark them handled or reopen them; everyone else is refused and changes
-- nothing; the flags and admins tables stay closed to every website role. Run by `supabase test db` on a throwaway
-- local database; the accounts and rows below exist only inside this test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(82);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@example.com'),
  ('00000000-0000-4000-8000-0000000000a2', 'student@example.com'),
  ('00000000-0000-4000-8000-0000000000a3', 'reporter@example.com');
insert into public.admins (user_id) values ('00000000-0000-4000-8000-0000000000a1');
-- The owner has verified MFA. These are fake test-only factor IDs and have no usable secret.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a1',
   'fake verified admin', 'totp', 'verified', now(), now());

-- A published question, so a report can name its item and version.
insert into public.concepts (id, slug, title, published) values
  ('00000000-0000-4000-8000-0000000000c1', 'sample-concept', 'sample concept', true);
insert into public.sources (id, slug, title, publisher, url, license, published) values
  ('00000000-0000-4000-8000-0000000000b1', 'sample-book', 'a sample book', 'sample publisher',
   'https://example.com/book', 'CC BY 4.0', true);
insert into public.items (id, concept_id, type) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 'single');
insert into public.item_versions (id, item_id, version, stem, source_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 1, 'stem one',
   '00000000-0000-4000-8000-0000000000b1');

-- Five open reports, an hour apart (01 is the oldest), and one handled report.
insert into public.flags (id, user_id, page, item_id, item_version_id, reason, comment, created_at) values
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-0000000000a3', '/learn/one', null, null,
   'typo', 'sample one', now() - interval '5 hours'),
  ('00000000-0000-4000-8000-000000000f02', '00000000-0000-4000-8000-0000000000a3', '/learn/two',
   '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1', 'wrong-fact', null,
   now() - interval '4 hours'),
  ('00000000-0000-4000-8000-000000000f03', '00000000-0000-4000-8000-0000000000a3', '/learn/three', null, null,
   'confusing', 'sample three', now() - interval '3 hours'),
  ('00000000-0000-4000-8000-000000000f04', '00000000-0000-4000-8000-0000000000a3', '/learn/four', null, null,
   'broken', null, now() - interval '2 hours'),
  ('00000000-0000-4000-8000-000000000f05', '00000000-0000-4000-8000-0000000000a3', '/learn/five', null, null,
   'other', 'sample five', now() - interval '1 hour');
insert into public.flags (id, user_id, page, reason, status, handled_at, created_at) values
  ('00000000-0000-4000-8000-000000000f06', '00000000-0000-4000-8000-0000000000a3', '/learn/six', 'typo', 'handled',
   '2026-10-01T00:00:00Z', now() - interval '6 hours');

-- ---- Who may do what.
select ok(
  (select relrowsecurity from pg_class where oid = 'public.admins'::regclass), 'admins has row-level security'
);
select table_privs_are('public', 'admins', 'anon', array[]::text[], 'visitors have no access to admins');
select table_privs_are('public', 'admins', 'authenticated', array[]::text[], 'students have no access to admins');
select table_privs_are('public', 'admins', 'service_role', array[]::text[], 'not even the service role can write admins');
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'admins'
      and permissive = 'RESTRICTIVE' and cmd = 'ALL'
      and roles @> array['anon', 'authenticated']::name[] and cardinality(roles) = 2
      and qual = 'false' and with_check = 'false'
  ),
  'admins has an explicit policy that refuses every website role'
);
select table_privs_are('public', 'flags', 'anon', array[]::text[], 'flags stay closed to visitors');
select table_privs_are('public', 'flags', 'authenticated', array[]::text[], 'flags stay closed to signed-in accounts, admins included');

select ok(
  not has_function_privilege('anon', 'public.is_admin()', 'execute')
    and not has_function_privilege('authenticated', 'public.is_admin()', 'execute')
    and not has_function_privilege('service_role', 'public.is_admin()', 'execute'),
  'no website role can run is_admin directly'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.is_admin()'::regprocedure)
    and (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.is_admin()'::regprocedure),
  'is_admin is security invoker with an empty search_path, so it adds no rights of its own'
);

select ok(
  has_function_privilege('authenticated', 'public.admin_list_flags(text, integer, timestamptz, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.admin_list_flags(text, integer, timestamptz, uuid)', 'execute'),
  'admin_list_flags: signed-in accounts may call it (it checks is_admin) and visitors may not'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_mark_flag_handled(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.admin_mark_flag_handled(uuid)', 'execute'),
  'admin_mark_flag_handled: signed-in accounts may call it and visitors may not'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_reopen_flag(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.admin_reopen_flag(uuid)', 'execute'),
  'admin_reopen_flag: signed-in accounts may call it and visitors may not'
);
select ok(
  not exists (
    select 1 from pg_proc
    where oid in ('public.admin_list_flags(text, integer, timestamptz, uuid)'::regprocedure,
                  'public.admin_mark_flag_handled(uuid)'::regprocedure,
                  'public.admin_reopen_flag(uuid)'::regprocedure)
      and not (prosecdef and coalesce(proconfig @> array['search_path=""'], false))
  ),
  'the three admin functions are security definer with an empty search_path'
);
select ok(
  not exists (
    select 1 from pg_proc
    where oid in ('public.admin_list_flags(text, integer, timestamptz, uuid)'::regprocedure,
                  'public.admin_mark_flag_handled(uuid)'::regprocedure,
                  'public.admin_reopen_flag(uuid)'::regprocedure)
      and position('public.is_admin()' in prosrc) = 0
  ),
  'each admin function checks public.is_admin()'
);

-- ---- What is_admin says (run as the owner, with each caller's claims).
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated", "aal": "aal2"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-0000000000a1';
select is(public.is_admin(), true, 'is_admin: an admin signed in with two-factor');
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated", "aal": "aal1"}';
select is(public.is_admin(), false, 'is_admin: the same admin without two-factor is not');
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(public.is_admin(), false, 'is_admin: no aal claim counts as aal1 (Supabase MFA docs)');
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated", "aal": "aal2"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-0000000000a2';
select is(public.is_admin(), false, 'is_admin: a student with two-factor is not an admin');
set local "request.jwt.claims" to '{"role": "anon"}';
set local "request.jwt.claim.sub" to '';
select is(public.is_admin(), false, 'is_admin: a signed-out visitor is not');

-- ---- A context that is not `authenticated`, carrying the admin's id and aal2 (defense in depth).
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true); end $$;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "anon", "aal": "aal2"}';
select is(public.is_admin(), false, 'is_admin: admin id and aal2 under the anon role claim is not enough');
select throws_ok($$ select * from public.admin_list_flags('open') $$, '42501', 'only the site owner, signed in with two-factor, can do this', 'anon claims: list refused');
select throws_ok($$ select public.admin_mark_flag_handled('00000000-0000-4000-8000-000000000f01') $$, '42501', null, 'anon claims: mark refused');
select throws_ok($$ select public.admin_reopen_flag('00000000-0000-4000-8000-000000000f06') $$, '42501', null, 'anon claims: reopen refused');
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "service_role", "aal": "aal2"}';
select is(public.is_admin(), false, 'is_admin: the service_role claim is not enough either');
select throws_ok($$ select * from public.admin_list_flags('open') $$, '42501', null, 'service_role claims: list refused');
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-0000000000a1", "aal": "aal2"}';
select is(public.is_admin(), false, 'is_admin: no role claim is refused');
select is((select count(*)::int from public.flags where status = 'open'), 5, 'and nothing changed');

-- ---- Signed out.
set local role anon;
select throws_ok($$ select * from public.admin_list_flags('open') $$, '42501', null, 'a visitor cannot list reports');
select throws_ok(
  $$ select public.admin_mark_flag_handled('00000000-0000-4000-8000-000000000f01') $$, '42501', null,
  'a visitor cannot mark a report handled'
);
select throws_ok(
  $$ select public.admin_reopen_flag('00000000-0000-4000-8000-000000000f06') $$, '42501', null,
  'a visitor cannot reopen a report'
);
select throws_ok($$ select user_id from public.admins $$, '42501', null, 'a visitor cannot read admins');

-- ---- A student, without and then with two-factor.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated", "aal": "aal1"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-0000000000a2';
select throws_ok(
  $$ select * from public.admin_list_flags('open') $$, '42501',
  'only the site owner, signed in with two-factor, can do this', 'a student cannot list reports'
);
select throws_ok(
  $$ select public.admin_mark_flag_handled('00000000-0000-4000-8000-000000000f01') $$, '42501',
  'only the site owner, signed in with two-factor, can do this', 'a student cannot mark a report handled'
);
select throws_ok(
  $$ select public.admin_reopen_flag('00000000-0000-4000-8000-000000000f06') $$, '42501',
  'only the site owner, signed in with two-factor, can do this', 'a student cannot reopen a report'
);
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated", "aal": "aal2"}';
select throws_ok(
  $$ select * from public.admin_list_flags('open') $$, '42501',
  'only the site owner, signed in with two-factor, can do this', 'a student with two-factor still cannot list reports'
);
select throws_ok(
  $$ select public.admin_mark_flag_handled('00000000-0000-4000-8000-000000000f01') $$, '42501',
  'only the site owner, signed in with two-factor, can do this', 'a student with two-factor still cannot mark one'
);
select throws_ok(
  $$ select public.admin_mark_flag_handled('00000000-0000-4000-8000-0000000000ff') $$, '42501',
  'only the site owner, signed in with two-factor, can do this',
  'a student is refused before the id is looked at, so ids cannot be probed'
);
select throws_ok(
  $$ insert into public.admins (user_id) values ('00000000-0000-4000-8000-0000000000a2') $$, '42501', null,
  'a student cannot make themselves an admin'
);
select throws_ok($$ select user_id from public.admins $$, '42501', null, 'a student cannot read admins');
select throws_ok($$ select id from public.flags $$, '42501', null, 'a student cannot read flags directly');

-- ---- The admin without two-factor.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated", "aal": "aal1"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-0000000000a1';
select throws_ok(
  $$ select * from public.admin_list_flags('open') $$, '42501',
  'only the site owner, signed in with two-factor, can do this', 'the admin at aal1 cannot list reports'
);
select throws_ok(
  $$ select public.admin_mark_flag_handled('00000000-0000-4000-8000-000000000f01') $$, '42501',
  'only the site owner, signed in with two-factor, can do this', 'the admin at aal1 cannot mark a report handled'
);
select throws_ok(
  $$ select public.admin_reopen_flag('00000000-0000-4000-8000-000000000f06') $$, '42501',
  'only the site owner, signed in with two-factor, can do this', 'the admin at aal1 cannot reopen a report'
);
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select * from public.admin_list_flags('open') $$, '42501',
  'only the site owner, signed in with two-factor, can do this', 'the admin with no aal claim cannot list reports'
);

-- Nothing was changed by any refusal.
reset role;
select results_eq(
  $$ select status, count(*)::int from public.flags group by status order by status $$,
  $$ values ('handled', 1), ('open', 5) $$, 'refused calls changed nothing'
);

-- ---- The admin with two-factor.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated", "aal": "aal2"}';
select results_eq(
  $$ select id::text from public.admin_list_flags('open') $$,
  $$ values ('00000000-0000-4000-8000-000000000f05'), ('00000000-0000-4000-8000-000000000f04'),
            ('00000000-0000-4000-8000-000000000f03'), ('00000000-0000-4000-8000-000000000f02'),
            ('00000000-0000-4000-8000-000000000f01') $$,
  'the admin lists the open reports, newest first'
);
select results_eq(
  $$ select array(select jsonb_object_keys(to_jsonb(f)) order by 1) from public.admin_list_flags('open') f limit 1 $$,
  $$ values (array['comment', 'created_at', 'handled_at', 'id', 'item_id', 'item_version_id', 'page', 'reason',
                   'status', 'user_id']) $$,
  'each row has exactly the fields the inbox shows'
);
select results_eq(
  $$ select page, item_id::text, item_version_id::text, reason, comment, status, user_id::text, handled_at
     from public.admin_list_flags('open') where id = '00000000-0000-4000-8000-000000000f02' $$,
  $$ values ('/learn/two', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1',
             'wrong-fact', null::text, 'open', '00000000-0000-4000-8000-0000000000a3', null::timestamptz) $$,
  'with the report as stored, question and version included'
);
select results_eq(
  $$ select id::text, status from public.admin_list_flags('handled') $$,
  $$ values ('00000000-0000-4000-8000-000000000f06', 'handled') $$, 'the handled list holds only handled reports'
);

-- Paging: two at a time, each page starting after the last row of the one before.
select results_eq(
  $$ select id::text from public.admin_list_flags('open', 2) $$,
  $$ values ('00000000-0000-4000-8000-000000000f05'), ('00000000-0000-4000-8000-000000000f04') $$,
  'max_rows limits the page'
);
select results_eq(
  $$ select id::text from public.admin_list_flags('open', 2,
       (select created_at from public.admin_list_flags('open') where id = '00000000-0000-4000-8000-000000000f04'),
       '00000000-0000-4000-8000-000000000f04') $$,
  $$ values ('00000000-0000-4000-8000-000000000f03'), ('00000000-0000-4000-8000-000000000f02') $$,
  'the next page starts after the given time and id'
);
select results_eq(
  $$ select id::text from public.admin_list_flags('open', 2,
       (select created_at from public.admin_list_flags('open') where id = '00000000-0000-4000-8000-000000000f02'),
       '00000000-0000-4000-8000-000000000f02') $$,
  $$ values ('00000000-0000-4000-8000-000000000f01') $$, 'and the last page holds what is left'
);
select is(
  (select count(*)::int from public.admin_list_flags('open', 200)), 5, 'max_rows of 200 is allowed'
);
select is(
  (select count(*)::int from public.admin_list_flags(flag_status => 'open')), 5, 'it can be called by argument name'
);

-- Bad input is refused.
select throws_ok(
  $$ select * from public.admin_list_flags('everything') $$, '22023', 'show open or handled reports',
  'a status that is not open or handled is refused'
);
select throws_ok(
  $$ select * from public.admin_list_flags(null) $$, '22023', 'show open or handled reports', 'no status is refused'
);
select throws_ok(
  $$ select * from public.admin_list_flags('open', 0) $$, '22023', 'ask for between 1 and 200 reports',
  'max_rows of 0 is refused'
);
select throws_ok(
  $$ select * from public.admin_list_flags('open', 201) $$, '22023', 'ask for between 1 and 200 reports',
  'max_rows over 200 is refused'
);
select throws_ok(
  $$ select * from public.admin_list_flags('open', 2, now(), null) $$, '22023',
  'the next page needs the time and the id of the last report', 'a page start without its id is refused'
);
select throws_ok(
  $$ select * from public.admin_list_flags('open', 2, null, '00000000-0000-4000-8000-000000000f02') $$, '22023',
  'the next page needs the time and the id of the last report', 'a page start without its time is refused'
);

-- The tables stay closed even to the admin: everything goes through the functions.
select throws_ok($$ select id from public.flags $$, '42501', null, 'the admin cannot read flags directly');
select throws_ok(
  $$ update public.flags set status = 'open', handled_at = null $$, '42501', null, 'the admin cannot change flags directly'
);
select throws_ok($$ select user_id from public.admins $$, '42501', null, 'the admin cannot read admins directly');

-- Marking handled, again, and reopening.
select is(
  public.admin_mark_flag_handled('00000000-0000-4000-8000-000000000f01'), now(),
  'the admin marks a report handled and gets its handled time back'
);
reset role;
select results_eq(
  $$ select status, handled_at from public.flags where id = '00000000-0000-4000-8000-000000000f01' $$,
  $$ values ('handled', now()) $$, 'the report is stored as handled, with that time'
);
set local role authenticated;
select is(
  public.admin_mark_flag_handled('00000000-0000-4000-8000-000000000f06'), '2026-10-01T00:00:00Z'::timestamptz,
  'marking a handled report again keeps and returns its first handled time'
);
select is(
  (select count(*)::int from public.admin_list_flags('open')), 4, 'the open list now has four reports'
);
select is(
  (select count(*)::int from public.admin_list_flags('handled')), 2, 'and the handled list two'
);
select lives_ok(
  $$ select public.admin_reopen_flag('00000000-0000-4000-8000-000000000f06') $$, 'the admin reopens a handled report'
);
reset role;
select results_eq(
  $$ select status, handled_at from public.flags where id = '00000000-0000-4000-8000-000000000f06' $$,
  $$ values ('open', null::timestamptz) $$, 'a reopened report is open with no handled time'
);
set local role authenticated;
select lives_ok(
  $$ select public.admin_reopen_flag('00000000-0000-4000-8000-000000000f06') $$,
  'reopening an open report changes nothing and is not an error'
);
select throws_ok(
  $$ select public.admin_mark_flag_handled('00000000-0000-4000-8000-0000000000ff') $$, '22023',
  'that report was not found', 'marking an unknown report is refused'
);
select throws_ok(
  $$ select public.admin_reopen_flag('00000000-0000-4000-8000-0000000000ff') $$, '22023',
  'that report was not found', 'reopening an unknown report is refused'
);
select throws_ok(
  $$ select public.admin_mark_flag_handled(null) $$, '22023', 'that report was not found', 'no report id is refused'
);

-- ---- An old aal2 JWT cannot keep access after the admin's authenticator is removed.
reset role;
update auth.mfa_factors set status = 'unverified'
  where user_id = '00000000-0000-4000-8000-0000000000a1';
select is(public.is_admin(), false,
  'a stale aal2 token fails without a currently verified factor');
set local role authenticated;
select throws_ok($ select * from public.admin_list_flags('open') $, '42501',
  'only the site owner, signed in with two-factor, can do this',
  'removing the factor blocks reading private admin reports');
select throws_ok($ select public.admin_mark_flag_handled('00000000-0000-4000-8000-000000000f02') $, '42501',
  'only the site owner, signed in with two-factor, can do this',
  'removing the factor blocks writing handled status');
select throws_ok($ select public.admin_reopen_flag('00000000-0000-4000-8000-000000000f06') $, '42501',
  'only the site owner, signed in with two-factor, can do this',
  'removing the factor blocks reopening reports');
reset role;
update auth.mfa_factors set status = 'verified'
  where user_id = '00000000-0000-4000-8000-0000000000a1';
set local role authenticated;

-- ---- Removing the admin takes effect on the next call, even with the same two-factor token.
reset role;
delete from public.admins where user_id = '00000000-0000-4000-8000-0000000000a1';
set local role authenticated;
select throws_ok(
  $$ select * from public.admin_list_flags('open') $$, '42501',
  'only the site owner, signed in with two-factor, can do this', 'a removed admin is refused at once'
);
select throws_ok(
  $$ select public.admin_mark_flag_handled('00000000-0000-4000-8000-000000000f02') $$, '42501',
  'only the site owner, signed in with two-factor, can do this', 'and cannot mark reports any more'
);

-- ---- Deleting an admin's account removes it from admins; reports stay.
reset role;
insert into public.admins (user_id) values ('00000000-0000-4000-8000-0000000000a1');
delete from auth.users where id = '00000000-0000-4000-8000-0000000000a1';
select is_empty($$ select 1 from public.admins $$, 'deleting the admin''s account removes it from admins');
select is((select count(*)::int from public.flags), 6, 'and no report is lost');

select * from finish();
rollback;
