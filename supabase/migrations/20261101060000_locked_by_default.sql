-- Locked by default (D-73, D-75).
--
-- Nothing new in the public schema is reachable from the website's roles until a later migration grants it, in the
-- same file that turns on row-level security and adds the policies. Since 30 October 2026 Supabase already gives new
-- tables no grants in new projects (Supabase changelog, "Tables not exposed to Data and GraphQL API automatically");
-- these lines make the same true everywhere this schema runs, including the local database CI tests on, and they also
-- cover sequences and functions.
--
-- Postgres itself lets PUBLIC (every role) run any new function, and a per-schema rule can't take that away (Postgres
-- docs, ALTER DEFAULT PRIVILEGES). So every migration that creates a function also runs
-- `revoke execute on function … from public, anon, authenticated`, and a pgTAP test fails if one is missed.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;
