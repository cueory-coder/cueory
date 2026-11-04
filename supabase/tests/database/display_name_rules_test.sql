-- One display-name rule (Task 302): public.display_name_ok, and the sign-up trigger that uses it. A name is 1 to 50
-- characters with no control, invisible or direction-changing characters; src/islands/displayname.ts refuses the same
-- ones. Run by `supabase test db` on a throwaway local database; every account below exists only inside this test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- ---- The helper itself.
select ok(
  (select provolatile = 'i' from pg_proc where oid = 'public.display_name_ok(text)'::regprocedure),
  'display_name_ok is immutable'
);
select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.display_name_ok(text)'::regprocedure),
  'it has an empty search_path'
);
select ok(
  not has_function_privilege('anon', 'public.display_name_ok(text)', 'execute')
    and not has_function_privilege('authenticated', 'public.display_name_ok(text)', 'execute'),
  'the website cannot run it; only the database''s own functions do'
);

-- Names that pass.
select ok(public.display_name_ok('Sam'), 'a plain name passes');
select ok(public.display_name_ok('José Núñez'), 'accented letters and a space pass');
select ok(public.display_name_ok(repeat('a', 50)), '50 characters pass');
select ok(public.display_name_ok(repeat('é', 50)), 'the length counts characters, not bytes');
select ok(public.display_name_ok('محمد'), 'right-to-left letters themselves pass');
select ok(public.display_name_ok('李小龍'), 'other scripts pass');

-- Names that fail.
select ok(not public.display_name_ok(null), 'null is not a name');
select ok(not public.display_name_ok(''), 'an empty name fails');
select ok(not public.display_name_ok(repeat('a', 51)), '51 characters fail');
select ok(not public.display_name_ok(E'sam\nsmith'), 'a line break fails');
select ok(not public.display_name_ok(E'sam\tsmith'), 'a tab fails');
select ok(not public.display_name_ok(E'sam\x7fsmith'), 'U+007F fails');
select ok(not public.display_name_ok(E'sam\u0085smith'), 'a C1 control (U+0085) fails');
select ok(not public.display_name_ok(E'sam\u009fsmith'), 'U+009F fails');

-- Every invisible or direction-changing character the rule names, one by one.
select is_empty(
  $$ select to_hex(c)
     from (values (x'061c'::int), (x'200b'::int), (x'200c'::int), (x'200d'::int), (x'200e'::int), (x'200f'::int),
                  (x'202a'::int), (x'202b'::int), (x'202c'::int), (x'202d'::int), (x'202e'::int),
                  (x'2060'::int), (x'2061'::int), (x'2062'::int), (x'2063'::int), (x'2064'::int),
                  (x'2066'::int), (x'2067'::int), (x'2068'::int), (x'2069'::int), (x'feff'::int)) v (c)
     where public.display_name_ok('sam' || chr(c) || 'smith') $$,
  'each invisible or direction-changing character fails (U+061C, U+200B-U+200F, U+202A-U+202E, U+2060-U+2064, U+2066-U+2069, U+FEFF)'
);
select ok(not public.display_name_ok(chr(x'200b'::int)), 'a name of only a zero-width space fails');
select ok(
  public.display_name_ok('sam' || chr(x'2065'::int) || 'smith') and public.display_name_ok('sam' || chr(x'201c'::int) || 'smith'),
  'neighbouring characters outside those ranges (U+2065, U+201C) still pass'
);

-- ---- The sign-up trigger uses it.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000201', 'plain@example.com', '{"display_name": "Sample Student"}'),
  ('00000000-0000-4000-8000-000000000202', 'override@example.com',
     jsonb_build_object('display_name', 'sam' || chr(x'202e'::int) || 'nimda')),
  ('00000000-0000-4000-8000-000000000203', 'zerowidth@example.com',
     jsonb_build_object('display_name', 'ad' || chr(x'200b'::int) || 'min')),
  ('00000000-0000-4000-8000-000000000204', 'isolate@example.com',
     jsonb_build_object('display_name', chr(x'2066'::int) || 'sam')),
  ('00000000-0000-4000-8000-000000000205', 'c1@example.com',
     jsonb_build_object('display_name', 'sam' || chr(x'85'::int))),
  ('00000000-0000-4000-8000-000000000206', 'spaces@example.com', '{"display_name": "  Sam  "}'),
  ('00000000-0000-4000-8000-000000000207', 'onlyspaces@example.com', '{"display_name": "   "}');

select is(
  (select count(*)::int from public.profiles where id::text like '00000000-0000-4000-8000-0000000002%'), 7,
  'every new account still gets its profile, whatever its sign-up name'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000201'), 'Sample Student',
  'a good name is still copied'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000202'), null,
  'a name with a right-to-left override is left out'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000203'), null,
  'a name with a zero-width space is left out'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000204'), null,
  'a name with a direction isolate is left out'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000205'), null,
  'a name with a C1 control character is left out (named outright, not left to the locale)'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000206'), 'Sam',
  'surrounding spaces are trimmed, as update_display_name and the browser do'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000207'), null,
  'a name of only spaces is left out'
);


-- ---- The direct update RPC must enforce the same shared rule, not only the browser/trigger.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-4000-8000-000000000201","role":"authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000201';
select throws_ok(
  $ select public.update_display_name('sam' || chr(x'200b'::int) || 'smith') $,
  '22023', 'a display name is 1 to 50 characters of plain text',
  'direct RPC rejects a hidden zero-width character');
select throws_ok(
  $ select public.update_display_name('sam' || chr(x'202e'::int) || 'smith') $,
  '22023', 'a display name is 1 to 50 characters of plain text',
  'direct RPC rejects a bidi-override character');
select results_eq(
  $ select public.update_display_name('  Grace  ') $,
  $ values ('Grace') $,
  'direct RPC accepts a plain name and trims its surrounding spaces');
select results_eq(
  $ select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000201' $,
  $ values ('Grace') $,
  'validated display-name change is stored on the calling profile');
select is(
  (select name_changes_in_window::integer from public.profiles where id = '00000000-0000-4000-8000-000000000201'),
  1,
  'direct RPC retains the existing per-user rate counter');
reset role;

select * from finish();
rollback;
