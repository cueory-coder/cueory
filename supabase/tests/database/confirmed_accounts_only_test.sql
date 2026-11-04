-- Confirmed accounts only (Task 169): check_answer, submit_flag and record_study_events refuse a signed-in caller
-- whose email is not confirmed or who is anonymous, before checking anything else or recording anything, and still
-- work for a confirmed student. Run by `supabase test db` on a throwaway local database.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Accounts, as Supabase Auth would create them. Students three and four each have only one of the two anonymous
-- marks, so each mark is shown to be enough on its own.
insert into auth.users (id, email, email_confirmed_at, is_anonymous) values
  -- One: a confirmed student.
  ('00000000-0000-4000-8000-000000000001', 'one@example.com', now(), false),
  -- Two: signed up but has not confirmed the email yet.
  ('00000000-0000-4000-8000-000000000002', 'two@example.com', null, false),
  -- Three: marked anonymous in auth.users (the email is confirmed here only to test that mark alone).
  ('00000000-0000-4000-8000-000000000003', 'three@example.com', now(), true),
  -- Four: confirmed in auth.users; the anonymous mark comes only from the JWT below.
  ('00000000-0000-4000-8000-000000000004', 'four@example.com', now(), false),
  -- Five: a real anonymous sign-in, with no email at all.
  ('00000000-0000-4000-8000-000000000005', null, null, true);

insert into public.concepts (id, slug, title, published) values
  ('00000000-0000-4000-8000-0000000000c1', 'sample-concept', 'sample concept', true);
insert into public.sources (id, slug, title, publisher, url, license, published) values
  ('00000000-0000-4000-8000-0000000000a1', 'sample-book', 'a sample book', 'sample publisher',
   'https://example.com/book', 'CC BY 4.0', true);
insert into public.items (id, concept_id, type) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 'single');
-- A single-answer sample question, published; the right choice is "a".
insert into public.item_versions (id, item_id, version, stem, source_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 1, 'single stem',
   '00000000-0000-4000-8000-0000000000a1');
insert into public.item_choices (item_version_id, choice_id, text) values
  ('00000000-0000-4000-8000-0000000000f1', 'a', 'one a'), ('00000000-0000-4000-8000-0000000000f1', 'b', 'one b');
insert into public.item_answers (item_version_id, choice_id, is_correct, rationale) values
  ('00000000-0000-4000-8000-0000000000f1', 'a', true, 'why a is right'),
  ('00000000-0000-4000-8000-0000000000f1', 'b', false, 'why b is not');
update public.item_versions set status = 'published' where id = '00000000-0000-4000-8000-0000000000f1';

-- One study event for the sample question, timed now (the database clock, in UTC).
select set_config('t.events', jsonb_build_array(jsonb_build_object(
  'item_id', '00000000-0000-4000-8000-0000000000e1', 'version_id', '00000000-0000-4000-8000-0000000000f1',
  'kind', 'answered', 'ms_on_item', 1000,
  'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))::text, true);

-- ---- The functions keep their grants and settings.
select ok(
  has_function_privilege('authenticated', 'public.check_answer(uuid, uuid, text[])', 'execute')
    and not has_function_privilege('anon', 'public.check_answer(uuid, uuid, text[])', 'execute'),
  'signed-in students can still run check_answer and signed-out visitors cannot'
);
select ok(
  has_function_privilege('authenticated', 'public.submit_flag(text, uuid, uuid, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.submit_flag(text, uuid, uuid, text, text)', 'execute'),
  'signed-in students can still run submit_flag and signed-out visitors cannot'
);
select ok(
  has_function_privilege('authenticated', 'public.record_study_events(jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.record_study_events(jsonb)', 'execute'),
  'signed-in students can still run record_study_events and signed-out visitors cannot'
);
select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
     from pg_proc p
     where p.oid in ('public.check_answer(uuid, uuid, text[])'::regprocedure,
                     'public.submit_flag(text, uuid, uuid, text, text)'::regprocedure,
                     'public.record_study_events(jsonb)'::regprocedure)),
  'all three are still security definer with an empty search_path'
);
select ok(
  (select p.prosrc like '%hashtextextended(''check_answer:'' || uid::text, 0)%'
     from pg_proc p where p.oid = 'public.check_answer(uuid, uuid, text[])'::regprocedure),
  'check_answer''s lock key has its own prefix, like the other functions'' keys'
);

-- ---- Signed in with no user id: the signed-out messages are unchanged and still come first.
set local role authenticated;
set local "request.jwt.claims" to '{"role": "authenticated"}';
set local "request.jwt.claim.sub" to '';

select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1', array['a']) $$,
  '28000', 'sign in to check an answer', 'with no user id, check_answer still asks to sign in'
);
select throws_ok(
  $$ select public.submit_flag('/learn/sample', null, null, 'typo', null) $$,
  '28000', 'sign in to send a report', 'with no user id, submit_flag still asks to sign in'
);
select throws_ok(
  $$ select public.record_study_events(current_setting('t.events')::jsonb) $$,
  '28000', 'sign in to record study activity', 'with no user id, record_study_events still asks to sign in'
);

