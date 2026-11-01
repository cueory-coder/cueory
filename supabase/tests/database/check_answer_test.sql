-- check_answer and attempts (D-86): only a signed-in student can check, bad input is refused before anything is
-- recorded or revealed, select-all is all-or-nothing, the key comes back only after an attempt, each student sees only
-- their own attempts, and the hourly limit holds. Run by `supabase test db` on a throwaway local database.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- Two students, as Supabase Auth would create them.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'one@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'two@example.com'),
  ('00000000-0000-4000-8000-000000000003', 'three@example.com');

insert into public.concepts (id, slug, title, published) values
  ('00000000-0000-4000-8000-0000000000c1', 'sample-concept', 'sample concept', true);
insert into public.sources (id, slug, title, publisher, url, license, published) values
  ('00000000-0000-4000-8000-0000000000a1', 'sample-book', 'a sample book', 'sample publisher',
   'https://example.com/book', 'CC BY 4.0', true);
insert into public.items (id, concept_id, type) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 'single'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c1', 'sata'),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000c1', 'single');

-- Item 1: single, published; the right choice is "a".
insert into public.item_versions (id, item_id, version, stem, source_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 1, 'single stem',
   '00000000-0000-4000-8000-0000000000a1');
insert into public.item_choices (item_version_id, choice_id, text) values
  ('00000000-0000-4000-8000-0000000000f1', 'a', 'one a'), ('00000000-0000-4000-8000-0000000000f1', 'b', 'one b'),
  ('00000000-0000-4000-8000-0000000000f1', 'c', 'one c');
insert into public.item_answers (item_version_id, choice_id, is_correct, rationale) values
  ('00000000-0000-4000-8000-0000000000f1', 'a', true, 'why a is right'),
  ('00000000-0000-4000-8000-0000000000f1', 'b', false, 'why b is not'),
  ('00000000-0000-4000-8000-0000000000f1', 'c', false, 'why c is not');
update public.item_versions set status = 'published' where id = '00000000-0000-4000-8000-0000000000f1';

-- Item 2: select-all, published; the right choices are "a" and "c".
insert into public.item_versions (id, item_id, version, stem, source_id) values
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e2', 1, 'select-all stem',
   '00000000-0000-4000-8000-0000000000a1');
insert into public.item_choices (item_version_id, choice_id, text) values
  ('00000000-0000-4000-8000-0000000000f2', 'a', 'two a'), ('00000000-0000-4000-8000-0000000000f2', 'b', 'two b'),
  ('00000000-0000-4000-8000-0000000000f2', 'c', 'two c'), ('00000000-0000-4000-8000-0000000000f2', 'd', 'two d');
insert into public.item_answers (item_version_id, choice_id, is_correct, rationale) values
  ('00000000-0000-4000-8000-0000000000f2', 'a', true, 'two why a'), ('00000000-0000-4000-8000-0000000000f2', 'b', false, 'two why b'),
  ('00000000-0000-4000-8000-0000000000f2', 'c', true, 'two why c'), ('00000000-0000-4000-8000-0000000000f2', 'd', false, 'two why d');
update public.item_versions set status = 'published' where id = '00000000-0000-4000-8000-0000000000f2';

-- Item 3: still a draft, so it cannot be answered.
insert into public.item_versions (id, item_id, version, stem) values
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000e3', 1, 'draft stem');

-- ---- Who may run it.
select ok(
  has_function_privilege('authenticated', 'public.check_answer(uuid, text[])', 'execute')
    and not has_function_privilege('anon', 'public.check_answer(uuid, text[])', 'execute'),
  'signed-in students can run check_answer and signed-out visitors cannot'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.check_answer(uuid, text[])'::regprocedure)
    and (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.check_answer(uuid, text[])'::regprocedure),
  'check_answer is security definer with an empty search_path'
);
select table_privs_are('public', 'attempts', 'anon', array[]::text[], 'visitors have no access to attempts');
select table_privs_are('public', 'attempts', 'authenticated', array['SELECT'], 'students can only read attempts');

-- ---- Signed out.
set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';
set local "request.jwt.claim.sub" to '';

select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', array['a']) $$,
  '42501', null, 'a signed-out visitor cannot run check_answer'
);
select throws_ok($$ select id from public.attempts $$, '42501', null, 'a signed-out visitor cannot read attempts');

-- ---- Signed in as student one.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', array['a'])->>'correct' $$,
  $$ values ('true') $$, 'the right single answer is marked right'
);
select results_eq(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', array['b'])->>'correct' $$,
  $$ values ('false') $$, 'a wrong single answer is marked wrong'
);
select results_eq(
  $$ select (public.check_answer('00000000-0000-4000-8000-0000000000e1', array['c'])->'key')::text $$,
  $$ values ('["a"]') $$, 'the key comes back after an attempt, even a wrong one'
);
select results_eq(
  $$ select (public.check_answer('00000000-0000-4000-8000-0000000000e1', array['a'])->'rationales'->>'b') $$,
  $$ values ('why b is not') $$, 'every choice''s rationale comes back after an attempt'
);
select results_eq(
  $$ select (public.check_answer('00000000-0000-4000-8000-0000000000e1', array['a'])->>'version_id')::uuid $$,
  $$ values ('00000000-0000-4000-8000-0000000000f1'::uuid) $$, 'the answer says which version it checked'
);

