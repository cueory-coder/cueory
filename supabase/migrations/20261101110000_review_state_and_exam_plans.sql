-- Review state and exam plans (ROADMAP Task 2, D-73, D-87).
--
-- review_state: where each student is with each question for spaced review (about 1, 3, 7 and 14 days, ROADMAP
--   Task 4). One row per student and question: the level (0 to 3, the count of times in a row they knew it, as
--   src/islands/review.ts counts it), the day they last reviewed it and the day it is next due. The student's own
--   device works these out, because only the device knows the student's local calendar day; the database keeps the
--   rows tidy and honest.
-- exam_plans: the student's optional exam date for a course, which the scheduler never plans a review past.
--
-- Both hold only the student's own study progress (CLAUDE.md rule 2) and no answer data: a level and some dates.
-- Each student reads, writes and deletes only their own rows ("forget my progress"); signed-out visitors get nothing.
-- Grants, row-level security and the policies are all in this file, together (D-73). Deleting an account deletes both.

-- ---------------------------------------------------------------- review_state

create table public.review_state (
  -- Filled in with the signed-in student; a student never names a user id, so they can't write for someone else.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  -- How many times in a row the student knew it, 0 to 3 (a miss resets it to 0).
  level smallint not null constraint review_state_level check (level between 0 and 3),
  -- Calendar days, as the student's device counts them.
  last_reviewed date not null,
  next_review date not null,
  constraint review_state_next_after_last check (next_review > last_reviewed),
  constraint review_state_next_within_a_year check (next_review <= last_reviewed + 366),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index review_state_due_idx on public.review_state (user_id, next_review);
create index review_state_item_idx on public.review_state (item_id);

comment on table public.review_state is
  'Spaced-review progress, one row per student and question (D-87). A student reads and writes only their own.';

-- ---------------------------------------------------------------- exam_plans

create table public.exam_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Which course: the same short words the content uses ("med-surg-1").
  course public.slug not null,
  exam_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, course)
);

comment on table public.exam_plans is
  'A student''s optional exam date for a course (D-87). A student reads and writes only their own.';

-- ---------------------------------------------------------------- rules the database checks on every write

-- Shapes that depend on today's date can't be plain check constraints, so one trigger per table checks them.
-- The dates are the student's own calendar days, which can be a day ahead of or behind the database's clock, so each
-- rule has two days of slack.
create function public.review_state_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.last_reviewed > current_date + 2 then
    raise exception 'the last review cannot be in the future' using errcode = '23514';
  end if;
  if new.last_reviewed < current_date - 730 then
    raise exception 'the last review is too long ago to keep' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger review_state_guard
  before insert or update on public.review_state
  for each row execute function public.review_state_guard();

create function public.exam_plans_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.exam_date is distinct from old.exam_date then
    if new.exam_date < current_date - 2 or new.exam_date > current_date + 730 then
      raise exception 'an exam date must be within the next two years' using errcode = '23514';
    end if;
  end if;
  -- A student has a few plans, not thousands: the course name is free text of a safe shape, so the count is capped.
  if tg_op = 'INSERT' and (select count(*) from public.exam_plans p where p.user_id = new.user_id) >= 10 then
    raise exception 'no more than ten exam plans' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger exam_plans_guard
  before insert or update on public.exam_plans
  for each row execute function public.exam_plans_guard();

-- Nobody calls these directly (D-73).
revoke execute on function public.review_state_guard() from public, anon, authenticated;
revoke execute on function public.exam_plans_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------- who may do what

-- A student reads their own rows, adds rows, changes the level and the dates (never which student or which question),
-- and deletes their own ("forget my progress on this device and my account"). The service role does everything
-- (export-my-data, admin). Signed-out visitors get nothing.
grant select on table public.review_state to authenticated;
grant insert (item_id, level, last_reviewed, next_review) on table public.review_state to authenticated;
grant update (level, last_reviewed, next_review) on table public.review_state to authenticated;
grant delete on table public.review_state to authenticated;
grant select, insert, update, delete on table public.review_state to service_role;

grant select on table public.exam_plans to authenticated;
grant insert (course, exam_date) on table public.exam_plans to authenticated;
grant update (exam_date) on table public.exam_plans to authenticated;
grant delete on table public.exam_plans to authenticated;
grant select, insert, update, delete on table public.exam_plans to service_role;

alter table public.review_state enable row level security;
alter table public.exam_plans enable row level security;

create policy "students read their own review state"
  on public.review_state for select to authenticated
  using ((select auth.uid()) = user_id);

-- A row can only be added for a question that is published, which is exactly what the student can already see
-- (the subquery runs with the same row-level security), so a made-up or unpublished id is refused the same way.
create policy "students add their own review state for published questions"
  on public.review_state for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.items i where i.id = review_state.item_id)
  );

create policy "students change their own review state"
  on public.review_state for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "students delete their own review state"
  on public.review_state for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "students read their own exam plans"
  on public.exam_plans for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "students add their own exam plans"
  on public.exam_plans for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "students change their own exam plans"
  on public.exam_plans for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "students delete their own exam plans"
  on public.exam_plans for delete to authenticated
  using ((select auth.uid()) = user_id);
