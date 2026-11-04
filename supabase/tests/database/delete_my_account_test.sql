-- delete_my_account (Task 60): only a signed-in student can run it, it deletes that student's account and every row
-- Cueory keeps about them in every table, it leaves every other student's rows alone, it refuses when signed out, and
-- running it again is safe. Run by `supabase test db` on a throwaway local database; the students and rows below exist
-- only inside this test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'one@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'two@example.com');

-- A published question, so the students have something to have studied.
insert into public.concepts (id, slug, title, published) values
  ('00000000-0000-4000-8000-0000000000c1', 'sample-concept', 'sample concept', true);
insert into public.sources (id, slug, title, publisher, url, license, published) values
  ('00000000-0000-4000-8000-0000000000a1', 'sample-book', 'a sample book', 'sample publisher',
   'https://example.com/book', 'CC BY 4.0', true);
insert into public.items (id, concept_id, type) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 'single');
insert into public.item_versions (id, item_id, version, stem, source_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 1, 'sample stem',
   '00000000-0000-4000-8000-0000000000a1');
insert into public.item_choices (item_version_id, choice_id, text) values
  ('00000000-0000-4000-8000-0000000000f1', 'a', 'sample a'), ('00000000-0000-4000-8000-0000000000f1', 'b', 'sample b');
insert into public.item_answers (item_version_id, choice_id, is_correct, rationale) values
  ('00000000-0000-4000-8000-0000000000f1', 'a', true, 'sample why a'),
  ('00000000-0000-4000-8000-0000000000f1', 'b', false, 'sample why b');
update public.item_versions set status = 'published' where id = '00000000-0000-4000-8000-0000000000f1';

-- Both students have rows in every table that holds a student's rows (their profiles came with their accounts).
update public.profiles set display_name = 'student ' || right(id::text, 1);
insert into public.attempts (user_id, item_version_id, picked, correct)
  select u, '00000000-0000-4000-8000-0000000000f1', array['a'], true
  from unnest(array['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']::uuid[]) u,
       generate_series(1, 2);
insert into public.review_state (user_id, item_id, level, last_reviewed, next_review)
  select u, '00000000-0000-4000-8000-0000000000e1', 1, current_date, current_date + 3
  from unnest(array['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']::uuid[]) u;
insert into public.exam_plans (user_id, course, exam_date)
  select u, c, current_date + 30
  from unnest(array['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']::uuid[]) u,
       unnest(array['fundamentals', 'med-surg-1']) c;
insert into public.flags (user_id, page, item_id, item_version_id, reason, comment)
  select u, '/learn/sample', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1', 'typo', 'sample'
  from unnest(array['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']::uuid[]) u;
-- Both are on the admin list too (Task 65), only so this test covers that table; deleting an account removes it.
insert into public.admins (user_id)
  select u from unnest(array['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']::uuid[]) u;
insert into public.study_events (user_id, item_id, item_version_id, kind, ms_on_item, at)
  select u, '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1', 'answered', 1000,
         now() - make_interval(mins => n)
  from unnest(array['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']::uuid[]) u,
       generate_series(1, 3) n;

-- How many rows one person has in each table that references auth.users, found from the foreign keys themselves, so a
-- table added later is counted without changing this function.
create function pg_temp.rows_for(p_uid uuid)
returns table (relation text, n bigint)
language plpgsql
as $f$
declare
  r record;
begin
  for r in
    select ns.nspname, cl.relname, a.attname
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and ns.nspname = 'public'
    order by cl.relname
  loop
    relation := r.nspname || '.' || r.relname;
    execute format('select count(*) from %I.%I where %I = $1', r.nspname, r.relname, r.attname) into n using p_uid;
    return next;
  end loop;
end
$f$;

-- Signs in as one student for the rest of the transaction, with a token issued `age` seconds ago (null: no iat claim).
-- delete_my_account needs a token from the last 10 minutes (20261102160000_fresh_sign_in_and_name_rules.sql).
create function pg_temp.sign_in(p_uid uuid, age integer)
returns void
language sql
as $f$
  select set_config('request.jwt.claims',
    (jsonb_build_object('sub', p_uid, 'role', 'authenticated')
      || case when age is null then '{}'::jsonb
              else jsonb_build_object('iat', extract(epoch from now())::bigint - age) end)::text, true),
    set_config('request.jwt.claim.sub', p_uid::text, true);
