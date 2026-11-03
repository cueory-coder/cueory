-- update_display_name (Task 59): the only way a student changes their display name. Signed-in only, checked with the
-- profiles rules, changes only the caller's own row, and limited to 10 changes an hour per account. Run by
-- `supabase test db` on a throwaway local database; the accounts below exist only inside this test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'one@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'two@example.com'),
  ('00000000-0000-4000-8000-000000000003', 'three@example.com');

-- ---- Who may do what.
select ok(
  has_function_privilege('authenticated', 'public.update_display_name(text)', 'execute')
    and not has_function_privilege('anon', 'public.update_display_name(text)', 'execute'),
  'signed-in students can run update_display_name and signed-out visitors cannot'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.update_display_name(text)'::regprocedure)
    and (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.update_display_name(text)'::regprocedure),
  'update_display_name is security definer with an empty search_path'
);
select function_returns('public', 'update_display_name', array['text'], 'text', 'it returns the name as saved');
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'display_name', 'update')
    and not has_table_privilege('authenticated', 'public.profiles', 'update'),
  'students can no longer update profiles directly'
);
select table_privs_are('public', 'display_name_changes', 'anon', array[]::text[], 'visitors have no access to name-change notes');
select table_privs_are(
  'public', 'display_name_changes', 'authenticated', array[]::text[], 'students have no access to name-change notes, not even their own'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.display_name_changes'::regclass),
  'name-change notes have row-level security'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'display_name_changes'
      and permissive = 'RESTRICTIVE' and cmd = 'ALL'
      and roles @> array['anon', 'authenticated']::name[] and cardinality(roles) = 2
      and qual = 'false' and with_check = 'false'
  ),
  'name-change notes have an explicit policy that refuses every website role'
);

-- ---- Signed out.
set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';
set local "request.jwt.claim.sub" to '';
select throws_ok(
  $$ select public.update_display_name('sam') $$,
  '42501', null, 'signed-out visitors cannot run it at all'
);

reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"role": "authenticated"}';
set local "request.jwt.claim.sub" to '';
select throws_ok(
  $$ select public.update_display_name('sam') $$,
  '28000', 'sign in to change your display name', 'a call without an account is refused'
);

-- ---- Signed in as account one.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';

select is(public.update_display_name('  Sam Smith  '), 'Sam Smith', 'a name is saved without its outer spaces');

reset role;
select results_eq(
  $$ select id, display_name from public.profiles order by id $$,
  $$ values ('00000000-0000-4000-8000-000000000001'::uuid, 'Sam Smith'::text),
            ('00000000-0000-4000-8000-000000000002'::uuid, null::text),
            ('00000000-0000-4000-8000-000000000003'::uuid, null::text) $$,
  'only the caller''s own row changes'
);
select results_eq(
  $$ select user_id from public.display_name_changes $$,
  $$ values ('00000000-0000-4000-8000-000000000001'::uuid) $$,
  'the change is noted for the caller'
);
set local role authenticated;

select throws_ok($$ select public.update_display_name(null) $$, '22023', 'a display name is 1 to 50 characters of plain text', 'no name is refused');
select throws_ok($$ select public.update_display_name('   ') $$, '22023', 'a display name is 1 to 50 characters of plain text', 'an all-space name is refused');
select throws_ok(
  $$ select public.update_display_name(repeat('a', 51)) $$, '22023', 'a display name is 1 to 50 characters of plain text',
  'a name over 50 characters is refused'
);
select throws_ok(
  $$ select public.update_display_name(E'sam\nsmith') $$, '22023', 'a display name is 1 to 50 characters of plain text',
  'a name with a control character is refused'
);
select throws_ok(
  $$ select public.update_display_name(E'sam\u0085smith') $$, '22023', 'a display name is 1 to 50 characters of plain text',
  'a name with a C1 control character is refused, like the browser check'
);
select is(public.update_display_name(repeat('é', 50)), repeat('é', 50), 'fifty characters are fine, counted as characters');

reset role;
select is(
  (select count(*)::int from public.display_name_changes),
  2,
  'refused names are not counted against the limit'
);
set local role authenticated;

-- ---- The limit: 10 changes an hour per account.
select lives_ok(
  $$ select public.update_display_name('name ' || n) from generate_series(3, 10) as n $$,
  'up to 10 changes in an hour are allowed'
);
select throws_ok(
  $$ select public.update_display_name('one too many') $$,
  '54000', 'that is a lot of name changes; please try again later', 'the eleventh change in an hour is refused'
);

reset role;
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000001'),
  'name 10',
  'a refused change leaves the saved name alone'
);

-- Another account has its own limit.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select is(public.update_display_name('two'), 'two', 'another account is not held back by the first one''s changes');

-- Notes older than an hour are deleted and stop counting.
reset role;
update public.display_name_changes set changed_at = now() - interval '61 minutes'
  where user_id = '00000000-0000-4000-8000-000000000001';
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
select is(public.update_display_name('later'), 'later', 'changes older than an hour no longer count');

reset role;
select results_eq(
  $$ select user_id, count(*)::int from public.display_name_changes group by user_id order by user_id $$,
  $$ values ('00000000-0000-4000-8000-000000000001'::uuid, 1), ('00000000-0000-4000-8000-000000000002'::uuid, 1) $$,
  'notes older than an hour are deleted, for every account'
);

-- An account without a profile row (it should never happen) is told so, and nothing is noted.
delete from public.profiles where id = '00000000-0000-4000-8000-000000000003';
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000003", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select public.update_display_name('three') $$,
  'P0002', 'your profile was not found', 'an account without a profile row is refused'
);

-- Deleting an account deletes its notes.
reset role;
delete from auth.users where id = '00000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::int from public.display_name_changes where user_id = '00000000-0000-4000-8000-000000000002'),
  0,
  'deleting an account deletes its name-change notes'
);

select * from finish();
rollback;
