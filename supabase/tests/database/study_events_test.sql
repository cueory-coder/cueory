-- Study events and record_study_events (Task 140): only a signed-in student can record events, every event is checked
-- before anything is written, a batch is all or nothing, a retried event is stored once, each student reads only their
-- own events, the limits hold, and deleting an account deletes its events. Run by `supabase test db` on a throwaway
-- local database; the students and rows below exist only inside this test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(68);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'one@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'two@example.com'),
  ('00000000-0000-4000-8000-000000000003', 'three@example.com'),
  ('00000000-0000-4000-8000-000000000004', 'four@example.com'),
  ('00000000-0000-4000-8000-000000000005', 'five@example.com');

insert into public.concepts (id, slug, title, published) values
  ('00000000-0000-4000-8000-0000000000c1', 'sample-concept', 'sample concept', true);
insert into public.sources (id, slug, title, publisher, url, license, published) values
  ('00000000-0000-4000-8000-0000000000a1', 'sample-book', 'a sample book', 'sample publisher',
   'https://example.com/book', 'CC BY 4.0', true);
insert into public.items (id, concept_id, type) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 'single'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c1', 'single'),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000c1', 'single');

-- Items 1 and 2: published. Item 3: still a draft.
insert into public.item_versions (id, item_id, version, stem, source_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 1, 'stem one',
   '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e2', 1, 'stem two',
   '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000e3', 1, 'draft stem',
   '00000000-0000-4000-8000-0000000000a1');
insert into public.item_choices (item_version_id, choice_id, text) values
  ('00000000-0000-4000-8000-0000000000f1', 'a', 'one a'), ('00000000-0000-4000-8000-0000000000f1', 'b', 'one b'),
  ('00000000-0000-4000-8000-0000000000f2', 'a', 'two a'), ('00000000-0000-4000-8000-0000000000f2', 'b', 'two b');
insert into public.item_answers (item_version_id, choice_id, is_correct, rationale) values
  ('00000000-0000-4000-8000-0000000000f1', 'a', true, 'why a'), ('00000000-0000-4000-8000-0000000000f1', 'b', false, 'why b'),
  ('00000000-0000-4000-8000-0000000000f2', 'a', true, 'why a'), ('00000000-0000-4000-8000-0000000000f2', 'b', false, 'why b');
update public.item_versions set status = 'published'
  where id in ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f2');