$f$;

-- ---- Who may do what.
select ok(
  has_function_privilege('authenticated', 'public.delete_my_account()', 'execute')
    and not has_function_privilege('anon', 'public.delete_my_account()', 'execute'),
  'signed-in students can run delete_my_account and signed-out visitors cannot'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.delete_my_account()'::regprocedure)
    and (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.delete_my_account()'::regprocedure),
  'delete_my_account is security definer with an empty search_path'
);
select results_eq(
  $$ select pg_get_function_identity_arguments('public.delete_my_account()'::regprocedure) $$,
  $$ values ('') $$, 'it takes no arguments, so a caller can never name another account'
);

-- ---- Every table that holds a student's rows goes with the account.
-- The tables that reference auth.users. A migration that adds one must add it here and seed a row for it above, so a
-- reviewer sees that delete-my-account covers it.
select results_eq(
  $$ select array_agg(relation order by relation) from pg_temp.rows_for('00000000-0000-4000-8000-000000000001') $$,
  $$ values (array['public.admins', 'public.attempts', 'public.exam_plans', 'public.flags', 'public.profiles', 'public.review_state',
                   'public.study_events']) $$,
  'the tables that reference auth.users are exactly the ones this test covers'
);
select is_empty(
  $$ select c.conrelid::regclass::text || ' ' || c.conname
     from pg_constraint c
     join pg_class cl on cl.oid = c.conrelid
     join pg_namespace ns on ns.oid = cl.relnamespace
     where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and ns.nspname = 'public'
       and (c.confdeltype <> 'c' or cardinality(c.conkey) <> 1) $$,
  'every foreign key from public to auth.users is one column and deletes with the account (on delete cascade)'
);
select is_empty(
  $$ select relation from pg_temp.rows_for('00000000-0000-4000-8000-000000000001') where n = 0
     union all
     select relation from pg_temp.rows_for('00000000-0000-4000-8000-000000000002') where n = 0 $$,
  'before: both students have rows in every one of those tables'
);

-- ---- Signed out.
set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';
set local "request.jwt.claim.sub" to '';
select throws_ok(
  $$ select public.delete_my_account() $$, '42501', null, 'a signed-out visitor cannot run delete_my_account'
);

-- The authenticated role with no student in the request (no sub) is refused by the function itself.
set local role authenticated;
set local "request.jwt.claims" to '{"role": "authenticated"}';
set local "request.jwt.claim.sub" to '';
select throws_ok(
  $$ select public.delete_my_account() $$, '28000', 'sign in to delete your account',
  'with no one signed in it refuses, with a plain message'
);

reset role;
select results_eq(
  $$ select count(*)::int from auth.users $$, $$ values (2) $$, 'a refused call deletes no account'
);
select is_empty(
  $$ select relation from pg_temp.rows_for('00000000-0000-4000-8000-000000000001') where n = 0
     union all
     select relation from pg_temp.rows_for('00000000-0000-4000-8000-000000000002') where n = 0 $$,
  'and no rows'
);

-- ---- A sign-in older than 10 minutes, or a token with no usable iat, is refused (Task 302).
select pg_temp.sign_in('00000000-0000-4000-8000-000000000001', 601);
set local role authenticated;
select throws_ok(
  $$ select public.delete_my_account() $$, '28R01', 'please sign in again to delete your account',
  'a token issued just over 10 minutes ago is refused, with a plain message and its own code'
);
reset role;
select pg_temp.sign_in('00000000-0000-4000-8000-000000000001', 3600);
set local role authenticated;
select throws_ok(
  $$ select public.delete_my_account() $$, '28R01', 'please sign in again to delete your account',
  'an hour-old token (a copied one, still unexpired) is refused'
);
reset role;
select pg_temp.sign_in('00000000-0000-4000-8000-000000000001', null);
set local role authenticated;
select throws_ok(
  $$ select public.delete_my_account() $$, '28R01', 'please sign in again to delete your account',
  'a token with no iat claim is refused'
);
reset role;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated", "iat": "now"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.delete_my_account() $$, '28R01', 'please sign in again to delete your account',
  'an iat that is not a number is refused'
);
reset role;
select results_eq(
  $$ select count(*)::int from auth.users $$, $$ values (2) $$, 'a refused stale sign-in deletes no account'
);
select is_empty(
  $$ select relation from pg_temp.rows_for('00000000-0000-4000-8000-000000000001') where n = 0 $$,
  'and none of that student''s rows'
);
select ok(
  (select prosrc from pg_proc where oid = 'public.delete_my_account()'::regprocedure) like '%max_age_seconds constant integer := 600%',
  'the limit is 10 minutes'
);

