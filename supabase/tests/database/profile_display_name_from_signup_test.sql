-- The display name typed at email sign-up reaches the profile (Task 170), only when it passes the profiles checks,
-- and bad sign-up data never blocks a sign-up. Run by `supabase test db` on a throwaway local database; every account
-- below exists only inside this test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select ok(
  (select prosecdef from pg_proc where oid = 'public.handle_new_user()'::regprocedure)
    and (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.handle_new_user()'::regprocedure),
  'handle_new_user is security definer with an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.handle_new_user()', 'execute')
    and not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'),
  'nobody runs the new-account function directly'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass
      and tgfoid = 'public.handle_new_user()'::regprocedure and not tgisinternal
  ),
  'the new-account trigger still runs handle_new_user'
);

-- Accounts as Supabase Auth would create them, with the metadata email sign-up or Google would send.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000101', 'name@example.com', '{"display_name": "Sample Student"}'),
  ('00000000-0000-4000-8000-000000000102', 'fifty@example.com', jsonb_build_object('display_name', repeat('a', 50))),
  ('00000000-0000-4000-8000-000000000103', 'long@example.com', jsonb_build_object('display_name', repeat('a', 51))),
  ('00000000-0000-4000-8000-000000000104', 'empty@example.com', '{"display_name": ""}'),
  ('00000000-0000-4000-8000-000000000105', 'newline@example.com', '{"display_name": "sample\nname"}'),
  ('00000000-0000-4000-8000-000000000106', 'tab@example.com', '{"display_name": "sample\tname"}'),
  ('00000000-0000-4000-8000-000000000107', 'number@example.com', '{"display_name": 42}'),
  ('00000000-0000-4000-8000-000000000108', 'object@example.com', '{"display_name": {"name": "sample"}}'),
  ('00000000-0000-4000-8000-000000000109', 'google@example.com', '{"name": "Sample Google", "full_name": "Sample Google"}'),
  ('00000000-0000-4000-8000-000000000110', 'nometa@example.com', null),
  ('00000000-0000-4000-8000-000000000111', 'jsonnull@example.com', '{"display_name": null}'),
  ('00000000-0000-4000-8000-000000000112', 'unicode@example.com', jsonb_build_object('display_name', repeat('é', 50)));

select is(
  (select count(*)::int from public.profiles where id::text like '00000000-0000-4000-8000-0000000001%'), 12,
  'every new account gets its profile, whatever its sign-up data'
);

select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000101'), 'Sample Student',
  'the name typed at sign-up is copied into the profile'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000102'), repeat('a', 50),
  'a 50-character name is copied'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000112'), repeat('é', 50),
  'the length counts characters, as the profiles check does'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000103'), null,
  'a name over 50 characters is left out'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000104'), null,
  'an empty name is left out'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000105'), null,
  'a name with a line break is left out'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000106'), null,
  'a name with a tab is left out'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000107'), null,
  'a number is not a name'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000108'), null,
  'an object is not a name'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000109'), null,
  'Google''s profile name is not copied: only a display name the student typed'
);
select is(
  (select count(*)::int from public.profiles
   where id in ('00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-000000000111')
     and display_name is null),
  2,
  'no metadata, or a null name, leaves the name empty'
);

-- The copied name is the student's own, like any other: they still see and change only their own.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000101", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000101';

select results_eq(
  $$ select display_name from public.profiles $$,
  $$ values ('Sample Student'::text) $$,
  'a student sees only their own copied name'
);

select * from finish();
rollback;