-- Event times, as a device would send them (ISO 8601, UTC). now() stays the same for the whole transaction, and these
-- settings last only until it ends. The events below put them in with replace().
do $$
begin
  perform set_config('t.m1', to_char((now() - interval '1 minute') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), true);
  perform set_config('t.m2', to_char((now() - interval '2 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), true);
  perform set_config('t.m3', to_char((now() - interval '3 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), true);
  perform set_config('t.m4', to_char((now() - interval '4 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), true);
  perform set_config('t.ahead4', to_char((now() + interval '4 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), true);
  perform set_config('t.ahead10', to_char((now() + interval '10 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), true);
  perform set_config('t.old6d', to_char((now() - interval '6 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), true);
  perform set_config('t.old8d', to_char((now() - interval '8 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), true);
end
$$;

-- ---- Who may do what.
select table_privs_are('public', 'study_events', 'anon', array[]::text[], 'visitors have no access to study events');
select table_privs_are('public', 'study_events', 'authenticated', array['SELECT'], 'students can only read study events');
select ok(
  has_function_privilege('authenticated', 'public.record_study_events(jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.record_study_events(jsonb)', 'execute'),
  'signed-in students can run record_study_events and signed-out visitors cannot'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.record_study_events(jsonb)'::regprocedure)
    and (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.record_study_events(jsonb)'::regprocedure),
  'record_study_events is security definer with an empty search_path'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.study_events'::regclass),
  'study events have row-level security'
);

-- ---- Signed out.
set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';
set local "request.jwt.claim.sub" to '';
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": 1, "at": "@t"}]$j$,
       '@t', current_setting('t.m1'))::jsonb) $$,
  '42501', null, 'a signed-out visitor cannot record study events'
);
select throws_ok($$ select id from public.study_events $$, '42501', null, 'a signed-out visitor cannot read study events');

-- ---- Student one.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": 12500, "at": "@t"}]$j$,
       '@t', current_setting('t.m4'))::jsonb) $$,
  $$ values (1) $$, 'a student can record one answered event, and is told one was stored'
);
select results_eq(
  $$ select public.record_study_events(replace(replace(replace($j$[
       {"item_id": "00000000-0000-4000-8000-0000000000e1", "version_id": "00000000-0000-4000-8000-0000000000f1",
        "kind": "marked", "mark": "know", "ms_on_item": 0, "at": "@a"},
       {"item_id": "00000000-0000-4000-8000-0000000000e2", "version_id": "00000000-0000-4000-8000-0000000000f2",
        "kind": "marked", "mark": "learning", "ms_on_item": 1800000, "at": "@b"},
       {"item_id": "00000000-0000-4000-8000-0000000000e2", "version_id": "00000000-0000-4000-8000-0000000000f2",
        "kind": "skipped", "mark": null, "ms_on_item": 300, "at": "@c"}]$j$,
       '@a', current_setting('t.m3')), '@b', current_setting('t.m2')), '@c', current_setting('t.m1'))::jsonb) $$,
  $$ values (3) $$, 'a batch of a mark, a still-learning mark at 30 minutes and a skip with a null mark is stored'
);
select results_eq(
  $$ select public.record_study_events(replace(replace($j$[
       {"item_id": "00000000-0000-4000-8000-0000000000e2", "version_id": "00000000-0000-4000-8000-0000000000f2",
        "kind": "answered", "ms_on_item": 1, "at": "@a"},
       {"item_id": "00000000-0000-4000-8000-0000000000e2", "version_id": "00000000-0000-4000-8000-0000000000f2",
        "kind": "answered", "ms_on_item": 1, "at": "@b"}]$j$,
       '@a', current_setting('t.ahead4')), '@b', current_setting('t.old6d'))::jsonb) $$,
  $$ values (2) $$, 'times 4 minutes ahead and 6 days ago are both inside the window'
);
select results_eq(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": 12500, "at": "@t"}]$j$,
       '@t', current_setting('t.m4'))::jsonb) $$,
  $$ values (0) $$, 'the same event sent again is stored once, and the retry is told none were stored'
);
select results_eq(
  $$ select count(*)::int from public.study_events $$, $$ values (6) $$,
  'a student reads their own six events'
);

-- The table stays read-only for students.
select throws_ok(
  $$ insert into public.study_events (user_id, item_id, item_version_id, kind, ms_on_item, at)
     values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e1',
             '00000000-0000-4000-8000-0000000000f1', 'answered', 1, now()) $$,
  '42501', null, 'a student cannot write a study event directly'
);
select throws_ok($$ update public.study_events set ms_on_item = 1 $$, '42501', null, 'a student cannot change a study event');
select throws_ok($$ delete from public.study_events $$, '42501', null, 'a student cannot delete a study event');

-- What was stored (read as the owner).
reset role;
select results_eq(
  $$ select user_id::text, item_id::text, kind, ms_on_item, coalesce(mark, 'none') from public.study_events
     where at = current_setting('t.m4')::timestamptz $$,
  $$ values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e1', 'answered', 12500, 'none') $$,
  'the event is stored as sent, for the signed-in student'
);
select results_eq(
  $$ select mark from public.study_events where at in (current_setting('t.m3')::timestamptz, current_setting('t.m2')::timestamptz)
     order by at $$,
  $$ values ('know'), ('learning') $$,
  'marks are stored'
);
select results_eq(
  $$ select mark is null from public.study_events where kind = 'skipped' $$, $$ values (true) $$,
  'a skip has no mark'
);
select results_eq(
  $$ select count(*)::int from public.study_events where created_at = now() and at <> created_at $$, $$ values (6) $$,
  'created_at is the database''s time, and at is the device''s'
);
set local role authenticated;

-- ---- Refused before anything is written. Each sends events that would otherwise be stored.
select throws_ok(
  $$ select public.record_study_events(null) $$, '22023', 'send between 1 and 50 study events', 'no events is refused'
);
select throws_ok(
  $$ select public.record_study_events('{"item_id": "00000000-0000-4000-8000-0000000000e1"}'::jsonb) $$,
  '22023', 'send between 1 and 50 study events', 'one event that is not in a list is refused'
);
select throws_ok(
  $$ select public.record_study_events('[]'::jsonb) $$, '22023', 'send between 1 and 50 study events', 'an empty list is refused'
);
select throws_ok(
  $$ select public.record_study_events((
       select jsonb_agg(jsonb_build_object(
         'item_id', '00000000-0000-4000-8000-0000000000e1', 'version_id', '00000000-0000-4000-8000-0000000000f1',
         'kind', 'answered', 'ms_on_item', n,
         'at', to_char((now() - make_interval(secs => n)) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
       from generate_series(1, 51) n)) $$,
  '22023', 'send between 1 and 50 study events', 'more than 50 events at once is refused'
);
select throws_ok(
  $$ select public.record_study_events('["an event"]'::jsonb) $$,
  '22023', 'a study event has the wrong shape', 'an event that is not an object is refused'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": 1, "at": "@t",
       "email": "one@example.com"}]$j$, '@t', current_setting('t.m1'))::jsonb) $$,
  '22023', 'a study event has the wrong shape', 'an event with a key that is not part of the shape is refused'
);
select throws_ok(
  $$ select public.record_study_events($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": 1}]$j$::jsonb) $$,
  '22023', 'a study event has the wrong shape', 'an event without its time is refused'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "sample-item",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": 1, "at": "@t"}]$j$,
       '@t', current_setting('t.m1'))::jsonb) $$,
  '22023', 'a study event has the wrong shape', 'an item id that is not a uuid is refused'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": null, "kind": "answered", "ms_on_item": 1, "at": "@t"}]$j$,
       '@t', current_setting('t.m1'))::jsonb) $$,
  '22023', 'a study event has the wrong shape', 'a null version id is refused'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "viewed", "ms_on_item": 1, "at": "@t"}]$j$,
       '@t', current_setting('t.m1'))::jsonb) $$,
  '22023', 'a study event has the wrong shape', 'a kind that is not on the list is refused'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": -1, "at": "@t"}]$j$,
       '@t', current_setting('t.m1'))::jsonb) $$,
  '22023', 'a study event has the wrong shape', 'a negative time on the item is refused'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": 1800001, "at": "@t"}]$j$,
       '@t', current_setting('t.m1'))::jsonb) $$,
  '22023', 'a study event has the wrong shape', 'more than 30 minutes on the item is refused'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": 1.5, "at": "@t"}]$j$,
       '@t', current_setting('t.m1'))::jsonb) $$,
  '22023', 'a study event has the wrong shape', 'a time on the item that is not a whole number is refused'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": "100", "at": "@t"}]$j$,
       '@t', current_setting('t.m1'))::jsonb) $$,
  '22023', 'a study event has the wrong shape', 'a time on the item sent as text is refused'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "marked", "ms_on_item": 1, "at": "@t"}]$j$,
       '@t', current_setting('t.m1'))::jsonb) $$,
  '22023', 'a study event has the wrong shape', 'a mark without know or learning is refused'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "marked", "mark": "maybe", "ms_on_item": 1,
       "at": "@t"}]$j$, '@t', current_setting('t.m1'))::jsonb) $$,
  '22023', 'a study event has the wrong shape', 'a mark that is not know or learning is refused'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "mark": "know", "ms_on_item": 1,
       "at": "@t"}]$j$, '@t', current_setting('t.m1'))::jsonb) $$,
  '22023', 'a study event has the wrong shape', 'an answer with a mark is refused'
);
select throws_ok(
  $$ select public.record_study_events($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": 1,
       "at": "2026-11-02 10:00:00"}]$j$::jsonb) $$,
  '22023', 'a study event has the wrong shape', 'a time without its offset is refused'
);
select throws_ok(
  $$ select public.record_study_events($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": 1,
       "at": "2026-02-30T10:00:00Z"}]$j$::jsonb) $$,
  '22023', 'a study event has the wrong shape', 'a day that does not exist is refused'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": 1, "at": "@t"}]$j$,
       '@t', current_setting('t.old8d'))::jsonb) $$,
  '22023', 'a study event time must be between 7 days ago and 5 minutes from now', 'an event from 8 days ago is refused'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": 1, "at": "@t"}]$j$,
       '@t', current_setting('t.ahead10'))::jsonb) $$,
  '22023', 'a study event time must be between 7 days ago and 5 minutes from now',
  'an event 10 minutes in the future is refused'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f2", "kind": "answered", "ms_on_item": 1, "at": "@t"}]$j$,
       '@t', current_setting('t.m1'))::jsonb) $$,
  '22023', 'a study event names a question that was not found', 'a version of a different item is refused'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e3",
       "version_id": "00000000-0000-4000-8000-0000000000f3", "kind": "answered", "ms_on_item": 1, "at": "@t"}]$j$,
       '@t', current_setting('t.m1'))::jsonb) $$,
  '22023', 'a study event names a question that was not found', 'a draft version is refused'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000ff",
       "version_id": "00000000-0000-4000-8000-0000000000fe", "kind": "answered", "ms_on_item": 1, "at": "@t"}]$j$,
       '@t', current_setting('t.m1'))::jsonb) $$,
  '22023', 'a study event names a question that was not found', 'an unknown question gets the same plain answer'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[
       {"item_id": "00000000-0000-4000-8000-0000000000e1", "version_id": "00000000-0000-4000-8000-0000000000f1",
        "kind": "skipped", "ms_on_item": 5, "at": "@t"},
       {"item_id": "00000000-0000-4000-8000-0000000000e1", "version_id": "00000000-0000-4000-8000-0000000000f1",
        "kind": "skipped", "ms_on_item": 5, "at": "not a time"}]$j$, '@t', current_setting('t.m2'))::jsonb) $$,
  '22023', 'a study event has the wrong shape', 'one bad event refuses the whole batch'
);

