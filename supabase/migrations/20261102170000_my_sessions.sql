-- my_sessions (Task 309): a signed-in student's own sign-in sessions, for export-my-data (CLAUDE.md rule 2).
--
-- Supabase Auth keeps one auth.sessions row per sign-in, with the browser's user agent and IP address, until the
-- student signs out (Supabase docs, "User sessions"; supabase/auth migration
-- 20231027141322_add_session_refresh_columns). The browser can't read auth.sessions, so the export reads the
-- student's own rows through this function. It returns only the caller's rows and only these columns: never a refresh
-- token, a factor or any other account's session. The IP address comes back as plain text, without the /32 mask.
--
-- security definer with an empty search_path and schema-qualified names (Supabase docs, "Database Functions"). It runs
-- as its owner, postgres, which Supabase Auth lets read auth.sessions (supabase/auth migration
-- 20240612123726_enable_rls_update_grants). Signed-out visitors can't run it, and auth.uid() limits the rows to the
-- caller's own. A verified TOTP user also needs an aal2 JWT, even if someone calls the RPC directly instead of
-- using the browser's MFA screen. An unfinished enrollment alone never locks the account out. Grants are in this file,
-- together (D-73).

create function public.my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  not_after timestamptz,
  user_agent text,
  ip text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.created_at, s.updated_at, s.not_after, s.user_agent, host(s.ip)
  from auth.sessions s
  where s.user_id = (select auth.uid())
    and coalesce(
      case when exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      ) then (select auth.jwt() ->> 'aal') = 'aal2'
      else coalesce((select auth.jwt() ->> 'aal'), 'aal1') in ('aal1', 'aal2')
      end,
      false
    )
  order by s.created_at, s.id;
$$;

comment on function public.my_sessions() is
  'A signed-in student''s own sessions: timestamps, browser and IP, with opt-in verified-factor MFA enforcement (Task 309).';

revoke execute on function public.my_sessions() from public, anon, authenticated;
grant execute on function public.my_sessions() to authenticated;
