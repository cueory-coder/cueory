-- "Flag or comment" reports and submit_flag (ROADMAP Task 2, D-34, D-73, D-88).
--
-- Every lesson, card, question, puzzle and page gets a "Flag or comment" button. A signed-in student says what is wrong
-- (a wrong fact, a typo, something confusing, something broken, or other), may add a comment, and the page, the item and
-- the item's version are attached. Christian reads the reports in the locked /admin inbox and marks them handled.
--
-- The `flags` table is admin data (CLAUDE.md rule 1): no website role can read or write it, not even a student's own
-- reports. The only way in is submit_flag, which checks everything and limits how many a person can send. Sending one
-- needs a signed-in account: an anonymous report would need a CAPTCHA, and Supabase's (hCaptcha or Cloudflare Turnstile)
-- loads a third-party script, which CLAUDE.md rules out unless Christian makes an exception (D-73). The form tells
-- signed-out visitors a free account is needed and offers hello@cueory.app instead (the lead's note on D-77).
--
-- Grants, row-level security and the policies are all in this file, together (D-73).

create table public.flags (
  id uuid primary key default gen_random_uuid(),
  -- Whose report it is; deleting an account deletes its reports (delete-my-account).
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The page the student was on: a path on this site, never an address on another site.
  page text not null
    constraint flags_page_shape
      check (char_length(page) between 1 and 200 and page ~ '^/[A-Za-z0-9._~/%:@!$&''()*+,;=-]*$' and page !~ '^//'),
  -- The item and version they were looking at, when the page was a question. Both or neither.
  item_id uuid references public.items (id) on delete set null,
  item_version_id uuid references public.item_versions (id) on delete set null,
  reason text not null
    constraint flags_reason check (reason in ('wrong-fact', 'typo', 'confusing', 'broken', 'other')),
  comment text
    constraint flags_comment_length check (char_length(comment) between 1 and 1000)
    constraint flags_comment_printable check (comment !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'),
  -- Christian's inbox: open until he marks it handled.
  status text not null default 'open' constraint flags_status check (status in ('open', 'handled')),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint flags_handled_when check ((status = 'handled') = (handled_at is not null))
);

create index flags_user_time_idx on public.flags (user_id, created_at desc);
create index flags_inbox_idx on public.flags (status, created_at desc);
create index flags_item_idx on public.flags (item_id) where item_id is not null;
create index flags_item_version_idx on public.flags (item_version_id) where item_version_id is not null;

comment on table public.flags is
  '"Flag or comment" reports (D-88). Admin data: no website role has any access; only submit_flag writes.';

-- Nothing for anon or authenticated. The service role (the admin inbox, export-my-data) does everything.
grant select, insert, update, delete on table public.flags to service_role;

alter table public.flags enable row level security;

-- Written down as well as granted away (AGENTS.md: explicit policies), so the rule survives a later grant by mistake.
create policy "no website role reads or writes flags"
  on public.flags
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------- submit_flag

-- security definer with an empty search_path and schema-qualified names (Supabase's "Database Functions" docs). Signed-in
-- students only. Everything is checked before anything is written, and the limits are counted from the table itself.
create function public.submit_flag(
  page text,
  item_id uuid,
  item_version_id uuid,
  reason text,
  comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean_comment text;
  new_id uuid;
  hourly_limit constant integer := 5;
  daily_limit constant integer := 20;
begin
  if uid is null then
    raise exception 'sign in to send a report' using errcode = '28000';
  end if;

  if submit_flag.page is null or char_length(submit_flag.page) not between 1 and 200
     or submit_flag.page !~ '^/[A-Za-z0-9._~/%:@!$&''()*+,;=-]*$' or submit_flag.page ~ '^//' then
    raise exception 'the page must be an address on this site' using errcode = '22023';
  end if;

  if submit_flag.reason is null
     or submit_flag.reason <> all (array['wrong-fact', 'typo', 'confusing', 'broken', 'other']) then
    raise exception 'pick what is wrong from the list' using errcode = '22023';
  end if;

  -- An empty comment is no comment. Trailing and leading spaces are not part of it.
  clean_comment := nullif(btrim(submit_flag.comment), '');
  if clean_comment is not null and (char_length(clean_comment) > 1000 or clean_comment ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]') then
    raise exception 'the comment is up to 1,000 characters of plain text' using errcode = '22023';
  end if;

  -- The item and its version come together, and the version must belong to the item. Every way of getting this wrong
  -- gives the same answer, so a report can't be used to find out which ids exist.
  if (submit_flag.item_id is null) <> (submit_flag.item_version_id is null) then
    raise exception 'that question was not found' using errcode = '22023';
  end if;
  if submit_flag.item_id is not null and not exists (
    select 1 from public.item_versions v
    where v.id = submit_flag.item_version_id and v.item_id = submit_flag.item_id
  ) then
    raise exception 'that question was not found' using errcode = '22023';
  end if;

  -- The limits, per person. The lock keeps two quick calls from both slipping under them.
  perform pg_advisory_xact_lock(hashtextextended('flag:' || uid::text, 0));
  if (select count(*) from public.flags f where f.user_id = uid and f.created_at > now() - interval '1 hour') >= hourly_limit
     or (select count(*) from public.flags f where f.user_id = uid and f.created_at > now() - interval '1 day') >= daily_limit then
    raise exception 'that is a lot of reports; please try again later' using errcode = '54000';
  end if;

  insert into public.flags (user_id, page, item_id, item_version_id, reason, comment)
    values (uid, submit_flag.page, submit_flag.item_id, submit_flag.item_version_id, submit_flag.reason, clean_comment)
    returning id into new_id;
  return new_id;
end;
$$;

comment on function public.submit_flag(text, uuid, uuid, text, text) is
  'Sends a "Flag or comment" report for a signed-in student, after checking and limiting it (D-88).';

-- Nobody can run it until it is granted back by name (D-73), and then only signed-in students.
revoke execute on function public.submit_flag(text, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_flag(text, uuid, uuid, text, text) to authenticated;
