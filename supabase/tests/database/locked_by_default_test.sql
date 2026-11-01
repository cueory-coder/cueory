-- The database stays locked by default (D-73, D-77). Run by `supabase test db` (Supabase docs, "Testing Your
-- Database"): a throwaway local database, so no real keys and no real data.
begin;
create extension if not exists pgtap with schema extensions;
-- Migrations run as postgres, so the probes below are made as postgres too.
set local role postgres;
select plan(7);

-- What signed-out visitors (anon) can actually do to each table, view and sequence in public. These are effective
-- privileges, so grants that reach anon through PUBLIC or another role count too, not only grants made to anon by name
-- (security review of #76).
create temporary view anon_reach as
  select 'public.' || c.relname as relation, p.privilege
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'))
    as p (privilege)
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and (has_table_privilege('anon', c.oid, p.privilege)
         or (p.privilege in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
             and has_any_column_privilege('anon', c.oid, p.privilege)))
  union all
  select 'public.' || c.relname, p.privilege
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) as p (privilege)
  where n.nspname = 'public' and c.relkind = 'S' and has_sequence_privilege('anon', c.oid, p.privilege);

-- What the website (anon or authenticated) can run in public, also as effective privileges. The allowed list is empty
-- for now: check_answer and submit_flag join it when they exist.
create temporary view website_functions as
  select 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as function
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute'))
    and p.proname <> all (array[]::name[]);

select is_empty(
  $$ select c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table in public has row-level security'
);

select is_empty(
  $$ select relation || ': ' || privilege from anon_reach $$,
  'signed-out visitors (anon) can do nothing to any table, view or sequence in public'
);

select is_empty(
  $$ select function from website_functions $$,
  'no function in public can be run from the website unless it is on the allowed list'
);

-- The two checks above catch access that comes only through PUBLIC.
create table public.public_grant_probe (id int primary key);
alter table public.public_grant_probe enable row level security;
grant select on table public.public_grant_probe to public;

select isnt_empty(
  $$ select relation from anon_reach where relation = 'public.public_grant_probe' $$,
  'a table that only PUBLIC may read still counts as reachable by anon'
);

create function public.public_execute_probe() returns int language sql as $$ select 1 $$;

select isnt_empty(
  $$ select function from website_functions where function = 'public.public_execute_probe()' $$,
  'a function that PUBLIC may still run counts as callable from the website'
);

-- A table made later starts with nothing granted, until its own migration grants it.
create table public.lockdown_probe (id bigint generated always as identity primary key);

select ok(
  not exists (
    select 1
    from (values ('anon'), ('authenticated'), ('service_role')) as r (role)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'))
      as p (privilege)
    where has_table_privilege(r.role, 'public.lockdown_probe', p.privilege)
  ),
  'a new table in public starts with no privileges for anon, authenticated or service_role'
);

select ok(
  not has_sequence_privilege('anon', 'public.lockdown_probe_id_seq', 'usage')
    and not has_sequence_privilege('authenticated', 'public.lockdown_probe_id_seq', 'usage'),
  'a new sequence in public starts with no privileges for anon or authenticated'
);

select * from finish();
rollback;