reset role;
select results_eq(
  $$ select count(*)::int from public.study_events where user_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values (6) $$, 'refused batches wrote nothing'
);

-- ---- The table's own checks, for any writer (as the owner).
select throws_ok(
  $$ insert into public.study_events (user_id, item_id, item_version_id, kind, ms_on_item, at)
     values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e1',
             '00000000-0000-4000-8000-0000000000f1', 'marked', 1, now()) $$,
  '23514', null, 'the table refuses a mark without know or learning'
);
select throws_ok(
  $$ insert into public.study_events (user_id, item_id, item_version_id, kind, ms_on_item, mark, at)
     values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e1',
             '00000000-0000-4000-8000-0000000000f1', 'skipped', 1, 'know', now()) $$,
  '23514', null, 'the table refuses a mark on a skip'
);
select throws_ok(
  $$ insert into public.study_events (user_id, item_id, item_version_id, kind, ms_on_item, at)
     values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e1',
             '00000000-0000-4000-8000-0000000000f1', 'viewed', 1, now()) $$,
  '23514', null, 'the table refuses a kind that is not on the list'
);
select throws_ok(
  $$ insert into public.study_events (user_id, item_id, item_version_id, kind, ms_on_item, at)
     values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e1',
             '00000000-0000-4000-8000-0000000000f1', 'answered', 1800001, now()) $$,
  '23514', null, 'the table refuses more than 30 minutes on an item'
);
select throws_ok(
  $$ insert into public.study_events (user_id, item_id, item_version_id, kind, ms_on_item, at)
     values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e1',
             '00000000-0000-4000-8000-0000000000f1', 'answered', 1, now() - interval '169 hours') $$,
  '23514', null, 'the table refuses a time more than 7 days before it was stored'
);
select throws_ok(
  $$ insert into public.study_events (user_id, item_id, item_version_id, kind, ms_on_item, at)
     values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e1',
             '00000000-0000-4000-8000-0000000000f1', 'answered', 1, now() + interval '6 minutes') $$,
  '23514', null, 'the table refuses a time more than 5 minutes after it was stored'
);
select lives_ok(
  $$ insert into public.study_events (user_id, item_id, item_version_id, kind, ms_on_item, at, created_at)
     values ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000e1',
             '00000000-0000-4000-8000-0000000000f1', 'answered', 1, now() - interval '30 days',
             now() - interval '29 days') $$,
  'an old event still loads with its own stored time (a restored backup)'
);

