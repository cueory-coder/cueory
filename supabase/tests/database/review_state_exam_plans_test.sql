-- Review state and exam plans (D-87): each student reads and writes only their own rows, only for published questions,
-- the shapes are checked, and signed-out visitors get nothing. Run by `supabase test db` on a throwaway local
-- database; the students and rows below exist only inside this test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'one@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'two@example.com');

-- A published question and a draft one.
insert into public.concepts (id, slug, title, published) values
  ('00000000-0000-4000-8000-0000000000c1', 'sample-concept', 'sample concept', true);
insert into public.sources (id, slug, title, publisher, url, license, published) values
  ('00000000-0000-4000-8000-0000000000a1', 'sample-book', 'a sample book', 'sample publisher',
   'https://example.com/book', 'CC BY 4.0', true);
insert into public.items (id, concept_id, type) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 'single'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c1', 'single');
insert into public.item_versions (id, item_id, version, stem, source_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 1, 'published stem',
   '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e2', 1, 'draft stem', null);
insert into public.item_choices (item_version_id, choice_id, text) values
  ('00000000-0000-4000-8000-0000000000f1', 'a', 'a'), ('00000000-0000-4000-8000-0000000000f1', 'b', 'b');
insert into public.item_answers (item_version_id, choice_id, is_correct, rationale) values
  ('00000000-0000-4000-8000-0000000000f1', 'a', true, 'ra'), ('00000000-0000-4000-8000-0000000000f1', 'b', false, 'rb');
update public.item_versions set status = 'published' where id = '00000000-0000-4000-8000-0000000000f1';

-- ---- Who is granted what.
select table_privs_are('public', 'review_state', 'anon', array[]::text[], 'visitors have no access to review state');
select table_privs_are('public', 'exam_plans', 'anon', array[]::text[], 'visitors have no access to exam plans');
select table_privs_are(
  'public', 'review_state', 'authenticated', array['DELETE', 'SELECT'], 'students have no table-wide write access to review state'
);
select column_privs_are(
  'public', 'review_state', 'user_id', 'authenticated', array['SELECT'],
  'a student can read but never set or change which student a row belongs to'
);
select column_privs_are(
  'public', 'review_state', 'item_id', 'authenticated', array['INSERT', 'SELECT'],
  'a student picks the question when adding a row but cannot move it later'
);
select column_privs_are(
  'public', 'review_state', 'level', 'authenticated', array['INSERT', 'SELECT', 'UPDATE'], 'a student can set and change the level'
);
select column_privs_are(
  'public', 'exam_plans', 'user_id', 'authenticated', array['SELECT'], 'a student cannot name the owner of an exam plan'
);
select column_privs_are(
  'public', 'exam_plans', 'exam_date', 'authenticated', array['INSERT', 'SELECT', 'UPDATE'], 'a student can set and change the exam date'
);
select column_privs_are(
  'public', 'exam_plans', 'course', 'authenticated', array['INSERT', 'SELECT'], 'a student picks the course once and cannot change it'
);

-- ---- Signed out.
set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';
set local "request.jwt.claim.sub" to '';
select throws_ok($$ select user_id from public.review_state $$, '42501', null, 'visitors cannot read review state');
select throws_ok($$ select user_id from public.exam_plans $$, '42501', null, 'visitors cannot read exam plans');
select throws_ok(
  $$ insert into public.exam_plans (course, exam_date) values ('med-surg-1', current_date + 30) $$,
  '42501', null, 'visitors cannot add an exam plan'
);

-- ---- Student one.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';

select lives_ok(
  $$ insert into public.review_state (item_id, level, last_reviewed, next_review)
     values ('00000000-0000-4000-8000-0000000000e1', 1, current_date, current_date + 3) $$,
  'a student can add review state for a published question'
);
select results_eq(
  $$ select user_id::text from public.review_state $$,
  $$ values ('00000000-0000-4000-8000-000000000001') $$,
  'the row is filled in with the signed-in student'
);
select lives_ok(
  $$ update public.review_state set level = 2, last_reviewed = current_date, next_review = current_date + 7
     where item_id = '00000000-0000-4000-8000-0000000000e1' $$,
  'a student can update their own level and dates'
);
select lives_ok(
  $$ insert into public.review_state (item_id, level, last_reviewed, next_review)
     values ('00000000-0000-4000-8000-0000000000e1', 0, current_date, current_date + 1)
     on conflict (user_id, item_id) do update
       set level = excluded.level, last_reviewed = excluded.last_reviewed, next_review = excluded.next_review $$,
  'a student can save progress with an upsert'
);
select results_eq(
  $$ select level::int from public.review_state $$, $$ values (0) $$, 'the upsert changed the one row, not added another'
);

