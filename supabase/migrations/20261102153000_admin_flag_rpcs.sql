-- The admin check and the flag-inbox functions for /admin/flags (Task 65, D-73, D-88).
--
-- Christian reads "Flag or comment" reports and marks them handled or reopens them. The `flags` table stays closed to
-- every website role (D-88): these three functions are the only way the website reaches it, and each one first checks
-- `public.is_admin()`, which is true only for an account listed in `public.admins` whose current sign-in used a second
-- factor (aal2).
--
-- Supabase docs read first (2 Nov 2026):
--   - Row Level Security, https://supabase.com/docs/guides/database/postgres/row-level-security : name the role with
--     `to`; wrap `auth.uid()` and `auth.jwt()` in a select; "a JWT is not always up-to-date"; `raw_user_meta_data` "is
--     not a good place to store authorization data"; set `search_path = ''` on every security definer function; a
--     security definer function in an exposed schema "is callable over the Data API with the creator's privileges".
--   - Database Functions, https://supabase.com/docs/guides/database/functions : "Prefer security invoker"; with
--     security definer "you must set the search_path"; any role can run a function until execute is revoked.
--   - Multi-Factor Authentication, https://supabase.com/docs/guides/auth/auth-mfa : the assurance level "is encoded in
--     the `aal` claim in the JWT"; "JWTs without an `aal` claim are at the `aal1` level"; the check is
--     `(select auth.jwt()->>'aal') = 'aal2'`; unenrolling a factor drops a session to aal1 only after the token refreshes.
--   - PostgREST errors, https://docs.postgrest.org/en/v14/references/errors.html : error 42501 is HTTP 403 for a signed-in
--     caller and 401 for a signed-out one; 22023 is HTTP 400.
--
-- How an account is marked admin: a row in `public.admins`, which no website role and not even the service role can
-- read or write. Only the database owner can, which means a migration or the Supabase SQL editor. Chosen over
-- `raw_app_meta_data` (which the docs also call safe, because users can't change it) because:
--   - the service role can set app_metadata through the Auth admin API, so any server job holding the secret key could
--     make an admin; here it can't;
--   - removing the row takes effect on the next call, while the app_metadata copy in a JWT is stale until it refreshes;
--   - nothing is written into Supabase's own `auth` schema.
-- No migration ever inserts a row and no email is in this repository (D-75). Christian adds himself once, after signing
-- in to the site at least once, by running this one line in the project's SQL editor with his own sign-in email in
-- place of YOUR-EMAIL (it answers with one row, his account id; no row means the email didn't match an account):
--   insert into public.admins (user_id) select id from auth.users where email = 'YOUR-EMAIL' returning user_id;
-- To remove an admin: delete from public.admins where user_id = '<the id>';
--
-- Grants, row-level security and the policies are all in this file, together (D-73).

-- ---------------------------------------------------------------------- admins

create table public.admins (
  -- Deleting the account removes it from this list.
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.admins is
  'Accounts allowed into /admin (Task 65). No grants to any role: only the database owner (SQL editor) adds or removes a row.';

-- No grant to anyone, the service role included. Said again here in case a project's defaults differ (D-77).
revoke all on table public.admins from public, anon, authenticated, service_role;

alter table public.admins enable row level security;

-- Written down as well as granted away, so the rule survives a later grant by mistake (as for flags, D-88).
create policy "no website role reads or writes admins"
  on public.admins
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- -------------------------------------------------------------------- is_admin

-- True only when the caller is a signed-in user (role claim `authenticated`, so a service or anon context carrying
-- copied claims never counts) whose account is in public.admins AND whose session used a second factor. Security invoker (the
-- docs' default) and run by no website role: it adds no rights of its own and is only called from inside the security
-- definer functions below, which run as the owner and so can read public.admins. A missing `aal` claim is aal1.
create function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select auth.role()) = 'authenticated', false)
     and coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
     and exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

comment on function public.is_admin() is
  'True for an account in public.admins signed in with two-factor (JWT aal = aal2). Used inside the admin functions (Task 65).';

revoke execute on function public.is_admin() from public, anon, authenticated, service_role;

-- ------------------------------------------------------------- admin_list_flags

-- One page of reports with one status, newest first, with every field the /admin/flags inbox shows (Task 66 groups
-- them by question in the browser). `flag_status` is 'open' or 'handled' (not `status`, which names the returned
-- column). `max_rows` is 1 to 200 (default 100). For the next page, pass the created_at and id
-- of the last row as `before_created_at` and `before_id`, both or neither.
create function public.admin_list_flags(
  flag_status text,
  max_rows integer default 100,
  before_created_at timestamptz default null,
  before_id uuid default null
)
returns table (
  id uuid,
  user_id uuid,
  page text,
  item_id uuid,
  item_version_id uuid,
  reason text,
  comment text,
  status text,
  created_at timestamptz,
  handled_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only the site owner, signed in with two-factor, can do this' using errcode = '42501';
  end if;

  if admin_list_flags.flag_status is null or admin_list_flags.flag_status <> all (array['open', 'handled']) then
    raise exception 'show open or handled reports' using errcode = '22023';
  end if;
  if admin_list_flags.max_rows is null or admin_list_flags.max_rows not between 1 and 200 then
    raise exception 'ask for between 1 and 200 reports' using errcode = '22023';
  end if;
  if (admin_list_flags.before_created_at is null) <> (admin_list_flags.before_id is null) then
    raise exception 'the next page needs the time and the id of the last report' using errcode = '22023';
  end if;

  return query
    select f.id, f.user_id, f.page, f.item_id, f.item_version_id, f.reason, f.comment, f.status, f.created_at,
           f.handled_at
    from public.flags f
    where f.status = admin_list_flags.flag_status
      and (admin_list_flags.before_created_at is null
           or (f.created_at, f.id) < (admin_list_flags.before_created_at, admin_list_flags.before_id))
    order by f.created_at desc, f.id desc
    limit admin_list_flags.max_rows;
end;
$$;

comment on function public.admin_list_flags(text, integer, timestamptz, uuid) is
  'One page of "Flag or comment" reports for the admin inbox, newest first; admin with two-factor only (Task 65).';

revoke execute on function public.admin_list_flags(text, integer, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.admin_list_flags(text, integer, timestamptz, uuid) to authenticated;

-- ------------------------------------------------------- admin_mark_flag_handled

-- Marks one report handled and answers with its handled time. Marking it again changes nothing and gives the same time.
create function public.admin_mark_flag_handled(flag_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored timestamptz;
begin
  if not public.is_admin() then
    raise exception 'only the site owner, signed in with two-factor, can do this' using errcode = '42501';
  end if;

  update public.flags f
    set status = 'handled', handled_at = coalesce(f.handled_at, now())
    where f.id = admin_mark_flag_handled.flag_id
    returning f.handled_at into stored;
  if not found then
    raise exception 'that report was not found' using errcode = '22023';
  end if;
  return stored;
end;
$$;

comment on function public.admin_mark_flag_handled(uuid) is
  'Marks a "Flag or comment" report handled and returns when; admin with two-factor only (Task 65).';

revoke execute on function public.admin_mark_flag_handled(uuid) from public, anon, authenticated;
grant execute on function public.admin_mark_flag_handled(uuid) to authenticated;

-- ------------------------------------------------------------- admin_reopen_flag

-- Puts a handled report back in the open list. Reopening an open report changes nothing.
create function public.admin_reopen_flag(flag_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only the site owner, signed in with two-factor, can do this' using errcode = '42501';
  end if;

  update public.flags f
    set status = 'open', handled_at = null
    where f.id = admin_reopen_flag.flag_id;
  if not found then
    raise exception 'that report was not found' using errcode = '22023';
  end if;
end;
$$;

comment on function public.admin_reopen_flag(uuid) is
  'Puts a handled "Flag or comment" report back in the open list; admin with two-factor only (Task 65).';

revoke execute on function public.admin_reopen_flag(uuid) from public, anon, authenticated;
grant execute on function public.admin_reopen_flag(uuid) to authenticated;