-- ---- The hourly limit (600 a person), counted by when events were stored.
insert into public.study_events (user_id, item_id, item_version_id, kind, ms_on_item, at, created_at)
  select '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000e1',
         '00000000-0000-4000-8000-0000000000f1', 'answered', 1, now() - make_interval(secs => 600 + n),
         now() - interval '10 minutes'
  from generate_series(1, 590) n;
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ select public.record_study_events((
       select jsonb_agg(jsonb_build_object(
         'item_id', '00000000-0000-4000-8000-0000000000e1', 'version_id', '00000000-0000-4000-8000-0000000000f1',
         'kind', 'skipped', 'ms_on_item', n,
         'at', to_char((now() - make_interval(secs => n)) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
       from generate_series(1, 11) n)) $$,
  '54000', 'too many study events recorded recently; try again later',
  'a batch that would pass 600 in an hour is refused whole'
);
select results_eq(
  $$ select public.record_study_events((
       select jsonb_agg(jsonb_build_object(
         'item_id', '00000000-0000-4000-8000-0000000000e1', 'version_id', '00000000-0000-4000-8000-0000000000f1',
         'kind', 'skipped', 'ms_on_item', n,
         'at', to_char((now() - make_interval(secs => n)) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
       from generate_series(1, 10) n)) $$,
  $$ values (10) $$, 'a batch that reaches exactly 600 in an hour is allowed'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": 1, "at": "@t"}]$j$,
       '@t', current_setting('t.m1'))::jsonb) $$,
  '54000', 'too many study events recorded recently; try again later', 'the 601st event in an hour is refused'
);
select results_eq(
  $$ select public.record_study_events((
       select jsonb_agg(jsonb_build_object(
         'item_id', '00000000-0000-4000-8000-0000000000e1', 'version_id', '00000000-0000-4000-8000-0000000000f1',
         'kind', 'skipped', 'ms_on_item', n,
         'at', to_char((now() - make_interval(secs => n)) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
       from generate_series(1, 10) n)) $$,
  $$ values (0) $$, 'at the hourly limit, a retry of a batch that was already stored is told 0, not refused'
);
select results_eq(
  $$ select count(*)::int from public.study_events $$, $$ values (600) $$,
  'student two reads only their own 600 events, none of student one''s'
);

-- Another student is not affected.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
select results_eq(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": 2, "at": "@t"}]$j$,
       '@t', current_setting('t.m1'))::jsonb) $$,
  $$ values (1) $$, 'one student being at the limit does not stop another'
);

-- ---- Older events stop counting toward the hour; the daily cap (2,000) holds.
reset role;
insert into public.study_events (user_id, item_id, item_version_id, kind, ms_on_item, at, created_at)
  select '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000e1',
         '00000000-0000-4000-8000-0000000000f1', 'answered', 1, now() - interval '2 hours' - make_interval(secs => n),
         now() - interval '2 hours'
  from generate_series(1, 1990) n;
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000003", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000003';
select results_eq(
  $$ select public.record_study_events((
       select jsonb_agg(jsonb_build_object(
         'item_id', '00000000-0000-4000-8000-0000000000e1', 'version_id', '00000000-0000-4000-8000-0000000000f1',
         'kind', 'skipped', 'ms_on_item', n,
         'at', to_char((now() - make_interval(secs => n)) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
       from generate_series(1, 10) n)) $$,
  $$ values (10) $$, 'events stored more than an hour ago do not count toward the hourly limit'
);
select throws_ok(
  $$ select public.record_study_events(replace($j$[{"item_id": "00000000-0000-4000-8000-0000000000e1",
       "version_id": "00000000-0000-4000-8000-0000000000f1", "kind": "answered", "ms_on_item": 1, "at": "@t"}]$j$,
       '@t', current_setting('t.m1'))::jsonb) $$,
  '54000', 'too many study events recorded recently; try again later', 'the 2,001st event in a day is refused'
);

-- ---- Only new events count toward the limits. Student five has 1,979 events stored 3 hours ago (answered, one
-- second apart), so 21 more reach the daily 2,000.
reset role;
insert into public.study_events (user_id, item_id, item_version_id, kind, ms_on_item, at, created_at)
  select '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000e1',
         '00000000-0000-4000-8000-0000000000f1', 'answered', 1, now() - interval '3 hours' - make_interval(secs => n),
         now() - interval '3 hours'
  from generate_series(1, 1979) n;
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000005", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000005';
-- 30 already stored and 20 new: the whole batch is 50 more than 1,979, but only the 20 new count.
select results_eq(
  $$ select public.record_study_events((
       select jsonb_agg(e) from (
         select jsonb_build_object(
           'item_id', '00000000-0000-4000-8000-0000000000e1', 'version_id', '00000000-0000-4000-8000-0000000000f1',
           'kind', 'answered', 'ms_on_item', 1,
           'at', to_char((now() - interval '3 hours' - make_interval(secs => n)) at time zone 'utc',
                         'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) e
         from generate_series(1, 30) n
         union all
         select jsonb_build_object(
           'item_id', '00000000-0000-4000-8000-0000000000e1', 'version_id', '00000000-0000-4000-8000-0000000000f1',
           'kind', 'skipped', 'ms_on_item', n,
           'at', to_char((now() - make_interval(secs => n)) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
         from generate_series(1, 20) n) b)) $$,
  $$ values (20) $$, 'a mixed batch whose new events fit the quota left stores the new ones'
);
-- One new event sent twice, the second time with +00:00 instead of Z: it is one event, and it is the 2,000th.
select results_eq(
  $$ select public.record_study_events((
       select jsonb_agg(jsonb_build_object(
         'item_id', '00000000-0000-4000-8000-0000000000e2', 'version_id', '00000000-0000-4000-8000-0000000000f2',
         'kind', 'answered', 'ms_on_item', 7,
         'at', to_char((now() - interval '1 minute') at time zone 'utc', f)))
       from unnest(array['YYYY-MM-DD"T"HH24:MI:SS.US"Z"', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"']) f)) $$,
  $$ values (1) $$, 'the same new event twice in one batch counts once, whatever offset its time is written with'
);
select results_eq(
  $$ select public.record_study_events((
       select jsonb_agg(e) from (
         select jsonb_build_object(
           'item_id', '00000000-0000-4000-8000-0000000000e1', 'version_id', '00000000-0000-4000-8000-0000000000f1',
           'kind', 'answered', 'ms_on_item', 1,
           'at', to_char((now() - interval '3 hours' - make_interval(secs => n)) at time zone 'utc',
                         'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"')) e
         from generate_series(1, 30) n
         union all
         select jsonb_build_object(
           'item_id', '00000000-0000-4000-8000-0000000000e1', 'version_id', '00000000-0000-4000-8000-0000000000f1',
           'kind', 'skipped', 'ms_on_item', n,
           'at', to_char((now() - make_interval(secs => n)) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
         from generate_series(1, 20) n) b)) $$,
  $$ values (0) $$, 'at the daily limit, a retry of a fully stored batch is told 0, not refused'
);
select throws_ok(
  $$ select public.record_study_events((
       select jsonb_agg(e) from (
         select jsonb_build_object(
           'item_id', '00000000-0000-4000-8000-0000000000e1', 'version_id', '00000000-0000-4000-8000-0000000000f1',
           'kind', 'answered', 'ms_on_item', 1,
           'at', to_char((now() - interval '3 hours' - make_interval(secs => n)) at time zone 'utc',
                         'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) e
         from generate_series(1, 49) n
         union all
         select jsonb_build_object(
           'item_id', '00000000-0000-4000-8000-0000000000e2', 'version_id', '00000000-0000-4000-8000-0000000000f2',
           'kind', 'skipped', 'ms_on_item', 1,
           'at', to_char((now() - interval '2 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))) b)) $$,
  '54000', 'too many study events recorded recently; try again later',
  'at the limit, a batch with even one new event is refused whole, however much of it was already stored'
);
select results_eq(
  $$ select count(*)::int from public.study_events $$, $$ values (2000) $$,
  'student five has exactly 2,000 events: every new one stored once, nothing from the refused batch'
);

-- ---- A student who has recorded nothing sees nothing (student four's only row is the owner's restored one).
reset role;
delete from public.study_events where user_id = '00000000-0000-4000-8000-000000000004';
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000004", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000004';
select is_empty($$ select id from public.study_events $$, 'a student with no events reads none');

-- ---- Deleting an account deletes its events.
reset role;
delete from auth.users where id = '00000000-0000-4000-8000-000000000003';
select results_eq(
  $$ select count(*)::int from public.study_events where user_id = '00000000-0000-4000-8000-000000000003' $$,
  $$ values (0) $$, 'deleting an account deletes its study events'
);
select results_eq(
  $$ select count(*)::int from public.study_events where user_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values (7) $$, 'and only that student''s'
);

select * from finish();
rollback;
