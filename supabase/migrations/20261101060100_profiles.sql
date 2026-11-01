-- Student profiles (ROADMAP Task 2, D-73, D-77).
--
-- One row per account, made when the account is created. It holds only what CLAUDE.md allows about a person: the
-- display name for now (the email stays in Supabase's own auth.users). Onboarding answers join later, with the
-- onboarding pages. Grants, row-level security and the policies are all here, together.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Chosen by the student. Empty until they pick one; 1 to 50 characters, no control characters.
  display_name text
    constraint profiles_display_name_length check (char_length(display_name) between 1 and 50)
    constraint profiles_display_name_printable check (display_name !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per student account (D-77). Only the display name; the email stays in auth.users.';

-- Who may do what. A student reads their own row and changes only their display name; signed-out visitors get nothing;
-- the service role (server-side jobs such as delete-my-account) may do everything, and it bypasses row-level security.
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

alter table public.profiles enable row level security;

create policy "students read their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "students update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- A new account gets its profile row at once (Supabase docs, "User Management"). It writes only the id, so bad sign-up
-- data can never make it fail and block a sign-up. security definer with an empty search_path and schema-qualified
-- names, as Supabase's docs require; nobody may call it directly.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
