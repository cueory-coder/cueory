-- Items and versions (D-85): the website reads the stem and choices of a published version and nothing else; the key
-- and rationales are closed to every website role; a version can be published only when complete, and a published
-- version never changes. Run by `supabase test db` on a throwaway local database; every row exists only in this test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

-- Fixtures, made as the database owner (which is how migrations and the admin tools write).
insert into public.concepts (id, slug, title, published) values
  ('00000000-0000-4000-8000-0000000000c1', 'sample-concept', 'sample concept', true);
insert into public.sources (id, slug, title, publisher, url, license, published) values
  ('00000000-0000-4000-8000-0000000000a1', 'sample-book', 'a sample book', 'sample publisher',
   'https://example.com/book', 'CC BY 4.0', true);

insert into public.items (id, concept_id, type) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 'single'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c1', 'sata'),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000c1', 'single');

-- Item 1: one published version (single answer).
insert into public.item_versions (id, item_id, version, stem, source_id) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 1, 'sample stem one',
   '00000000-0000-4000-8000-0000000000a1');
insert into public.item_choices (item_version_id, choice_id, text) values
  ('00000000-0000-4000-8000-0000000000f1', 'a', 'choice a'),
  ('00000000-0000-4000-8000-0000000000f1', 'b', 'choice b'),
  ('00000000-0000-4000-8000-0000000000f1', 'c', 'choice c');
insert into public.item_answers (item_version_id, choice_id, is_correct, rationale) values
  ('00000000-0000-4000-8000-0000000000f1', 'a', true, 'secret rationale a'),
  ('00000000-0000-4000-8000-0000000000f1', 'b', false, 'secret rationale b'),
  ('00000000-0000-4000-8000-0000000000f1', 'c', false, 'secret rationale c');
update public.item_versions set status = 'published' where id = '00000000-0000-4000-8000-0000000000f1';

-- Item 2: a select-all draft that is still being written, so students see nothing of it.
insert into public.item_versions (id, item_id, version, stem, source_id) values
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e2', 1, 'sample stem two',
   '00000000-0000-4000-8000-0000000000a1');
insert into public.item_choices (item_version_id, choice_id, text) values
  ('00000000-0000-4000-8000-0000000000f2', 'a', 'draft choice a'),
  ('00000000-0000-4000-8000-0000000000f2', 'b', 'draft choice b'),
  ('00000000-0000-4000-8000-0000000000f2', 'c', 'draft choice c');
insert into public.item_answers (item_version_id, choice_id, is_correct, rationale) values
  ('00000000-0000-4000-8000-0000000000f2', 'a', true, 'draft rationale a'),
  ('00000000-0000-4000-8000-0000000000f2', 'b', false, 'draft rationale b'),
  ('00000000-0000-4000-8000-0000000000f2', 'c', true, 'draft rationale c');

-- Item 3: published, then a second version being written next to it.
insert into public.item_versions (id, item_id, version, stem, source_id) values
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000e3', 1, 'sample stem three',
   '00000000-0000-4000-8000-0000000000a1');
insert into public.item_choices (item_version_id, choice_id, text) values
  ('00000000-0000-4000-8000-0000000000f3', 'a', 'three a'), ('00000000-0000-4000-8000-0000000000f3', 'b', 'three b');
insert into public.item_answers (item_version_id, choice_id, is_correct, rationale) values
  ('00000000-0000-4000-8000-0000000000f3', 'a', false, 'three rationale a'),
  ('00000000-0000-4000-8000-0000000000f3', 'b', true, 'three rationale b');
update public.item_versions set status = 'published' where id = '00000000-0000-4000-8000-0000000000f3';
insert into public.item_versions (id, item_id, version, stem, source_id) values
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000e3', 2, 'sample stem three, new',
   '00000000-0000-4000-8000-0000000000a1');

-- ---- Who is granted what.
select table_privs_are('public', 'items', 'anon', array['SELECT'], 'visitors can only read items');
select table_privs_are('public', 'item_versions', 'anon', array[]::text[], 'visitors have no table-wide access to versions');
select column_privs_are('public', 'item_versions', 'stem', 'anon', array['SELECT'], 'visitors can read a version''s stem');
select column_privs_are('public', 'item_versions', 'status', 'anon', array['SELECT'], 'visitors can read a version''s status, which is always published for them');
select column_privs_are('public', 'item_versions', 'created_at', 'anon', array[]::text[], 'visitors cannot read a version''s date column');
select column_privs_are('public', 'item_versions', 'source_id', 'authenticated', array[]::text[], 'students cannot read a version''s source column');
select table_privs_are('public', 'item_choices', 'anon', array['SELECT'], 'visitors can only read choices');
select table_privs_are('public', 'item_answers', 'anon', array[]::text[], 'visitors have no access to the key');
select table_privs_are('public', 'item_answers', 'authenticated', array[]::text[], 'students have no access to the key');
select ok(
  not has_function_privilege('anon', 'public.item_versions_guard()', 'execute')
    and not has_function_privilege('authenticated', 'public.item_versions_guard()', 'execute')
    and not has_function_privilege('anon', 'public.item_parts_guard()', 'execute')
    and not has_function_privilege('authenticated', 'public.item_parts_guard()', 'execute'),
  'nobody on the website runs the version rules directly'
);

