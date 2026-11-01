-- "Flag or comment" reports (D-88): the table is closed to every website role, only a signed-in student can send a
-- report through submit_flag, everything is checked before anything is written, and the limits hold. Run by
-- `supabase test db` on a throwaway local database; the students and rows below exist only inside this test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'one@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'two@example.com'),
  ('00000000-0000-4000-8000-000000000003', 'three@example.com');

-- A published question, so a report can name its item and version.
insert into public.concepts (id, slug, title, published) values
  ('00000000-0000-4000-8000-0000000000c1', 'sample-concept', 'sample concept', true);
insert into public.sources (id, slug, title, publisher, url, license, published) values
  ('00000000-0000-4000-8000-0000000000a1', 'sample-book', 'a sample book', 'sample publisher',
   'https://example.com/book', 'CC BY 4.0', true);
insert into public.items (id, concept_id, type) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 'single'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c1', 'single');
insert into public.item_versions (id, item_id, version, stem, source_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 1, 'stem one',
   '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e2', 1, 'stem two',
   '00000000-0000-4000-8000-0000000000a1');

-- ---- Who may do what.
select table_privs_are('public', 'flags', 'anon', array[]::text[], 'visitors have no access to flags');
select table_privs_are('public', 'flags', 'authenticated', array[]::text[], 'students have no access to flags, not even their own');
select ok(
  has_function_privilege('authenticated', 'public.submit_flag(text, uuid, uuid, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.submit_flag(text, uuid, uuid, text, text)', 'execute'),
  'signed-in students can run submit_flag and signed-out visitors cannot'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.submit_flag(text, uuid, uuid, text, text)'::regprocedure)
    and (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.submit_flag(text, uuid, uuid, text, text)'::regprocedure),
  'submit_flag is security definer with an empty search_path'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'flags'
      and permissive = 'RESTRICTIVE' and cmd = 'ALL'
      and roles @> array['anon', 'authenticated']::name[] and cardinality(roles) = 2
      and qual = 'false' and with_check = 'false'
  ),
  'flags have an explicit policy that refuses every website role'
);

-- ---- Signed out.
set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';
set local "request.jwt.claim.sub" to '';
select throws_ok(
  $$ select public.submit_flag('/learn/study-skills', null, null, 'typo', 'x') $$,
  '42501', null, 'a signed-out visitor cannot send a report'
);
select throws_ok($$ select id from public.flags $$, '42501', null, 'a signed-out visitor cannot read flags');

-- ---- Student one.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';

select lives_ok(
  $$ select public.submit_flag('/learn/study-skills/cards', null, null, 'typo', 'a typo on card two') $$,
  'a student can report a page'
);
select lives_ok(
  $$ select public.submit_flag('/learn/study-skills/questions', '00000000-0000-4000-8000-0000000000e1',
                               '00000000-0000-4000-8000-0000000000f1', 'wrong-fact', null) $$,
  'a student can report a question with its item and version, and no comment'
);
select results_eq(
  $$ select pg_typeof(public.submit_flag('/privacy', null, null, 'other', '  spaces around  '))::text $$,
  $$ values ('uuid') $$, 'it answers with the report''s id'
);

-- The table stays closed, even for the student's own reports.
select throws_ok($$ select id from public.flags $$, '42501', null, 'a student cannot read flags, not even their own');
select throws_ok(
  $$ insert into public.flags (user_id, page, reason) values ('00000000-0000-4000-8000-000000000001', '/x', 'typo') $$,
  '42501', null, 'a student cannot write a flag directly'
);
select throws_ok($$ update public.flags set status = 'handled' $$, '42501', null, 'a student cannot mark a flag handled');
select throws_ok($$ delete from public.flags $$, '42501', null, 'a student cannot delete a flag');

-- What was stored (read as the owner).
reset role;
select results_eq(
  $$ select reason, comment, status, user_id::text from public.flags where page = '/learn/study-skills/cards' $$,
  $$ values ('typo', 'a typo on card two', 'open', '00000000-0000-4000-8000-000000000001') $$,
  'the report is stored as sent, with the student it came from'
);
select results_eq(
  $$ select comment from public.flags where page = '/privacy' $$, $$ values ('spaces around') $$,
  'spaces around a comment are trimmed'
);
select results_eq(
  $$ select item_id::text, item_version_id::text from public.flags where page = '/learn/study-skills/questions' $$,
  $$ values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1') $$,
  'the item and version are attached'
);
select results_eq(
  $$ select status from public.flags where page = '/learn/study-skills/questions' $$, $$ values ('open') $$,
  'a new report starts open, for the admin inbox'
);
set local role authenticated;

