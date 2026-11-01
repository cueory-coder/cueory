-- Concepts, sources and rights records (D-84): visitors and students read only what is published, nobody on the
-- website can write, and rights records are closed to every website role. Run by `supabase test db` on a throwaway
-- local database; every row below exists only inside this test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- Rows, made as the database owner (which is how migrations and the admin tools write).
insert into public.concepts (id, slug, title, published) values
  ('00000000-0000-4000-8000-0000000000c1', 'sample-shown', 'sample concept, published', true),
  ('00000000-0000-4000-8000-0000000000c2', 'sample-hidden', 'sample concept, not published', false);

insert into public.sources (id, slug, title, publisher, url, license, published) values
  ('00000000-0000-4000-8000-0000000000a1', 'sample-book', 'a sample book', 'sample publisher',
   'https://example.com/book', 'CC BY 4.0', true),
  ('00000000-0000-4000-8000-0000000000a2', 'sample-draft', 'a sample draft', 'sample publisher',
   'https://example.com/draft', 'CC BY 4.0', false);

insert into public.rights_records (id, asset, source_id, holder, license, evidence_url, verified, verified_at) values
  ('00000000-0000-4000-8000-0000000000b1', '/sample/picture.svg', '00000000-0000-4000-8000-0000000000a1',
   'sample holder', 'CC BY 4.0', 'https://example.com/licence', true, now());

-- ---- Who is granted what (the effective access is tested below by really trying it).
select table_privs_are('public', 'concepts', 'anon', array['SELECT'], 'visitors can only read concepts');
select table_privs_are('public', 'concepts', 'authenticated', array['SELECT'], 'students can only read concepts');
select table_privs_are('public', 'sources', 'anon', array['SELECT'], 'visitors can only read sources');
select table_privs_are('public', 'sources', 'authenticated', array['SELECT'], 'students can only read sources');
select table_privs_are('public', 'rights_records', 'anon', array[]::text[], 'visitors have no access to rights records');
select table_privs_are(
  'public', 'rights_records', 'authenticated', array[]::text[], 'students have no access to rights records'
);

-- ---- Signed out.
set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';
set local "request.jwt.claim.sub" to '';

select results_eq(
  $$ select slug::text from public.concepts order by slug $$, $$ values ('sample-shown') $$,
  'visitors see only published concepts'
);
select results_eq(
  $$ select slug::text from public.sources order by slug $$, $$ values ('sample-book') $$,
  'visitors see only published sources'
);
select throws_ok($$ select id from public.rights_records $$, '42501', null, 'visitors cannot read rights records');
select throws_ok(
  $$ insert into public.concepts (slug, title) values ('visitor-concept', 'x') $$,
  '42501', null, 'visitors cannot add a concept'
);
select throws_ok($$ update public.concepts set published = true $$, '42501', null, 'visitors cannot change a concept');
select throws_ok($$ delete from public.sources $$, '42501', null, 'visitors cannot delete a source');

-- ---- Signed in as a student.
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select slug::text from public.concepts order by slug $$, $$ values ('sample-shown') $$,
  'students see only published concepts'
);
select results_eq(
  $$ select slug::text from public.sources order by slug $$, $$ values ('sample-book') $$,
  'students see only published sources'
);
select throws_ok($$ select id from public.rights_records $$, '42501', null, 'students cannot read rights records');
select throws_ok(
  $$ insert into public.concepts (slug, title, published) values ('student-concept', 'x', true) $$,
  '42501', null, 'students cannot add a concept'
);
select throws_ok(
  $$ insert into public.sources (slug, title, publisher, url, license)
     values ('student-source', 'x', 'x', 'https://example.com', 'x') $$,
  '42501', null, 'students cannot add a source'
);
select throws_ok(
  $$ insert into public.rights_records (asset, source_id, holder, license, evidence_url)
     values ('x', '00000000-0000-4000-8000-0000000000a1', 'x', 'x', 'https://example.com') $$,
  '42501', null, 'students cannot add a rights record'
);
select throws_ok($$ update public.sources set published = true $$, '42501', null, 'students cannot change a source');

-- ---- The service role (admin tools and import jobs) can do everything, and it bypasses row-level security.
reset role;
set local role service_role;

select results_eq(
  $$ select count(*)::int from public.concepts $$, $$ values (2) $$,
  'the service role sees unpublished concepts too'
);
select results_eq(
  $$ select count(*)::int from public.rights_records $$, $$ values (1) $$,
  'the service role reads rights records'
);
reset role;

-- ---- Rules every row must follow (checked as the owner, so only the table rules apply).
select throws_ok(
  $$ insert into public.concepts (slug, title) values ('Bad Slug', 'x') $$,
  '23514', null, 'a slug with capitals or spaces is refused'
);
select throws_ok(
  $$ insert into public.concepts (slug, title) values ('-leading-dash', 'x') $$,
  '23514', null, 'a slug starting with a dash is refused'
);
select throws_ok(
  $$ insert into public.concepts (slug, title) values (repeat('a', 81), 'x') $$,
  '23514', null, 'a slug over 80 characters is refused'
);
select throws_ok(
  $$ insert into public.concepts (slug, title) values ('sample-shown', 'duplicate') $$,
  '23505', null, 'two concepts cannot share a slug'
);
select throws_ok(
  $$ insert into public.concepts (slug, title) values ('empty-title', '') $$,
  '23514', null, 'an empty title is refused'
);
select throws_ok(
  $$ insert into public.concepts (slug, title) values ('control-title', E'a\nb') $$,
  '23514', null, 'a title with control characters is refused'
);
select throws_ok(
  $$ insert into public.sources (slug, title, publisher, url, license)
     values ('http-source', 'x', 'x', 'http://example.com', 'x') $$,
  '23514', null, 'a source address must be https'
);
select throws_ok(
  $$ insert into public.sources (slug, title, publisher, url, license)
     values ('script-source', 'x', 'x', 'javascript:alert(1)', 'x') $$,
  '23514', null, 'a source address cannot be a script'
);
select throws_ok(
  $$ insert into public.sources (slug, title, publisher, url, license)
     values ('space-source', 'x', 'x', 'https://example.com/a b', 'x') $$,
  '23514', null, 'a source address cannot contain spaces'
);
select throws_ok(
  $$ insert into public.rights_records (asset, source_id, holder, license, evidence_url)
     values ('x', '00000000-0000-4000-8000-0000000000ff', 'x', 'x', 'https://example.com') $$,
  '23503', null, 'a rights record must point to a real source'
);
select throws_ok(
  $$ insert into public.rights_records (asset, source_id, holder, license, evidence_url, verified)
     values ('x', '00000000-0000-4000-8000-0000000000a1', 'x', 'x', 'https://example.com', true) $$,
  '23514', null, 'a verified rights record must say when it was verified'
);
select throws_ok(
  $$ insert into public.rights_records (asset, source_id, holder, license, evidence_url, verified_at)
     values ('x', '00000000-0000-4000-8000-0000000000a1', 'x', 'x', 'https://example.com', now()) $$,
  '23514', null, 'an unverified rights record cannot carry a verified date'
);
select throws_ok(
  $$ delete from public.sources where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '23503', null, 'a source with a rights record cannot be deleted'
);

select * from finish();
rollback;