-- ---- Student one deletes their account, signed in 9 minutes ago.
select pg_temp.sign_in('00000000-0000-4000-8000-000000000001', 540);
set local role authenticated;
select lives_ok($$ select public.delete_my_account() $$, 'a signed-in student with a recent sign-in can delete their own account');

reset role;
select is_empty(
  $$ select id from auth.users where id = '00000000-0000-4000-8000-000000000001' $$, 'their account is gone'
);
select is_empty(
  $$ select relation || ': ' || n from pg_temp.rows_for('00000000-0000-4000-8000-000000000001') where n <> 0 $$,
  'no row of theirs is left in any table that references auth.users'
);
select is_empty($$ select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000001' $$, 'their profile is gone');
select is_empty($$ select 1 from public.attempts where user_id = '00000000-0000-4000-8000-000000000001' $$, 'their attempts are gone');
select is_empty($$ select 1 from public.review_state where user_id = '00000000-0000-4000-8000-000000000001' $$, 'their review state is gone');
select is_empty($$ select 1 from public.exam_plans where user_id = '00000000-0000-4000-8000-000000000001' $$, 'their exam plans are gone');
select is_empty($$ select 1 from public.flags where user_id = '00000000-0000-4000-8000-000000000001' $$, 'the reports they sent are gone');
select is_empty($$ select 1 from public.study_events where user_id = '00000000-0000-4000-8000-000000000001' $$, 'their study events are gone');

-- ---- Student two is untouched.
select results_eq(
  $$ select relation, n::int from pg_temp.rows_for('00000000-0000-4000-8000-000000000002') order by relation $$,
  $$ values ('public.admins', 1), ('public.attempts', 2), ('public.exam_plans', 2), ('public.flags', 1), ('public.profiles', 1),
            ('public.review_state', 1), ('public.study_events', 3) $$,
  'another student keeps every row they had'
);
select results_eq(
  $$ select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000002' $$,
  $$ values ('student 2') $$, 'and their profile as it was'
);
select isnt_empty(
  $$ select id from auth.users where id = '00000000-0000-4000-8000-000000000002' $$, 'and their account'
);
select results_eq(
  $$ select (select count(*) from public.items)::int, (select count(*) from public.item_versions)::int,
            (select count(*) from public.item_answers)::int $$,
  $$ values (1, 1, 2) $$, 'the questions themselves are untouched'
);

-- ---- Running it again is safe.
set local role authenticated;
select lives_ok(
  $$ select public.delete_my_account() $$,
  'calling it again with the same (still unexpired) sign-in does not fail'
);
reset role;
select is_empty(
  $$ select relation || ': ' || n from pg_temp.rows_for('00000000-0000-4000-8000-000000000001') where n <> 0 $$,
  'and leaves nothing of theirs behind'
);
select results_eq(
  $$ select count(*)::int from auth.users $$, $$ values (1) $$, 'and deletes no other account'
);

-- ---- Student two deletes theirs too, with a token issued just now.
select pg_temp.sign_in('00000000-0000-4000-8000-000000000002', 0);
set local role authenticated;
select lives_ok($$ select public.delete_my_account() $$, 'a second student with a fresh token can delete their own account');
reset role;
select is_empty(
  $$ select relation || ': ' || n from pg_temp.rows_for('00000000-0000-4000-8000-000000000002') where n <> 0 $$,
  'and nothing of theirs is left either'
);

select * from finish();
rollback;