-- ---- Signed out.
set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';
set local "request.jwt.claim.sub" to '';

select results_eq(
  $$ select stem from public.item_versions order by stem $$,
  $$ values ('sample stem one'), ('sample stem three') $$,
  'visitors see the stems of published versions only, never a draft'
);
select results_eq(
  $$ select count(*)::int from public.items $$, $$ values (2) $$,
  'visitors see only items that have a published version'
);
select results_eq(
  $$ select text from public.item_choices order by text $$,
  $$ values ('choice a'), ('choice b'), ('choice c'), ('three a'), ('three b') $$,
  'visitors see the choices of published versions only'
);
select throws_ok($$ select is_correct from public.item_answers $$, '42501', null, 'visitors cannot read the key');
select throws_ok($$ select rationale from public.item_answers $$, '42501', null, 'visitors cannot read a rationale');
select throws_ok($$ select created_at from public.item_versions $$, '42501', null, 'visitors cannot read the date column');
select throws_ok($$ select source_id from public.item_versions $$, '42501', null, 'visitors cannot read the source column');
select throws_ok(
  $$ insert into public.items (concept_id, type) values ('00000000-0000-4000-8000-0000000000c1', 'single') $$,
  '42501', null, 'visitors cannot add an item'
);
select throws_ok($$ update public.item_versions set stem = 'x' $$, '42501', null, 'visitors cannot change a version');
select throws_ok($$ delete from public.item_choices $$, '42501', null, 'visitors cannot delete a choice');

-- ---- Signed in as a student: exactly the same.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select stem from public.item_versions order by stem $$,
  $$ values ('sample stem one'), ('sample stem three') $$,
  'students see the stems of published versions only'
);
select results_eq(
  $$ select count(*)::int from public.item_choices $$, $$ values (5) $$,
  'students see the choices of published versions only'
);
select throws_ok($$ select is_correct from public.item_answers $$, '42501', null, 'students cannot read the key');
select throws_ok($$ select rationale from public.item_answers $$, '42501', null, 'students cannot read a rationale');
select throws_ok($$ select source_id from public.item_versions $$, '42501', null, 'students cannot read the source column');
select throws_ok(
  $$ insert into public.item_answers (item_version_id, choice_id, is_correct, rationale)
     values ('00000000-0000-4000-8000-0000000000f4', 'a', true, 'x') $$,
  '42501', null, 'students cannot write a key'
);
select throws_ok($$ update public.items set type = 'sata' $$, '42501', null, 'students cannot change an item');

-- ---- The service role sees everything (it bypasses row-level security).
reset role;
set local role service_role;
select results_eq($$ select count(*)::int from public.item_versions $$, $$ values (4) $$, 'the service role sees every version');
select results_eq($$ select count(*)::int from public.item_answers $$, $$ values (8) $$, 'the service role reads the key');
reset role;

-- ---- A version can be published only when complete.
select throws_ok(
  $$ update public.item_versions set status = 'published' where id = '00000000-0000-4000-8000-0000000000f4' $$,
  '23514', null, 'a version with no choices cannot be published'
);
insert into public.item_versions (id, item_id, version, stem) values
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000e1', 2, 'no source yet');
select throws_ok(
  $$ update public.item_versions set status = 'published' where id = '00000000-0000-4000-8000-0000000000f5' $$,
  '23514', null, 'a version without a source cannot be published'
);
insert into public.item_choices (item_version_id, choice_id, text) values
  ('00000000-0000-4000-8000-0000000000f4', 'a', 'new a'), ('00000000-0000-4000-8000-0000000000f4', 'b', 'new b');
select throws_ok(
  $$ update public.item_versions set status = 'published' where id = '00000000-0000-4000-8000-0000000000f4' $$,
  '23514', null, 'a version whose choices lack answer rows cannot be published'
);
insert into public.item_answers (item_version_id, choice_id, is_correct, rationale) values
  ('00000000-0000-4000-8000-0000000000f4', 'a', true, 'new rationale a'),
  ('00000000-0000-4000-8000-0000000000f4', 'b', true, 'new rationale b');
