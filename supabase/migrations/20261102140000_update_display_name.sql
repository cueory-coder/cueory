-- Display-name changes go through update_display_name, with a per-account limit (Task 59, Codex P0 on #230).
--
-- The /account page lets a signed-in student change their display name. A direct column update had no server-side
-- limit, and CLAUDE.md rule 1 asks for rate limits on every form. So students lose the direct `update (display_name)`
-- grant from 20261101060100_profiles.sql, and the only way to change the name is this function: it checks the name with
-- the same rules as the profiles table, changes only the caller's own row, and allows a few changes an hour.
--
-- The limit uses submit_flag's pattern (20261101120000_flags_and_submit_flag.sql): a per-person advisory lock, then a
-- check against the limit. Profiles keep no history, so the count lives on the student's own profile row in two fixed
-- fields: when the current hour of name changes began, and how many changes were made in it. A change more than an
-- hour after the window began starts a new window. The fields are overwritten, never pile up, are deleted with the
-- profile, and are part of export-my-data (exportload.ts reads them with the rest of the profile).
--
-- Grants are in this file and in 20261101060100_profiles.sql (D-73).

alter table public.profiles
  add column name_change_window_start timestamptz,
  add column name_changes_in_window smallint not null default 0
    constraint profiles_name_changes_in_window_range check (name_changes_in_window between 0 and 10);

comment on column public.profiles.name_change_window_start is
  'When the current hour of display-name changes began (null until the first change). Written only by update_display_name.';
comment on column public.profiles.name_changes_in_window is
  'How many display-name changes were made since name_change_window_start. Written only by update_display_name.';

-- Students keep reading their own row (the table-wide select grant, for the page and export-my-data) but can no longer
-- write any column: update_display_name below is now the only way to change the name, and the two new columns get no
-- insert or update grant.
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
  window_start timestamptz;
  changes integer;
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
  select p.name_change_window_start, p.name_changes_in_window into window_start, changes
    from public.profiles p where p.id = uid;
  if not found then
    raise exception 'your profile was not found' using errcode = 'P0002';
  end if;

  if window_start is null or window_start <= now() - interval '1 hour' then
    -- No changes in the last hour: this one starts a new window.
    window_start := now();
    changes := 1;
  elsif changes >= hourly_limit then
    raise exception 'that is a lot of name changes; please try again later' using errcode = '54000';
  else
    changes := changes + 1;
  end if;

  update public.profiles p
    set display_name = clean_name, name_change_window_start = window_start, name_changes_in_window = changes
    where p.id = uid;
  return clean_name;
end;
$$;

comment on function public.update_display_name(text) is
  'Changes the signed-in student''s own display name, after checking and limiting it (Task 59).';

-- Nobody can run it until it is granted back by name (D-73), and then only signed-in students.
revoke execute on function public.update_display_name(text) from public, anon, authenticated;
grant execute on function public.update_display_name(text) to authenticated;
