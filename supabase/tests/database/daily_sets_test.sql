-- Daily stat sets and daily puzzles (content pipeline, docs/CONTENT-PIPELINE.md): only signed-in, confirmed students
-- can ask; a day's set is fifteen published a-to-d single-answer questions, the same for everyone, with no answers in
-- it; days outside the open window are refused; a withdrawn question's place is refilled; unused questions come first;
-- no website role can read the tables. Run by `supabase test db` on a throwaway local database, with sample text only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000001', 'one@example.com', now()),
  ('00000000-0000-4000-8000-000000000002', 'two@example.com', now()),
  ('00000000-0000-4000-8000-000000000003', 'three@example.com', null);

insert into public.concepts (id, slug, title, published) values
  ('00000000-0000-4000-8000-0000000000c1', 'sample-concept', 'sample concept', true);
insert into public.sources (id, slug, title, publisher, url, license, published) values
  ('00000000-0000-4000-8000-0000000000a1', 'sample-book', 'a sample book', 'sample publisher',
   'https://example.com/book', 'CC BY 4.0', true);

-- Makes one sample question: `n` names it, `kind` is single or sata, `letters` its choices, `right` its key.
create function pg_temp.sample_item(n integer, kind text, letters text[], right_letters text[], publish boolean)
returns void language plpgsql as $$
declare
  v_item uuid := ('00000000-0000-4000-8000-' || lpad(to_hex(4096 + n), 12, '0'))::uuid;
  v_version uuid := ('00000000-0000-4000-9000-' || lpad(to_hex(4096 + n), 12, '0'))::uuid;
begin
  insert into public.items (id, concept_id, type) values (v_item, '00000000-0000-4000-8000-0000000000c1', kind);
  insert into public.item_versions (id, item_id, version, stem, source_id)
    values (v_version, v_item, 1, '[sample question ' || n || ']', '00000000-0000-4000-8000-0000000000a1');
  insert into public.item_choices (item_version_id, choice_id, text)
    select v_version, l, '[sample choice ' || l || ']' from unnest(letters) l;
  insert into public.item_answers (item_version_id, choice_id, is_correct, rationale)
    select v_version, l, l = any (right_letters), '[sample rationale ' || l || ']' from unnest(letters) l;
  if publish then
    update public.item_versions set status = 'published' where id = v_version;
  end if;
end;
$$;

create function pg_temp.item_uuid(n integer) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-' || lpad(to_hex(4096 + n), 12, '0'))::uuid $$;

-- Fourteen questions that fit stat, and three that don't: select-all, three choices, and an unpublished draft.
select pg_temp.sample_item(n, 'single', array['a', 'b', 'c', 'd'], array['b'], true) from generate_series(1, 14) n;
select pg_temp.sample_item(101, 'sata', array['a', 'b', 'c', 'd'], array['a', 'c'], true);
select pg_temp.sample_item(102, 'single', array['a', 'b', 'c'], array['a'], true);
select pg_temp.sample_item(103, 'single', array['a', 'b', 'c', 'd'], array['a'], false);

create temporary table today_set (body jsonb);
grant all on table today_set to authenticated;
create temporary view utc as select (now() at time zone 'utc')::date as today;
grant select on utc to anon, authenticated;

-- ---------------------------------------------------------------- who may ask

set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';
set local "request.jwt.claim.sub" to '';
select throws_ok(
  $$ select public.daily_stat_set((select today from utc)) $$, '42501', null,
  'a signed-out visitor cannot ask for the stat set'
);
select throws_ok(
  $$ select public.daily_puzzle('cueword', (select today from utc)) $$, '42501', null,
  'a signed-out visitor cannot ask for a daily puzzle'
);
select throws_ok($$ select * from public.daily_stat_sets $$, '42501', null, 'anon cannot read the stat set list');
select throws_ok($$ select * from public.puzzles $$, '42501', null, 'anon cannot read the puzzles');

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000003", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select public.daily_stat_set((select today from utc)) $$, '28000', 'confirm your email to use this',
  'an account without a confirmed email is refused'
);

set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
select throws_ok($$ select * from public.daily_stat_sets $$, '42501', null, 'a student cannot read the stat set list');
select throws_ok($$ select * from public.daily_stat_set_items $$, '42501', null, 'a student cannot read the set questions');
select throws_ok($$ select * from public.puzzles $$, '42501', null, 'a student cannot read the puzzles');
select throws_ok($$ select * from public.daily_puzzles $$, '42501', null, 'a student cannot read the daily puzzle list');
select throws_ok($$ select * from app_private.daily_stat_eligible $$, '42501', null, 'a student cannot read the eligible list');

-- ---------------------------------------------------------------- not enough questions

select throws_ok(
  $$ select public.daily_stat_set((select today from utc)) $$, 'P0002', 'today''s set is not ready yet',
  'with fourteen questions that fit, the set is not ready'
);
reset role;
select is((select count(*)::int from public.daily_stat_set_items), 0, 'a set that could not be made leaves nothing saved');
select is((select count(*)::int from public.daily_stat_sets), 0, 'and no empty day row either');

-- Two more that fit: sixteen in all.
select pg_temp.sample_item(n, 'single', array['a', 'b', 'c', 'd'], array['c'], true) from generate_series(15, 16) n;

-- ---------------------------------------------------------------- today's set

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
insert into today_set select public.daily_stat_set((select today from utc));

