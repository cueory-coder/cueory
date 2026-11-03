-- Display-name changes go through update_display_name, with a per-account limit (Task 59, Codex P0 on #230).
--
-- The /account page lets a signed-in student change their display name. A direct column update had no server-side
-- limit, and CLAUDE.md rule 1 asks for rate limits on every form. So students lose the direct `update (display_name)`
-- grant from 20261101060100_profiles.sql, and the only way to change the name is this function: it checks the name with
-- the same rules as the profiles table, changes only the caller's own row, and allows a few changes an hour.
--
-- The limit is counted the way submit_flag counts reports (20261101120000_flags_and_submit_flag.sql): a per-person
-- advisory lock, then a count over the last hour. Profiles keep no history, so each change is noted in
-- display_name_changes: the account and the time, nothing else. Notes older than an hour are deleted on every call,
-- and deleting an account deletes its notes. The table is closed to every website role, like flags.
--
-- Grants, row-level security and the policies are all in this file, together (D-73).

create table public.display_name_changes (
  -- Whose change it was; deleting an account deletes its notes (delete-my-account).
  user_id uuid not null references auth.users (id) on delete cascade,
  changed_at timestamptz not null default now()
);

create index display_name_changes_user_time_idx on public.display_name_changes (user_id, changed_at desc);

comment on table public.display_name_changes is
  'When each display-name change happened, for the last hour only, so update_display_name can limit changes.';

-- Nothing for anon or authenticated: only update_display_name reads and writes it. The service role does everything.
grant select, insert, update, delete on table public.display_name_changes to service_role;

alter table public.display_name_changes enable row level security;

-- Written down as well as granted away (AGENTS.md: explicit policies), so the rule survives a later grant by mistake.
create policy "no website role reads or writes display name changes"
  on public.display_name_changes
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- The function below is now the only way a student changes their display name.
revoke update (display_name) on table public.profiles from authenticated;

-- ------------------------------------------------------------ update_display_name

-- security definer with an empty search_path and schema-qualified names (Supabase's "Database Functions" docs). Signed-in
-- students only. The name is checked before anything is written, and it returns the name as saved.
create function public.update_display_name(new_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean_name text;
  hourly_limit constant integer := 10;
begin
  if uid is null then
    raise exception 'sign in to change your display name' using errcode = '28000';
  end if;

  -- Leading and trailing spaces are not part of the name (the browser's checkDisplayName trims them the same way).
  -- Then the profiles table's own rules: 1 to 50 characters, no control characters. [[:cntrl:]] depends on the
  -- database's locale for characters past ASCII, so the ranges the browser refuses (U+0001-U+001F, U+007F-U+009F) are
  -- also named outright.
  clean_name := btrim(update_display_name.new_name, ' ');
  if clean_name is null or char_length(clean_name) not between 1 and 50
     or clean_name ~ '[[:cntrl:]]' or clean_name ~ '[\x01-\x1f\x7f-\x9f]' then
    raise exception 'a display name is 1 to 50 characters of plain text' using errcode = '22023';
  end if;

  -- The limit, per person. The lock keeps two quick calls from both slipping under it.
  perform pg_advisory_xact_lock(hashtextextended('display-name:' || uid::text, 0));
  delete from public.display_name_changes c where c.changed_at <= now() - interval '1 hour';
  if (select count(*) from public.display_name_changes c where c.user_id = uid) >= hourly_limit then
    raise exception 'that is a lot of name changes; please try again later' using errcode = '54000';
  end if;

  update public.profiles p set display_name = clean_name where p.id = uid;
  if not found then
    raise exception 'your profile was not found' using errcode = 'P0002';
  end if;

  insert into public.display_name_changes (user_id) values (uid);
  return clean_name;
end;
$$;

comment on function public.update_display_name(text) is
  'Changes the signed-in student''s own display name, after checking and limiting it (Task 59).';

-- Nobody can run it until it is granted back by name (D-73), and then only signed-in students.
revoke execute on function public.update_display_name(text) from public, anon, authenticated;
grant execute on function public.update_display_name(text) to authenticated;
