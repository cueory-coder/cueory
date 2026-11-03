-- Two fixes from the security review of the merged database work (Task 302, P2 items 1 and 2).
--
-- 1. delete_my_account needs a recent sign-in.
--    20261102110000_delete_my_account.sql deleted the account for any valid access token, so a token copied from a
--    shared computer or leaked some other way could delete the account for as long as it lasted (an hour by default).
--    Now the token must have been issued in the last 10 minutes: its `iat` claim ("Unix timestamp when the token was
--    issued", Supabase docs, "JWT Claims Reference") must be a number no more than 600 seconds before the database's
--    clock. A missing, non-numeric or older `iat` is refused with 'please sign in again to delete your account'
--    (SQLSTATE 28R01, a code of its own in the "invalid authorization" class, so the page can tell it from a
--    signed-out refusal, 28000). The page then sends the student through sign-in and back to the delete step.
--    What this does not prove: a refreshed access token is a newly issued token, so its `iat` is new too. It narrows
--    the window for a copied access token on its own; it is not proof that the person typed a password just now.
--    Supabase's tokens also carry an `amr` list (sign-in methods with timestamps), which may say when the session
--    last signed in. The docs don't say how a refresh changes it, so it is not used until that is checked on staging.
--
-- 2. One rule for display names.
--    The sign-up trigger (20261102130000_profile_display_name_from_signup.sql) refused only [[:cntrl:]], and the
--    profile page's update_display_name (PR #230) also names U+007F to U+009F, because [[:cntrl:]] depends on the
--    database's locale past ASCII. Neither refused the invisible and direction-changing characters that can make a name
--    look like someone else's or reverse the text around it. public.display_name_ok is now the one check, and the
--    sign-up trigger uses it; update_display_name calls it once PR #230 is changed to (see the PR notes). The browser's
--    checkDisplayName (src/islands/displayname.ts) refuses exactly the same characters. A name is 1 to 50 characters
--    and has none of:
--      - control characters: [[:cntrl:]], and U+0001 to U+001F and U+007F to U+009F named outright;
--      - U+061C, U+200E, U+200F and U+202A to U+202E, U+2066 to U+2069 (direction marks, embeddings, overrides and
--        isolates);
--      - U+200B to U+200D, U+2060 to U+2064 and U+FEFF (zero-width and invisible characters).
--    The profiles table's own checks are unchanged. Until PR #230 removes the students' direct update grant on
--    display_name, a direct update still meets only those older table checks.
--
-- Grants are re-stated here (D-73). security definer functions keep an empty search_path and schema-qualified names
-- (Supabase docs, "Database Functions").

-- ------------------------------------------------------------ display_name_ok

-- Pure and immutable: the same text always gives the same answer, it reads no table, and null is not a name. The
-- caller trims surrounding spaces first (both the browser and the database functions do).
create function public.display_name_ok(name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select name is not null
     and char_length(name) between 1 and 50
     and name !~ '[[:cntrl:]]'
     and name !~ '[\x01-\x1f\x7f-\x9f]'
     and name !~ '[\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]'
$$;

comment on function public.display_name_ok(text) is
  'The one display-name rule: 1 to 50 characters, no control, invisible or direction-changing characters (Task 302).';

-- Only the database's own functions call it, as their owner. The website never runs it.
revoke execute on function public.display_name_ok(text) from public, anon, authenticated;

-- ------------------------------------------------------------ handle_new_user

-- As in 20261102130000, with the shared rule, and surrounding spaces trimmed first as update_display_name does. A name
-- that fails is left empty, so bad sign-up data still never blocks a sign-up. The on_auth_user_created trigger keeps
-- pointing at this function, so it is not recreated.
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
    chosen := btrim(new.raw_user_meta_data ->> 'display_name', ' ');
    if not public.display_name_ok(chosen) then
      chosen := null;
    end if;
  end if;
  insert into public.profiles (id, display_name) values (new.id, chosen);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ------------------------------------------------------------ delete_my_account

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

  -- The token must be from the last 10 minutes. A missing or non-numeric iat counts as too old.
  if jsonb_typeof(claims -> 'iat') is distinct from 'number'
     or (claims ->> 'iat')::numeric < extract(epoch from now()) - max_age_seconds then
    raise exception 'please sign in again to delete your account' using errcode = '28R01';
  end if;

  -- The cascade removes the student's rows in every table that references auth.users, in this one statement.
  delete from auth.users u where u.id = uid;
end;
$$;

comment on function public.delete_my_account() is
  'Deletes the signed-in student''s own account and every row Cueory keeps about them; needs a token from the last 10 minutes (Tasks 60, 302).';

revoke execute on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