select throws_ok(
  $$ update public.item_versions set status = 'published' where id = '00000000-0000-4000-8000-0000000000f4' $$,
  '23514', null, 'a single-answer question with two right answers cannot be published'
);
update public.item_answers set is_correct = false
  where item_version_id = '00000000-0000-4000-8000-0000000000f2' and choice_id in ('a', 'c');
select throws_ok(
  $$ update public.item_versions set status = 'published' where id = '00000000-0000-4000-8000-0000000000f2' $$,
  '23514', null, 'a select-all question with no right answer cannot be published'
);
select throws_ok(
  $$ insert into public.item_versions (item_id, version, stem, status, source_id)
     values ('00000000-0000-4000-8000-0000000000e2', 2, 'born published', 'published',
             '00000000-0000-4000-8000-0000000000a1') $$,
  '23514', null, 'a version cannot be created already published without its choices'
);

insert into public.items (id, concept_id, type) values
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000c1', 'single');
insert into public.item_versions (id, item_id, version, stem, source_id) values
  ('00000000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-0000000000e4', 1, 'only one choice',
   '00000000-0000-4000-8000-0000000000a1');
insert into public.item_choices (item_version_id, choice_id, text) values
  ('00000000-0000-4000-8000-0000000000f6', 'a', 'the only choice');
insert into public.item_answers (item_version_id, choice_id, is_correct, rationale) values
  ('00000000-0000-4000-8000-0000000000f6', 'a', true, 'only rationale');
select throws_ok(
  $$ update public.item_versions set status = 'published' where id = '00000000-0000-4000-8000-0000000000f6' $$,
  '23514', null, 'a version with only one choice cannot be published'
);

-- ---- A second published version of the same item is refused until the first is retired.
update public.item_answers set is_correct = false
  where item_version_id = '00000000-0000-4000-8000-0000000000f4' and choice_id = 'b';
select throws_ok(
  $$ update public.item_versions set status = 'published' where id = '00000000-0000-4000-8000-0000000000f4' $$,
  '23505', null, 'two versions of one item cannot be published at the same time'
);
update public.item_versions set status = 'retired' where id = '00000000-0000-4000-8000-0000000000f3';
select lives_ok(
  $$ update public.item_versions set status = 'published' where id = '00000000-0000-4000-8000-0000000000f4' $$,
  'once the first is retired, the new version can be published'
);

-- ---- A published version never changes.
select throws_ok(
  $$ update public.item_versions set stem = 'changed' where id = '00000000-0000-4000-8000-0000000000f4' $$,
  '23514', null, 'a published version''s stem cannot be edited'
);
select throws_ok(
  $$ update public.item_versions set status = 'draft' where id = '00000000-0000-4000-8000-0000000000f4' $$,
  '23514', null, 'a published version cannot go back to draft'
);
select throws_ok(
  $$ update public.item_versions set status = 'published' where id = '00000000-0000-4000-8000-0000000000f3' $$,
  '23514', null, 'a retired version cannot come back'
);
select throws_ok(
  $$ insert into public.item_choices (item_version_id, choice_id, text)
     values ('00000000-0000-4000-8000-0000000000f4', 'c', 'late') $$,
  '23514', null, 'a choice cannot be added to a published version'
);
select throws_ok(
  $$ update public.item_answers set is_correct = true
     where item_version_id = '00000000-0000-4000-8000-0000000000f4' and choice_id = 'b' $$,
  '23514', null, 'a published version''s key cannot be changed'
);
select throws_ok(
  $$ delete from public.item_answers where item_version_id = '00000000-0000-4000-8000-0000000000f1' $$,
  '23514', null, 'a published version''s answers cannot be deleted'
);

-- ---- Shapes.
select throws_ok(
  $$ insert into public.item_choices (item_version_id, choice_id, text)
     values ('00000000-0000-4000-8000-0000000000f2', 'f', 'sixth') $$,
  '23514', null, 'a choice letter must be a to e'
);
select throws_ok(
  $$ insert into public.item_answers (item_version_id, choice_id, is_correct, rationale)
     values ('00000000-0000-4000-8000-0000000000f2', 'd', true, 'no such choice') $$,
  '23503', null, 'an answer must belong to a real choice'
);
select throws_ok(
  $$ insert into public.item_versions (item_id, version, stem)
     values ('00000000-0000-4000-8000-0000000000e2', 1, 'same number') $$,
  '23505', null, 'a version number is used once per item'
);
select throws_ok(
  $$ insert into public.item_versions (item_id, version, stem)
     values ('00000000-0000-4000-8000-0000000000e2', 3, E'bad\nstem') $$,
  '23514', null, 'a stem with control characters is refused'
);
select throws_ok(
  $$ delete from public.items where id = '00000000-0000-4000-8000-0000000000e1' $$,
  '23503', null, 'an item with versions cannot be deleted'
);

select * from finish();
rollback;
