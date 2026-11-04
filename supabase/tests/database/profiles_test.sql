-- Student profiles (D-77): every account gets one, and each student sees only their own. Display names change only
-- through update_display_name (update_display_name_test.sql).
-- Run by `supabase test db` on a throwaway local database; the two accounts below exist only inside this test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Two accounts, as Supabase Auth would create them.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'one@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'two@example.com');

select results_eq(
  $$ select id from public.profiles order by id $$,
  $$ values ('00000000-0000-4000-8000-000000000001'::uuid), ('00000000-0000-4000-8000-000000000002'::uuid) $$,
  'a new account gets its profile at once'
);

select table_privs_are('public', 'profiles', 'anon', array[]::text[], 'signed-out visitors have no access to profiles');
select table_privs_are('public', 'profiles', 'authenticated', array['SELECT'], 'students can only read the table');
select column_privs_are(
  'public', 'profiles', 'display_name', 'authenticated', array['SELECT'],
  'students change the display name only through update_display_name (update_display_name_test.sql)'
);
select column_privs_are(
  'public', 'profiles', 'id', 'authenticated', array['SELECT'], 'students cannot change which account a profile is'
);
select ok(
  not has_function_privilege('anon', 'public.handle_new_user()', 'execute')
    and not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'),
  'nobody runs the new-account function directly'
);

-- Signed in as account one. Both claim settings are set, so this works with either way auth.uid() reads the JWT.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select id from public.profiles $$,
  $$ values ('00000000-0000-4000-8000-000000000001'::uuid) $$,
  'a student sees only their own profile'
);

select throws_ok(
  $$ update public.profiles set display_name = 'sam' where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'a student cannot change even their own display name directly'
);

select throws_ok(
  $$ update public.profiles set display_name = 'not mine' where id = '00000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'a student cannot change anyone else''s display name'
);

select throws_ok(
  $$ update public.profiles set id = '00000000-0000-4000-8000-000000000003'
     where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'a student cannot move their profile to another account'
);

select throws_ok(
  $$ insert into public.profiles (id) values ('00000000-0000-4000-8000-000000000003') $$,
  '42501', null, 'a student cannot add a profile'
);

select throws_ok(
  $$ delete from public.profiles $$,
  '42501', null, 'a student cannot delete a profile'
);

-- Signed out.
set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';
set local "request.jwt.claim.sub" to '';

select throws_ok(
  $$ select id from public.profiles $$,
  '42501', null, 'signed-out visitors cannot read profiles'
);

-- Deleting an account deletes its profile.
reset role;
delete from auth.users where id = '00000000-0000-4000-8000-000000000002';

select results_eq(
  $$ select count(*)::int from public.profiles $$,
  $$ values (1) $$,
  'deleting an account deletes its profile'
);

select * from finish();
rollback;
