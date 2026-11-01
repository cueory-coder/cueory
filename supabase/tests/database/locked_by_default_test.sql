-- The database stays locked by default (D-73, D-75). Run by `supabase test db` (Supabase docs, "Testing Your
-- Database"): a throwaway local database, so no real keys and no real data.
begin;
create extension if not exists pgtap with schema extensions;
-- Migrations run as postgres, so the probes below are made as postgres too.
set local role postgres;
select plan(5);

select is_empty(
  $$ select c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table in public has row-level security'
);

select is_empty(
  $$ select table_name || ': ' || privilege_type
     from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'anon' $$,
  'signed-out visitors (anon) have no privileges on any table in public'
);

-- The functions the website may call, by name. None yet: check_answer and submit_flag join this list when they exist.
select is_empty(
  $$ select p.oid::regprocedure::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (has_function_privilege('anon', p.oid, 'execute')
            or has_function_privilege('authenticated', p.oid, 'execute'))
       and p.proname <> all (array[]::name[]) $$,
  'no function in public can be run from the website unless it is on the allowed list'
);

-- A table made later starts with nothing granted, until its own migration grants it.
create table public.lockdown_probe (id bigint generated always as identity primary key);

select is_empty(
  $$ select grantee || ': ' || privilege_type
     from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'lockdown_probe'
       and grantee in ('anon', 'authenticated', 'service_role') $$,
  'a new table in public starts with no grants for anon, authenticated or service_role'
);

select ok(
  not has_sequence_privilege('anon', 'public.lockdown_probe_id_seq', 'usage')
    and not has_sequence_privilege('authenticated', 'public.lockdown_probe_id_seq', 'usage'),
  'a new sequence in public starts with no grants for anon or authenticated'
);

select * from finish();
rollback;