-- ---- Student two: email not confirmed.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';

select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1', array['a']) $$,
  '28000', 'confirm your email to use this', 'an unconfirmed student cannot check an answer'
);
select throws_ok(
  $$ select public.check_answer(null, null, null) $$,
  '28000', 'confirm your email to use this', 'an unconfirmed student is refused before their input is checked'
);
select throws_ok(
  $$ select public.submit_flag('/learn/sample', null, null, 'typo', null) $$,
  '28000', 'confirm your email to use this', 'an unconfirmed student cannot send a report'
);
select throws_ok(
  $$ select public.record_study_events(current_setting('t.events')::jsonb) $$,
  '28000', 'confirm your email to use this', 'an unconfirmed student cannot record study events'
);

-- ---- Student three: marked anonymous in auth.users.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000003", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000003';

select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1', array['a']) $$,
  '28000', 'confirm your email to use this', 'an account marked anonymous in auth.users cannot check an answer'
);
select throws_ok(
  $$ select public.submit_flag('/learn/sample', null, null, 'typo', null) $$,
  '28000', 'confirm your email to use this', 'an account marked anonymous in auth.users cannot send a report'
);
select throws_ok(
  $$ select public.record_study_events(current_setting('t.events')::jsonb) $$,
  '28000', 'confirm your email to use this', 'an account marked anonymous in auth.users cannot record study events'
);

-- ---- Student four: the JWT says anonymous.
set local "request.jwt.claims" to
  '{"sub": "00000000-0000-4000-8000-000000000004", "role": "authenticated", "is_anonymous": true}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000004';

select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1', array['a']) $$,
  '28000', 'confirm your email to use this', 'a JWT with is_anonymous cannot check an answer'
);
select throws_ok(
  $$ select public.submit_flag('/learn/sample', null, null, 'typo', null) $$,
  '28000', 'confirm your email to use this', 'a JWT with is_anonymous cannot send a report'
);
select throws_ok(
  $$ select public.record_study_events(current_setting('t.events')::jsonb) $$,
  '28000', 'confirm your email to use this', 'a JWT with is_anonymous cannot record study events'
);

-- ---- Student five: a real anonymous sign-in (both marks, no email).
set local "request.jwt.claims" to
  '{"sub": "00000000-0000-4000-8000-000000000005", "role": "authenticated", "is_anonymous": true}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000005';

select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1', array['a']) $$,
  '28000', 'confirm your email to use this', 'an anonymous sign-in cannot check an answer'
);
select throws_ok(
  $$ select public.submit_flag('/learn/sample', null, null, 'typo', null) $$,
  '28000', 'confirm your email to use this', 'an anonymous sign-in cannot send a report'
);
select throws_ok(
  $$ select public.record_study_events(current_setting('t.events')::jsonb) $$,
  '28000', 'confirm your email to use this', 'an anonymous sign-in cannot record study events'
);

-- ---- A user id with no account behind it (for example, deleted since the JWT was issued).
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000006", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000006';

select throws_ok(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1', array['a']) $$,
  '28000', 'confirm your email to use this', 'a user id with no account cannot check an answer'
);

-- ---- Student one: confirmed, so everything still works.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1', array['a'])->>'correct' $$,
  $$ values ('true') $$, 'a confirmed student can still check an answer'
);
select isnt(
  public.submit_flag('/learn/sample', null, null, 'typo', null), null,
  'a confirmed student can still send a report'
);
select results_eq(
  $$ select public.record_study_events(current_setting('t.events')::jsonb) $$,
  $$ values (1) $$, 'a confirmed student can still record study events'
);

-- ---- Nothing was recorded for any refused caller.
reset role;
select results_eq(
  $$ select count(*)::int from public.attempts where user_id <> '00000000-0000-4000-8000-000000000001' $$,
  $$ values (0) $$, 'no attempt was recorded for a refused caller'
);
select results_eq(
  $$ select count(*)::int from public.flags where user_id <> '00000000-0000-4000-8000-000000000001' $$,
  $$ values (0) $$, 'no report was recorded for a refused caller'
);
select results_eq(
  $$ select count(*)::int from public.study_events where user_id <> '00000000-0000-4000-8000-000000000001' $$,
  $$ values (0) $$, 'no study event was recorded for a refused caller'
);

-- ---- Once student two confirms the email, they can check answers.
update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-000000000002';
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';

select results_eq(
  $$ select public.check_answer('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1', array['b'])->>'correct' $$,
  $$ values ('false') $$, 'after confirming, the same student can check answers'
);

select * from finish();
rollback;
