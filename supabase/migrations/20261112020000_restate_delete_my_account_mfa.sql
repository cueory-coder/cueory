-- Staging catch-up: put the two-factor check back into delete_my_account (security review, 2026-11-11).
--
-- What was found. The repository's 20261104170500_enforce_opt_in_mfa.sql adds the two-factor check to
-- delete_my_account, but the copy of that migration recorded on the hosted cueory-staging database does not contain
-- this function at all, so staging still runs the older definition from 20261102160000 (recent sign-in only, no
-- two-factor check). Every other function on staging matches this repository. Checked read-only on 2026-11-11 by
-- comparing each function body in pg_proc with the latest definition in supabase/migrations.
--
-- Why it matters. On staging, an account that turned two-factor on could still be deleted with a session that never
-- entered its code. No student data is at risk today (staging has no accounts and production has no tables yet).
--
-- What this file does. It states the already-reviewed definition again, unchanged, so it is safe everywhere:
--   - on staging it replaces the older definition;
--   - on a fresh database (production), 20261104170500 has already created exactly this function, so nothing changes.
-- The function body below is copied character for character from 20261104170500_enforce_opt_in_mfa.sql.
-- Grants are re-stated (D-73).
--
-- Founder-held: this is a database authorization change. Not applied anywhere by this merge request.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  claims jsonb := coalesce((select auth.jwt()), '{}'::jsonb);
  max_age_seconds constant integer := 600;
begin
  if uid is null then
    raise exception 'sign in to delete your account' using errcode = '28000';
  end if;

  -- A verified second factor makes an aal1 bearer token insufficient, even for this RPC.
  if not (select app_private.mfa_access_allowed()) then
    raise exception 'complete two-factor sign-in to continue' using errcode = '28000';
  end if;

  -- Keep Task 302's short-lived-token check after the MFA authorization gate.
  if jsonb_typeof(claims -> 'iat') is distinct from 'number'
     or (claims ->> 'iat')::numeric < extract(epoch from now()) - max_age_seconds then
    raise exception 'please sign in again to delete your account' using errcode = '28R01';
  end if;

  -- The cascade removes the student's rows in every table above, in this one statement.
  delete from auth.users u where u.id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