-- Refused.
select throws_ok(
  $$ insert into public.review_state (item_id, level, last_reviewed, next_review)
     values ('00000000-0000-4000-8000-0000000000e2', 1, current_date, current_date + 3) $$,
  '42501', null, 'review state cannot be added for a question that is not published'
);
select throws_ok(
  $$ insert into public.review_state (item_id, level, last_reviewed, next_review)
     values ('00000000-0000-4000-8000-0000000000ff', 1, current_date, current_date + 3) $$,
  '42501', null, 'review state cannot be added for a made-up question, and the refusal looks the same'
);
select throws_ok(
  $$ insert into public.review_state (user_id, item_id, level, last_reviewed, next_review)
     values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000e1', 1, current_date, current_date + 3) $$,
  '42501', null, 'a student cannot add review state for another student'
);
select throws_ok(
  $$ update public.review_state set item_id = '00000000-0000-4000-8000-0000000000e2' $$,
  '42501', null, 'a student cannot move a row to another question'
);
select throws_ok(
  $$ update public.review_state set user_id = '00000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'a student cannot hand a row to another student'
);
select throws_ok(
  $$ update public.review_state set level = 4 $$, '23514', null, 'a level above 3 is refused'
);
select throws_ok(
  $$ update public.review_state set level = -1 $$, '23514', null, 'a negative level is refused'
);
select throws_ok(
  $$ update public.review_state set last_reviewed = current_date, next_review = current_date $$,
  '23514', null, 'a next review that is not after the last one is refused'
);
select throws_ok(
  $$ update public.review_state set last_reviewed = current_date, next_review = current_date + 400 $$,
  '23514', null, 'a next review more than a year out is refused'
);
select throws_ok(
  $$ update public.review_state set last_reviewed = current_date + 10, next_review = current_date + 20 $$,
  '23514', null, 'a last review in the future is refused'
);
select throws_ok(
  $$ update public.review_state set last_reviewed = current_date - 800, next_review = current_date - 799 $$,
  '23514', null, 'a last review years ago is refused'
);

-- Exam plans.
select lives_ok(
  $$ insert into public.exam_plans (course, exam_date) values ('med-surg-1', current_date + 40) $$,
  'a student can add an exam plan'
);
select throws_ok(
  $$ insert into public.exam_plans (course, exam_date) values ('med-surg-1', current_date + 50) $$,
  '23505', null, 'one plan per course'
);
select throws_ok(
  $$ insert into public.exam_plans (course, exam_date) values ('Bad Course', current_date + 50) $$,
  '23514', null, 'a course name must be short lowercase words'
);
select throws_ok(
  $$ insert into public.exam_plans (course, exam_date) values ('fundamentals', current_date - 30) $$,
  '23514', null, 'an exam date in the past is refused'
);
select throws_ok(
  $$ insert into public.exam_plans (course, exam_date) values ('fundamentals', current_date + 1000) $$,
  '23514', null, 'an exam date more than two years out is refused'
);
select lives_ok(
  $$ update public.exam_plans set exam_date = current_date + 60 where course = 'med-surg-1' $$,
  'a student can move their exam date'
);
select throws_ok(
  $$ update public.exam_plans set course = 'fundamentals' $$, '42501', null, 'a student cannot rename a plan''s course'
);
select throws_ok(
  $$ update public.exam_plans set user_id = '00000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'a student cannot hand a plan to another student'
);
select lives_ok(
  $$ insert into public.exam_plans (course, exam_date)
     select 'course-' || n, current_date + 10 from generate_series(1, 9) n $$,
  'a student can have ten plans'
);
select throws_ok(
  $$ insert into public.exam_plans (course, exam_date) values ('one-too-many', current_date + 10) $$,
  '54000', null, 'but not an eleventh'
);

-- ---- Student two sees and touches none of student one's rows.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select results_eq($$ select count(*)::int from public.review_state $$, $$ values (0) $$, 'another student sees no review state');
select results_eq($$ select count(*)::int from public.exam_plans $$, $$ values (0) $$, 'another student sees no exam plans');
select results_eq(
  $$ with changed as (update public.review_state set level = 3, next_review = current_date + 14 returning 1)
     select count(*)::int from changed $$,
  $$ values (0) $$, 'another student cannot change anyone else''s review state'
);
select results_eq(
  $$ with gone as (delete from public.exam_plans returning 1) select count(*)::int from gone $$,
  $$ values (0) $$, 'another student cannot delete anyone else''s exam plans'
);
select lives_ok(
  $$ insert into public.review_state (item_id, level, last_reviewed, next_review)
     values ('00000000-0000-4000-8000-0000000000e1', 3, current_date, current_date + 14) $$,
  'the second student has their own row for the same question'
);

-- ---- A student can forget their own progress.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
select results_eq(
  $$ with gone as (delete from public.review_state returning 1) select count(*)::int from gone $$,
  $$ values (1) $$, 'a student can delete their own review state'
);

-- ---- Deleting an account deletes its progress.
reset role;
delete from auth.users where id = '00000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select count(*)::int from public.exam_plans where user_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values (0) $$, 'deleting an account deletes its exam plans'
);
select results_eq(
  $$ select count(*)::int from public.review_state $$, $$ values (1) $$,
  'and only that student''s review state; the other student keeps theirs'
);
select ok(
  not has_function_privilege('anon', 'public.review_state_guard()', 'execute')
    and not has_function_privilege('authenticated', 'public.review_state_guard()', 'execute')
    and not has_function_privilege('anon', 'public.exam_plans_guard()', 'execute')
    and not has_function_privilege('authenticated', 'public.exam_plans_guard()', 'execute'),
  'nobody on the website runs the guard functions directly'
);

select * from finish();
rollback;