-- Select-all is all-or-nothing, in any order.
select results_eq(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e2', array['a', 'c'])->>'correct' $$,
  $$ values ('true') $$, 'select-all: exactly the right set is right'
);
select results_eq(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e2', array['c', 'a'])->>'correct' $$,
  $$ values ('true') $$, 'select-all: the order of the picks does not matter'
);
select results_eq(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e2', array['a'])->>'correct' $$,
  $$ values ('false') $$, 'select-all: part of the right set is wrong'
);
select results_eq(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e2', array['a', 'b', 'c'])->>'correct' $$,
  $$ values ('false') $$, 'select-all: the right set plus a wrong choice is wrong'
);
select results_eq(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e2', array['b', 'd'])->>'correct' $$,
  $$ values ('false') $$, 'select-all: only wrong choices is wrong'
);

-- That is 10 successful checks so far; refused calls below must record none.
select results_eq(
  $$ select count(*)::int from public.attempts $$, $$ values (10) $$, 'every checked answer is recorded for the student'
);
-- Both the "a, c" and the "c, a" check are stored as {a,c}: one distinct row, whatever order they came in. (Not "the
-- first row": inside one transaction every created_at is the same, so there is no first.)
select results_eq(
  $$ select distinct picked::text from public.attempts
     where item_version_id = '00000000-0000-4000-8000-0000000000f2' and picked @> array['a', 'c'] and cardinality(picked) = 2 $$,
  $$ values ('{a,c}') $$, 'the picks are recorded in sorted order'
);

-- Refused before anything is recorded or revealed.
select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e3', array['a']) $$,
  'P0002', null, 'an item with no published version cannot be answered'
);
select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000ff', array['a']) $$,
  'P0002', null, 'an unknown item cannot be answered'
);
select throws_ok(
  $$ select public.check_answer(null, array['a']) $$, '22023', null, 'no item is refused'
);
select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', null) $$, '22023', null, 'no picks is refused'
);
select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', array[]::text[]) $$,
  '22023', null, 'an empty pick is refused'
);
select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e2', array['a', 'a']) $$,
  '22023', null, 'the same choice twice is refused'
);
select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', array['d']) $$,
  '22023', null, 'a choice the question does not have is refused'
);
select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', array['a', null]) $$,
  '22023', null, 'a null pick is refused'
);
select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', array['a', 'b']) $$,
  '22023', null, 'two picks for a single-answer question are refused'
);
select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', array['a', 'b', 'c', 'd', 'e', 'f']) $$,
  '22023', null, 'more than five picks are refused'
);
select results_eq(
  $$ select count(*)::int from public.attempts $$, $$ values (10) $$, 'refused calls recorded nothing'
);

-- Attempts belong to the student, and only check_answer writes them.
select throws_ok(
  $$ insert into public.attempts (user_id, item_version_id, picked, correct)
     values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000f1', array['a'], true) $$,
  '42501', null, 'a student cannot write an attempt directly'
);
select throws_ok(
  $$ update public.attempts set correct = true $$, '42501', null, 'a student cannot change an attempt'
);
select throws_ok(
  $$ delete from public.attempts $$, '42501', null, 'a student cannot delete an attempt'
);
select throws_ok(
  $$ select is_correct from public.item_answers $$, '42501', null, 'a student still cannot read the key directly'
);

-- ---- Student two sees only their own attempts.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';

select results_eq(
  $$ select count(*)::int from public.attempts $$, $$ values (0) $$, 'a student does not see anyone else''s attempts'
);
select lives_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', array['a']) $$, 'a second student can check'
);
select results_eq(
  $$ select count(*)::int from public.attempts $$, $$ values (1) $$, 'and sees only their own attempt'
);

-- ---- The hourly limit (200 a person), counted from the student's own attempts.
reset role;
insert into public.attempts (user_id, item_version_id, picked, correct, created_at)
  select '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000f1', array['a'], true,
         now() - (n || ' seconds')::interval
  from generate_series(1, 198) n;
select results_eq(
  $$ select count(*)::int from public.attempts where user_id = '00000000-0000-4000-8000-000000000002' $$,
  $$ values (199) $$, 'student two is one check short of the limit'
);
set local role authenticated;
select lives_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', array['a']) $$,
  'the 200th check in an hour is allowed'
);
select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', array['a']) $$,
  '54000', null, 'the 201st check in an hour is refused'
);
select results_eq(
  $$ select count(*)::int from public.attempts $$, $$ values (200) $$, 'the refused check recorded nothing'
);

-- Other students are not affected, and old attempts stop counting after an hour.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
select lives_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', array['a']) $$,
  'one student being at the limit does not stop another'
);
reset role;
insert into public.attempts (user_id, item_version_id, picked, correct, created_at)
  select '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000f1', array['a'], true,
         now() - interval '2 hours'
  from generate_series(1, 250);
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000003", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000003';
select lives_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', array['a']) $$,
  'attempts older than an hour do not count toward the limit'
);

-- ---- Deleting an account deletes its attempts.
reset role;
delete from auth.users where id = '00000000-0000-4000-8000-000000000003';
select results_eq(
  $$ select count(*)::int from public.attempts where user_id = '00000000-0000-4000-8000-000000000003' $$,
  $$ values (0) $$, 'deleting an account deletes its attempts'
);

select * from finish();
rollback;