select is((select jsonb_array_length(body -> 'questions') from today_set), 15, 'the set has fifteen questions');
select is(
  (select array_agg((q ->> 'position')::int order by (q ->> 'position')::int)
     from today_set, jsonb_array_elements(body -> 'questions') q),
  (select array_agg(g) from generate_series(1, 15) g),
  'in positions 1 to 15'
);
select is(
  (select count(distinct q ->> 'item_id')::int from today_set, jsonb_array_elements(body -> 'questions') q), 15,
  'fifteen different questions'
);
select is(
  (select count(*)::int from today_set, jsonb_array_elements(body -> 'questions') q
     where (q ->> 'item_id')::uuid in (pg_temp.item_uuid(101), pg_temp.item_uuid(102), pg_temp.item_uuid(103))),
  0,
  'no select-all, three-choice or unpublished question is in it'
);
select ok(
  (select bool_and(
            (select array_agg(c ->> 'id' order by c ->> 'id') from jsonb_array_elements(q -> 'choices') c)
              = array['a', 'b', 'c', 'd'])
     from today_set, jsonb_array_elements(body -> 'questions') q),
  'every question comes with choices a to d'
);
select ok(
  (select bool_and((select array_agg(k order by k) from jsonb_object_keys(q) k)
                     = array['choices', 'item_id', 'position', 'stem', 'version_id'])
     from today_set, jsonb_array_elements(body -> 'questions') q)
  and (select bool_and((select array_agg(k order by k) from jsonb_object_keys(c) k) = array['id', 'text'])
         from today_set, jsonb_array_elements(body -> 'questions') q, jsonb_array_elements(q -> 'choices') c)
  and (select body::text not like '%rationale%' from today_set),
  'the reply carries only ids, the stem and the choices: no key and no rationale'
);

-- Another student gets the same set.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select is(public.daily_stat_set((select today from utc)), (select body from today_set), 'everyone gets the same set for the day');

select throws_ok(
  $$ select public.daily_stat_set((select today from utc) + 2) $$, '22023', 'that day''s set is not open',
  'a day after tomorrow (UTC) is not open'
);
select throws_ok(
  $$ select public.daily_stat_set((select today from utc) - 2) $$, '22023', 'that day''s set is not open',
  'a day before yesterday (UTC) is not open'
);

-- ---------------------------------------------------------------- tomorrow prefers what today didn't use

select ok(
  (select (public.daily_stat_set((select today from utc) + 1) -> 'questions') @>
          jsonb_build_array(jsonb_build_object('item_id', u.item_id))
     from (select e.item_id from (select pg_temp.item_uuid(n) as item_id from generate_series(1, 16) n) e
           where e.item_id::text not in (select q ->> 'item_id' from today_set, jsonb_array_elements(body -> 'questions') q)) u),
  'the next day''s set includes the question today''s set left out'
);

-- ---------------------------------------------------------------- a withdrawn question is replaced

reset role;
create temporary table withdrawn as
  select (q ->> 'item_id')::uuid as item_id, (q ->> 'position')::int as position
  from today_set, jsonb_array_elements(body -> 'questions') q where (q ->> 'position')::int = 3;
grant select on table withdrawn to authenticated;
update public.item_versions set status = 'retired'
  where item_id = (select item_id from withdrawn) and status = 'published';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
create temporary table refilled as select public.daily_stat_set((select today from utc)) as body;
select is(
  (select jsonb_array_length(body -> 'questions') from refilled), 15, 'after a withdrawal the set still has fifteen'
);
select isnt(
  (select q ->> 'item_id' from refilled, jsonb_array_elements(body -> 'questions') q where (q ->> 'position')::int = 3),
  (select item_id::text from withdrawn),
  'the withdrawn question''s place has a different question'
);
select is(
  (select count(*)::int from refilled r, jsonb_array_elements(r.body -> 'questions') q,
                         today_set t, jsonb_array_elements(t.body -> 'questions') p
     where (q ->> 'position') = (p ->> 'position') and (q ->> 'item_id') = (p ->> 'item_id')),
  14,
  'the other fourteen stay where they were'
);

-- ---------------------------------------------------------------- daily puzzles

select throws_ok(
  $$ select public.daily_puzzle('cueword', (select today from utc)) $$, 'P0002', 'today''s puzzle is not ready yet',
  'with no published crossword, today''s crossword is not ready'
);
select throws_ok(
  $$ select public.daily_puzzle('triage', (select today from utc)) $$, '22023', 'no such game',
  'sudoku has no stored puzzles'
);

reset role;
insert into public.puzzles (id, game, slug, payload, status) values
  ('00000000-0000-4000-a000-000000000001', 'cueword', 'sample-cross-1', '{"status": "sample", "grid": ["AB"]}', 'published'),
  ('00000000-0000-4000-a000-000000000002', 'cueword', 'sample-cross-2', '{"status": "sample", "grid": ["CD"]}', 'draft');

set local role authenticated;
select is(
  (public.daily_puzzle('cueword', (select today from utc)) ->> 'puzzle_id'),
  '00000000-0000-4000-a000-000000000001',
  'today''s crossword is the published one, never the draft'
);

reset role;
select throws_ok(
  $$ update public.puzzles set payload = '{"grid": ["ZZ"]}' where id = '00000000-0000-4000-a000-000000000001' $$,
  '23514', 'a published or retired puzzle cannot be edited; import a new one',
  'a published puzzle cannot be edited'
);

select * from finish();
rollback;
