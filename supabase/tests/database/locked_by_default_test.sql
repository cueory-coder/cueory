-- The database stays locked by default (D-73, D-77). Run by `supabase test db` (Supabase docs, "Testing Your
-- Database"): a throwaway local database, so no real keys and no real data.
begin;
create extension if not exists pgtap with schema extensions;
-- Migrations run as postgres, so the probes below are made as postgres too.
set local role postgres;
select plan(10);

-- Every table privilege this Postgres has. PostgreSQL 17 added MAINTAIN, and the local database is PostgreSQL 17
-- (supabase/config.toml); the check also runs on older versions, without it (security review of #76).
create temporary table table_privileges (privilege text primary key);
insert into table_privileges
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER');
insert into table_privileges
  select 'MAINTAIN' where current_setting('server_version_num')::int >= 170000;

-- What signed-out visitors (anon) can actually do to each table, view and sequence in public. These are effective
-- privileges, so grants that reach anon through PUBLIC or another role count too, not only grants made to anon by name
-- (security review of #76).
create temporary view anon_reach as
  select 'public.' || c.relname as relation, p.privilege
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join table_privileges p
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

-- What the website (anon or authenticated) can run in public, also as effective privileges. Only the functions on the
-- allowed list: check_answer (D-86) and submit_flag (D-88). Each gets its own test file for who may run it.
create temporary view website_functions as
  select 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as function
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute'))
    and p.proname <> all (array['check_answer', 'submit_flag']::name[]);

select is_empty(
  $$ select c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table in public has row-level security'
);

-- The only things signed-out visitors may do: read the published rows of the public-content tables. Each table here is
-- row-level secured by a policy that shows published rows only (their own test files check that). A later migration
-- that makes another table readable adds one line to this list, and a reviewer has to see it.
create temporary table anon_may_read (relation text primary key);
insert into anon_may_read values
  ('public.concepts'), ('public.sources'), ('public.items'), ('public.item_versions'), ('public.item_choices');

select is_empty(
  $$ select relation || ': ' || privilege from anon_reach
     where not (privilege = 'SELECT' and relation in (select relation from anon_may_read)) $$,
  'signed-out visitors (anon) can do nothing to any table, view or sequence in public, except read the listed public-content tables'
);

select is_empty(
  $$ select function from website_functions $$,
  'no function in public can be run from the website unless it is on the allowed list'
);

select is_empty(
  $$ select r.relation || ': ' || a.privilege
     from anon_may_read r join anon_reach a on a.relation = r.relation
     where a.privilege <> 'SELECT' $$,
  'the public-content tables give signed-out visitors nothing but SELECT'
);

-- Every security definer function in public pins an empty search_path (Supabase docs, "Database Functions"), so a
-- caller can't make it run their own objects.
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and not coalesce(p.proconfig @> array['search_path=""'], false) $$,
  'every security definer function in public has an empty search_path'
);

-- The two checks above catch access that comes only through PUBLIC.
create table public.public_grant_probe (id int primary key);
alter table public.public_grant_probe enable row level security;
grant select on table public.public_grant_probe to public;

select isnt_empty(
  $$ select relation from anon_reach where relation = 'public.public_grant_probe' $$,
  'a table that only PUBLIC may read still counts as reachable by anon'
);

create table public.maintain_probe (id int primary key);
alter table public.maintain_probe enable row level security;
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'grant maintain on table public.maintain_probe to public';
  end if;
end
$$;

select case
  when current_setting('server_version_num')::int >= 170000 then
    isnt_empty(
      $q$ select relation from anon_reach where relation = 'public.maintain_probe' and privilege = 'MAINTAIN' $q$,
      'a table that only PUBLIC may maintain still counts as reachable by anon'
    )
  else skip('MAINTAIN is new in PostgreSQL 17', 1)
end;

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
    cross join table_privileges p
    where has_table_privilege(r.role, 'public.lockdown_probe', p.privilege)
  ),
  'a new table in public starts with no privileges for anon, authenticated or service_role'
);

select ok(
  not exists (
    select 1
    from (values ('anon'), ('authenticated'), ('service_role')) as r (role)
    cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) as p (privilege)
    where has_sequence_privilege(r.role, 'public.lockdown_probe_id_seq', p.privilege)
  ),
  'a new sequence in public starts with no privileges for anon, authenticated or service_role'
);

select * from finish();
rollback;