-- ---- Refused before anything is written.
select throws_ok(
  $$ select public.submit_flag('/p', null, null, 'rude', 'x') $$, '22023', null, 'a reason that is not on the list is refused'
);
select throws_ok(
  $$ select public.submit_flag('/p', null, null, null, 'x') $$, '22023', null, 'no reason is refused'
);
select throws_ok(
  $$ select public.submit_flag('https://evil.example/x', null, null, 'typo', 'x') $$,
  '22023', null, 'a page on another site is refused'
);
select throws_ok(
  $$ select public.submit_flag('//evil.example/x', null, null, 'typo', 'x') $$,
  '22023', null, 'a protocol-relative address is refused'
);
select throws_ok(
  $$ select public.submit_flag('learn/study-skills', null, null, 'typo', 'x') $$,
  '22023', null, 'a page that does not start with a slash is refused'
);
select throws_ok(
  $$ select public.submit_flag('/a b', null, null, 'typo', 'x') $$, '22023', null, 'a page with a space is refused'
);
select throws_ok(
  $$ select public.submit_flag('/a?x=<script>', null, null, 'typo', 'x') $$, '22023', null, 'a page with a query or markup is refused'
);
select throws_ok(
  $$ select public.submit_flag('/' || repeat('a', 200), null, null, 'typo', 'x') $$, '22023', null, 'a page over 200 characters is refused'
);
select throws_ok(
  $$ select public.submit_flag(null, null, null, 'typo', 'x') $$, '22023', null, 'no page is refused'
);
select throws_ok(
  $$ select public.submit_flag('/p', null, null, 'typo', repeat('a', 1001)) $$, '22023', null, 'a comment over 1,000 characters is refused'
);
select throws_ok(
  $$ select public.submit_flag('/p', null, null, 'typo', E'bad \x07 comment') $$, '22023', null, 'a comment with control characters is refused'
);
select throws_ok(
  $$ select public.submit_flag('/p', '00000000-0000-4000-8000-0000000000e1', null, 'typo', 'x') $$,
  '22023', null, 'an item without its version is refused'
);
select throws_ok(
  $$ select public.submit_flag('/p', null, '00000000-0000-4000-8000-0000000000f1', 'typo', 'x') $$,
  '22023', null, 'a version without its item is refused'
);
select throws_ok(
  $$ select public.submit_flag('/p', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f2', 'typo', 'x') $$,
  '22023', null, 'a version of a different item is refused'
);
select throws_ok(
  $$ select public.submit_flag('/p', '00000000-0000-4000-8000-0000000000ff', '00000000-0000-4000-8000-0000000000fe', 'typo', 'x') $$,
  '22023', 'that question was not found', 'an unknown question gets the same plain answer'
);
select lives_ok(
  $$ select public.submit_flag('/p', null, null, 'typo', repeat('a', 1000)) $$, 'a comment of exactly 1,000 characters is allowed'
);
select lives_ok(
  $$ select public.submit_flag('/p', null, null, 'broken', '   ') $$, 'an empty comment is allowed and stored as no comment'
);

-- Student one has sent five reports (three above, the 1,000-character one and the blank one): the hourly limit.
reset role;
select results_eq(
  $$ select count(*)::int from public.flags where user_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values (5) $$, 'refused reports wrote nothing: five accepted, at the hourly limit'
);
set local role authenticated;
select throws_ok(
  $$ select public.submit_flag('/p', null, null, 'typo', 'one too many') $$,
  '54000', null, 'the sixth report in an hour is refused'
);

-- ---- Another student is not affected; old reports stop counting; the daily cap holds.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select lives_ok(
  $$ select public.submit_flag('/p', null, null, 'typo', 'student two is fine') $$,
  'one student being at the limit does not stop another'
);

reset role;
insert into public.flags (user_id, page, reason, created_at)
  select '00000000-0000-4000-8000-000000000003', '/old', 'typo', now() - interval '2 hours' from generate_series(1, 10);
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000003", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000003';
select lives_ok(
  $$ select public.submit_flag('/p', null, null, 'typo', 'old reports do not count toward the hour') $$,
  'reports older than an hour do not count toward the hourly limit'
);
reset role;
insert into public.flags (user_id, page, reason, created_at)
  select '00000000-0000-4000-8000-000000000003', '/old', 'typo', now() - interval '3 hours' from generate_series(1, 9);
set local role authenticated;
select throws_ok(
  $$ select public.submit_flag('/p', null, null, 'typo', 'the twenty-first today') $$,
  '54000', null, 'twenty reports in a day is the most, whatever the hour'
);

-- ---- The admin inbox rules (as the owner).
reset role;
select throws_ok(
  $$ update public.flags set status = 'handled' where id = (select id from public.flags limit 1) $$,
  '23514', null, 'a handled report must say when it was handled'
);
select lives_ok(
  $$ update public.flags set status = 'handled', handled_at = now() where id = (select id from public.flags limit 1) $$,
  'the admin can mark a report handled'
);

-- ---- Deleting an account deletes its reports.
delete from auth.users where id = '00000000-0000-4000-8000-000000000003';
select results_eq(
  $$ select count(*)::int from public.flags where user_id = '00000000-0000-4000-8000-000000000003' $$,
  $$ values (0) $$, 'deleting an account deletes its reports'
);
select results_eq(
  $$ select count(*)::int from public.flags where user_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values (5) $$, 'and only that student''s reports'
);

select * from finish();
rollback;
