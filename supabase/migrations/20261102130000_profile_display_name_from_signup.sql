-- Copy the display name chosen at email sign-up into the profile (Task 170; privacy audit of Tasks 142 and 167).
--
-- Email sign-up sends the name the student typed as Supabase user metadata (`options.data.display_name` in
-- src/islands/signin.ts), which Supabase keeps in auth.users.raw_user_meta_data. handle_new_user
-- (20261101060100_profiles.sql) wrote only the id, so the name never reached profiles, and export-my-data, which reads
-- profiles, left it out.
--
-- This version copies the name only when it is a JSON string that passes the profiles checks exactly: 1 to 50
-- characters and no control characters. Anything else (missing, not a string, empty, too long, control characters)
-- leaves the name empty, as before, so bad sign-up data still can never make the insert fail and block a sign-up.
-- Google sign-in sends no display_name, so a Google account's profile stays empty too. Same rules as before:
-- security definer with an empty search_path and schema-qualified names, and nobody may call it directly. The
-- on_auth_user_created trigger keeps pointing at this function, so it is not recreated.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chosen text;
begin
  if jsonb_typeof(new.raw_user_meta_data -> 'display_name') = 'string' then
    chosen := new.raw_user_meta_data ->> 'display_name';
    -- The profiles_display_name_length and profiles_display_name_printable checks, word for word.
    if not (char_length(chosen) between 1 and 50) or chosen ~ '[[:cntrl:]]' then
      chosen := null;
    end if;
  end if;
  insert into public.profiles (id, display_name) values (new.id, chosen);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
