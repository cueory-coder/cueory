-- delete_my_account (ROADMAP Task 2, Task 60, CLAUDE.md rule 2, D-73).
--
-- A signed-in student deletes their own account, and with it everything Cueory keeps about them. It takes no
-- arguments: the account is always the caller's own (auth.uid()), so nobody can name someone else's. Signed out, it
-- refuses before doing anything.
--
-- How the rows go: the function deletes the student's auth.users row, and every table that holds a student's rows
-- references auth.users (id) on delete cascade, so Postgres deletes them in the same statement, all or nothing:
--   profiles (id), attempts, review_state, exam_plans, flags (the reports they sent) and study_events (user_id).
-- Supabase's docs ("User Management": "Deleting users" and "Accessing user data via API") say to reference auth.users
-- with `on delete cascade`, and that removing the auth.users row also removes the account's sessions, so the student
-- can't get new access tokens. delete_my_account_test.sql fails if any foreign key to auth.users stops cascading, so
-- a later table that forgets it can't leave a student's rows behind.
--
-- What it does not do: an access token already issued stays valid until it expires (same docs, "Removing account
-- access"), so the page signs the student out on this device straight after. Supabase also refuses to delete a user
-- who owns Storage objects; Cueory stores no files for students, so none exist. If that ever changes, the call fails
-- and deletes nothing, rather than leaving files behind.
--
-- Calling it again after the account is gone is safe: there is nothing left to delete, and it returns normally.
--
-- security definer with an empty search_path and schema-qualified names (Supabase docs, "Database Functions"): it runs
-- as its owner, postgres, because no website role may touch auth.users. Only signed-in students may run it.

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'sign in to delete your account' using errcode = '28000';
  end if;

  -- The cascade removes the student's rows in every table above, in this one statement.
  delete from auth.users u where u.id = uid;
end;
$$;

comment on function public.delete_my_account() is
  'Deletes the signed-in student''s own account and, through the cascade, every row Cueory keeps about them (Task 60).';

-- Nobody can run it until it is granted back by name (D-73), and then only signed-in students.
revoke execute on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
